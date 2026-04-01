/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 * This file is part of TaktX, licensed under the TaktX Business Source License v1.0.
 * Free use is permitted with up to 3 Kafka partitions per topic. See LICENSE file for details.
 * For commercial use or more partitions and features, contact [https://www.taktx.io/contact].
 */

package io.taktx.console.ingester.inmemory.metrics;

import io.taktx.dto.ExecutionState;
import io.taktx.dto.ProcessDefinitionKey;
import jakarta.enterprise.context.ApplicationScoped;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import lombok.extern.slf4j.Slf4j;

/**
 * Aggregates process instance state counts at multiple levels: - Per version (ProcessDefinitionKey
 * -> ExecutionState -> count) - Per definition (processDefinitionId -> ExecutionState -> count) -
 * derived on read - Global (all definitions aggregated) - derived on read
 */
@Slf4j
@ApplicationScoped
public class ProcessInstanceStateAggregator {

  // Single source of truth: per-version instance counts
  private final Map<ProcessDefinitionKey, Map<ExecutionState, AtomicInteger>> perVersionCounts =
      new ConcurrentHashMap<>();

  // Track incidents separately (an instance can be ACTIVE and have an incident)
  private final Map<ProcessDefinitionKey, AtomicInteger> perVersionIncidentCounts =
      new ConcurrentHashMap<>();

  private final Map<UUID, InstanceAggregateState> perInstanceStates = new ConcurrentHashMap<>();

  /**
   * Record a state transition for a process instance. Atomically decrements old state and
   * increments new state.
   *
   * @param key The process definition key
   * @param oldState The previous state (null for new instances)
   * @param newState The new state
   */
  public void recordStateTransition(
      ProcessDefinitionKey key, ExecutionState oldState, ExecutionState newState) {
    recordStateTransition(null, key, oldState, newState);
  }

  public void recordStateTransition(
      UUID processInstanceId,
      ProcessDefinitionKey key,
      ExecutionState oldState,
      ExecutionState newState) {

    if (newState == null) {
      log.warn("Attempted to record null newState for {}", key);
      return;
    }

    Map<ExecutionState, AtomicInteger> stateCounts =
        perVersionCounts.computeIfAbsent(key, k -> new ConcurrentHashMap<>());

    // Decrement old state (if not null)
    if (oldState != null) {
      AtomicInteger oldCounter = stateCounts.get(oldState);
      if (oldCounter != null) {
        // Ensure counter doesn't go below 0
        oldCounter.updateAndGet(current -> Math.max(0, current - 1));
      }
    }

    // Increment new state
    stateCounts.computeIfAbsent(newState, s -> new AtomicInteger(0)).incrementAndGet();

    if (processInstanceId != null) {
      perInstanceStates.compute(
          processInstanceId,
          (ignored, existingState) ->
              new InstanceAggregateState(
                  key, newState, existingState != null && existingState.hasIncident()));
    }

    if (log.isDebugEnabled()) {
      log.debug(
          "State transition for {}: {} -> {} (counts: {})",
          key,
          oldState,
          newState,
          getVersionSnapshot(key));
    }
  }

  /**
   * Record an incident state change for a process instance. When an instance gets an incident, it
   * should be counted ONLY as INCIDENT, not in its ExecutionState. When resolved, it goes back to
   * its ExecutionState count.
   *
   * @param key The process definition key
   * @param currentState The current ExecutionState of the instance
   * @param hadIncident Whether the instance previously had an incident
   * @param hasIncident Whether the instance now has an incident
   */
  public void recordIncidentChange(
      ProcessDefinitionKey key,
      ExecutionState currentState,
      boolean hadIncident,
      boolean hasIncident) {
    recordIncidentChange(null, key, currentState, hadIncident, hasIncident);
  }

  public void recordIncidentChange(
      UUID processInstanceId,
      ProcessDefinitionKey key,
      ExecutionState currentState,
      boolean hadIncident,
      boolean hasIncident) {

    if (hadIncident == hasIncident) {
      return; // No change
    }

    AtomicInteger incidentCount =
        perVersionIncidentCounts.computeIfAbsent(key, k -> new AtomicInteger(0));

    Map<ExecutionState, AtomicInteger> stateCounts =
        perVersionCounts.computeIfAbsent(key, k -> new ConcurrentHashMap<>());

    if (hasIncident) {
      // Incident added - increment incident count and DECREMENT ExecutionState count
      incidentCount.incrementAndGet();

      // Remove from ExecutionState count (instance now only counted as INCIDENT)
      if (currentState != null) {
        AtomicInteger stateCounter = stateCounts.get(currentState);
        if (stateCounter != null) {
          stateCounter.updateAndGet(current -> Math.max(0, current - 1));
        }
      }

      if (log.isDebugEnabled()) {
        log.debug(
            "Incident added for {}, incident count: {}, removed from {} count",
            key,
            incidentCount.get(),
            currentState);
      }
    } else {
      // Incident resolved - decrement incident count and INCREMENT ExecutionState count
      incidentCount.updateAndGet(current -> Math.max(0, current - 1));

      // Add back to ExecutionState count (instance no longer in incident)
      if (currentState != null) {
        stateCounts.computeIfAbsent(currentState, s -> new AtomicInteger(0)).incrementAndGet();
      }

      if (log.isDebugEnabled()) {
        log.debug(
            "Incident resolved for {}, incident count: {}, added back to {} count",
            key,
            incidentCount.get(),
            currentState);
      }
    }

    if (processInstanceId != null) {
      perInstanceStates.compute(
          processInstanceId,
          (ignored, existingState) ->
              new InstanceAggregateState(
                  key,
                  currentState,
                  hasIncident || (existingState != null && existingState.hasIncident())));
      if (!hasIncident) {
        perInstanceStates.computeIfPresent(
            processInstanceId,
            (ignored, existingState) ->
                new InstanceAggregateState(existingState.key(), existingState.state(), false));
      }
    }
  }

  public void removeInstance(UUID processInstanceId) {
    InstanceAggregateState removedState = perInstanceStates.remove(processInstanceId);
    if (removedState == null) {
      return;
    }

    if (removedState.hasIncident()) {
      decrementCounter(perVersionIncidentCounts.get(removedState.key()));
      return;
    }

    if (removedState.state() == null) {
      return;
    }

    Map<ExecutionState, AtomicInteger> stateCounts = perVersionCounts.get(removedState.key());
    if (stateCounts == null) {
      return;
    }
    decrementCounter(stateCounts.get(removedState.state()));
  }

  /**
   * Get snapshot of instance counts for a specific version.
   *
   * @param key The process definition key
   * @return Map of ExecutionState to count
   */
  public Map<ExecutionState, Integer> getVersionSnapshot(ProcessDefinitionKey key) {
    Map<ExecutionState, AtomicInteger> stateCounts = perVersionCounts.get(key);
    if (stateCounts == null || stateCounts.isEmpty()) {
      return Map.of();
    }

    Map<ExecutionState, Integer> snapshot = new HashMap<>();
    for (Map.Entry<ExecutionState, AtomicInteger> entry : stateCounts.entrySet()) {
      int count = entry.getValue().get();
      if (count > 0) {
        snapshot.put(entry.getKey(), count);
      }
    }
    return snapshot;
  }

  /**
   * Get snapshot of instance counts for all versions of a definition (aggregated). Derives counts
   * by summing across all versions with matching processDefinitionId.
   *
   * @param processDefinitionId The process definition ID
   * @return Map of ExecutionState to aggregated count
   */
  public Map<ExecutionState, Integer> getDefinitionSnapshot(String processDefinitionId) {
    Map<ExecutionState, Integer> aggregated = new HashMap<>();

    for (Map.Entry<ProcessDefinitionKey, Map<ExecutionState, AtomicInteger>> entry :
        perVersionCounts.entrySet()) {
      ProcessDefinitionKey key = entry.getKey();

      // Only include versions of the requested definition
      if (!key.getProcessDefinitionId().equals(processDefinitionId)) {
        continue;
      }

      Map<ExecutionState, AtomicInteger> versionCounts = entry.getValue();
      for (Map.Entry<ExecutionState, AtomicInteger> stateEntry : versionCounts.entrySet()) {
        ExecutionState state = stateEntry.getKey();
        int count = stateEntry.getValue().get();
        aggregated.merge(state, count, Integer::sum);
      }
    }

    return aggregated;
  }

  /**
   * Get snapshot of all process definitions with version-level detail. Returns counts per version
   * for all definitions, allowing frontend to aggregate as needed. Includes incident counts.
   *
   * @return Map of processDefinitionId to Map of version to Map of ExecutionState to count
   */
  public Map<String, Map<Integer, Map<ExecutionState, Integer>>> getGlobalSnapshotWithVersions() {
    Map<String, Map<Integer, Map<ExecutionState, Integer>>> result = new HashMap<>();

    // Add execution state counts per version
    for (Map.Entry<ProcessDefinitionKey, Map<ExecutionState, AtomicInteger>> entry :
        perVersionCounts.entrySet()) {
      String definitionId = entry.getKey().getProcessDefinitionId();
      Integer version = entry.getKey().getVersion();

      Map<Integer, Map<ExecutionState, Integer>> versions =
          result.computeIfAbsent(definitionId, k -> new HashMap<>());

      Map<ExecutionState, Integer> stateCounts = new HashMap<>();
      for (Map.Entry<ExecutionState, AtomicInteger> stateEntry : entry.getValue().entrySet()) {
        int count = stateEntry.getValue().get();
        if (count > 0) {
          stateCounts.put(stateEntry.getKey(), count);
        }
      }

      if (!stateCounts.isEmpty()) {
        versions.put(version, stateCounts);
      }
    }

    // Note: Incident counts are NOT included in ExecutionState maps
    // They are handled separately in the publisher when converting to String keys

    return result;
  }

  /**
   * Get incident counts per version for all definitions.
   *
   * @return Map of processDefinitionId to Map of version to incident count
   */
  public Map<String, Map<Integer, Integer>> getGlobalIncidentCountsWithVersions() {
    Map<String, Map<Integer, Integer>> result = new HashMap<>();

    for (Map.Entry<ProcessDefinitionKey, AtomicInteger> entry :
        perVersionIncidentCounts.entrySet()) {
      String definitionId = entry.getKey().getProcessDefinitionId();
      Integer version = entry.getKey().getVersion();
      int incidentCount = entry.getValue().get();

      if (incidentCount > 0) {
        Map<Integer, Integer> versions = result.computeIfAbsent(definitionId, k -> new HashMap<>());
        versions.put(version, incidentCount);
      }
    }

    return result;
  }

  /**
   * Get snapshot of all process definitions with aggregated instance counts. Derives counts by
   * grouping all versions by processDefinitionId. Includes incident counts.
   *
   * @deprecated Use getGlobalSnapshotWithVersions() for version-level detail
   * @return Map of processDefinitionId to Map of ExecutionState to count (includes INCIDENT
   *     pseudo-state)
   */
  @Deprecated
  public Map<String, Map<ExecutionState, Integer>> getGlobalSnapshot() {
    Map<String, Map<ExecutionState, Integer>> global = new HashMap<>();

    // Aggregate execution state counts
    for (Map.Entry<ProcessDefinitionKey, Map<ExecutionState, AtomicInteger>> entry :
        perVersionCounts.entrySet()) {
      String definitionId = entry.getKey().getProcessDefinitionId();
      Map<ExecutionState, AtomicInteger> versionCounts = entry.getValue();

      Map<ExecutionState, Integer> definitionCounts =
          global.computeIfAbsent(definitionId, id -> new HashMap<>());

      for (Map.Entry<ExecutionState, AtomicInteger> stateEntry : versionCounts.entrySet()) {
        ExecutionState state = stateEntry.getKey();
        int count = stateEntry.getValue().get();
        definitionCounts.merge(state, count, Integer::sum);
      }
    }

    return global;
  }

  /**
   * Get incident counts aggregated by process definition ID.
   *
   * @return Map of processDefinitionId to incident count
   */
  public Map<String, Integer> getGlobalIncidentCounts() {
    Map<String, Integer> incidentCounts = new HashMap<>();

    for (Map.Entry<ProcessDefinitionKey, AtomicInteger> entry :
        perVersionIncidentCounts.entrySet()) {
      String definitionId = entry.getKey().getProcessDefinitionId();
      int count = entry.getValue().get();

      if (count > 0) {
        incidentCounts.merge(definitionId, count, Integer::sum);
      }
    }

    return incidentCounts;
  }

  /**
   * Get all versions for a specific process definition ID. Used by publishers to broadcast
   * per-version summaries. Includes incident counts.
   *
   * @param processDefinitionId The process definition ID
   * @return Map of version to Map of ExecutionState to count (includes INCIDENT pseudo-state)
   */
  public Map<Integer, Map<ExecutionState, Integer>> getVersionsSnapshot(
      String processDefinitionId) {
    Map<Integer, Map<ExecutionState, Integer>> versionsMap = new HashMap<>();

    // Add execution state counts
    for (Map.Entry<ProcessDefinitionKey, Map<ExecutionState, AtomicInteger>> entry :
        perVersionCounts.entrySet()) {
      ProcessDefinitionKey key = entry.getKey();

      if (!key.getProcessDefinitionId().equals(processDefinitionId)) {
        continue;
      }

      Map<ExecutionState, Integer> versionCounts = new HashMap<>();
      for (Map.Entry<ExecutionState, AtomicInteger> stateEntry : entry.getValue().entrySet()) {
        int count = stateEntry.getValue().get();
        if (count > 0) {
          versionCounts.put(stateEntry.getKey(), count);
        }
      }

      if (!versionCounts.isEmpty()) {
        versionsMap.put(key.getVersion(), versionCounts);
      }
    }

    return versionsMap;
  }

  /**
   * Get incident counts per version for a specific process definition ID.
   *
   * @param processDefinitionId The process definition ID
   * @return Map of version to incident count
   */
  public Map<Integer, Integer> getVersionIncidentCounts(String processDefinitionId) {
    Map<Integer, Integer> incidentCounts = new HashMap<>();

    for (Map.Entry<ProcessDefinitionKey, AtomicInteger> entry :
        perVersionIncidentCounts.entrySet()) {
      ProcessDefinitionKey key = entry.getKey();

      if (!key.getProcessDefinitionId().equals(processDefinitionId)) {
        continue;
      }

      int count = entry.getValue().get();
      if (count > 0) {
        incidentCounts.put(key.getVersion(), count);
      }
    }

    return incidentCounts;
  }

  private void decrementCounter(AtomicInteger counter) {
    if (counter != null) {
      counter.updateAndGet(current -> Math.max(0, current - 1));
    }
  }

  private record InstanceAggregateState(
      ProcessDefinitionKey key, ExecutionState state, boolean hasIncident) {}
}
