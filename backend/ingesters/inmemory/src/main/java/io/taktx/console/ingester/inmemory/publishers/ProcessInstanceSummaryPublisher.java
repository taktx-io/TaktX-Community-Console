/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 * This file is part of TaktX, licensed under the TaktX Business Source License v1.0.
 * Free use is permitted with up to 3 Kafka partitions per topic. See LICENSE file for details.
 * For commercial use or more partitions and features, contact [https://www.taktx.io/contact].
 */

package io.taktx.console.ingester.inmemory.publishers;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.taktx.console.ingester.inmemory.metrics.ProcessInstanceStateAggregator;
import io.taktx.console.ingester.inmemory.websocket.ProcessDefinitionsWithVersionsSummaryMessage;
import io.taktx.console.ingester.inmemory.websocket.SubscriptionRegistry;
import io.taktx.dto.ExecutionState;
import io.taktx.dto.ProcessDefinitionKey;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.websocket.Session;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;

/**
 * Publishes process instance summary counts with version-level detail. Broadcasts
 * "process-definitions-with-versions-summary" to global subscribers. Frontend aggregates version
 * data as needed for display.
 */
@Slf4j
@ApplicationScoped
public class ProcessInstanceSummaryPublisher implements Publisher {

  @Inject ProcessInstanceStateAggregator aggregator;

  // Track last broadcast snapshot to avoid sending unchanged data
  private volatile Map<String, Map<Integer, Map<ExecutionState, Integer>>> lastGlobalSnapshot =
      new HashMap<>();

  @Override
  public void recordInstanceStateChange(
      ProcessDefinitionKey key, ExecutionState oldState, ExecutionState newState) {
    aggregator.recordStateTransition(key, oldState, newState);
  }

  public void recordInstanceStateChange(
      UUID instanceId, ProcessDefinitionKey key, ExecutionState oldState, ExecutionState newState) {
    aggregator.recordStateTransition(instanceId, key, oldState, newState);
  }

  /**
   * Record an incident state change for a process instance.
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
    aggregator.recordIncidentChange(key, currentState, hadIncident, hasIncident);
  }

  public void recordIncidentChange(
      UUID instanceId,
      ProcessDefinitionKey key,
      ExecutionState currentState,
      boolean hadIncident,
      boolean hasIncident) {
    aggregator.recordIncidentChange(instanceId, key, currentState, hadIncident, hasIncident);
  }

  public void evictInstance(UUID instanceId) {
    aggregator.removeInstance(instanceId);
  }

  @Override
  public void broadcast(SubscriptionRegistry registry, ObjectMapper objectMapper) {
    broadcastGlobalWithVersions(registry, objectMapper);
  }

  /**
   * Broadcast global summary with version-level detail to all global subscribers. Replaces the old
   * broadcastGlobalSummary + broadcastDefinitionSummaries pattern.
   */
  private void broadcastGlobalWithVersions(
      SubscriptionRegistry registry, ObjectMapper objectMapper) {
    Set<Session> sessions = registry.getGlobalSubscribers();
    if (sessions.isEmpty()) {
      return;
    }

    Map<String, Map<Integer, Map<ExecutionState, Integer>>> snapshot =
        aggregator.getGlobalSnapshotWithVersions();

    // Only broadcast if data has changed since last broadcast
    if (snapshot.equals(lastGlobalSnapshot)) {
      return; // No changes, skip broadcast
    }

    if (snapshot.isEmpty()) {
      return; // No data yet
    }

    // Convert ExecutionState enum keys to String keys for proper JSON serialization
    Map<String, Map<Integer, Map<String, Integer>>> stringKeyedSnapshot = new HashMap<>();

    for (Map.Entry<String, Map<Integer, Map<ExecutionState, Integer>>> defEntry :
        snapshot.entrySet()) {
      String definitionId = defEntry.getKey();
      Map<Integer, Map<String, Integer>> versionsMap = new HashMap<>();

      for (Map.Entry<Integer, Map<ExecutionState, Integer>> versionEntry :
          defEntry.getValue().entrySet()) {
        Integer version = versionEntry.getKey();
        Map<String, Integer> stateCounts = new HashMap<>();

        for (Map.Entry<ExecutionState, Integer> stateEntry : versionEntry.getValue().entrySet()) {
          stateCounts.put(stateEntry.getKey().name(), stateEntry.getValue());
        }

        versionsMap.put(version, stateCounts);
      }

      stringKeyedSnapshot.put(definitionId, versionsMap);
    }

    // Add incident counts per version as "INCIDENT" pseudo-state
    Map<String, Map<Integer, Integer>> incidentCounts =
        aggregator.getGlobalIncidentCountsWithVersions();
    for (Map.Entry<String, Map<Integer, Integer>> defEntry : incidentCounts.entrySet()) {
      String definitionId = defEntry.getKey();
      Map<Integer, Map<String, Integer>> versionsMap =
          stringKeyedSnapshot.computeIfAbsent(definitionId, k -> new HashMap<>());

      for (Map.Entry<Integer, Integer> versionEntry : defEntry.getValue().entrySet()) {
        Integer version = versionEntry.getKey();
        Map<String, Integer> stateCounts =
            versionsMap.computeIfAbsent(version, v -> new HashMap<>());
        stateCounts.put("INCIDENT", versionEntry.getValue());
      }
    }

    try {
      ProcessDefinitionsWithVersionsSummaryMessage message =
          new ProcessDefinitionsWithVersionsSummaryMessage(
              "process-definitions-with-versions-summary",
              stringKeyedSnapshot,
              System.currentTimeMillis());

      String json = objectMapper.writeValueAsString(message);

      int sentCount = 0;
      for (Session session : sessions) {
        sendToSession(session, json);
        sentCount++;
      }

      // Update last snapshot after successful broadcast
      lastGlobalSnapshot = new HashMap<>(snapshot);

      if (sentCount > 0 && log.isDebugEnabled()) {
        log.debug(
            "Broadcast global with versions to {} session(s): {} definitions (data changed)",
            sentCount,
            snapshot.size());
      }
    } catch (Exception e) {
      log.error("Error broadcasting global with versions: {}", e.getMessage(), e);
    }
  }

  /**
   * Send immediate global summary to a specific session (called when session first subscribes).
   * Provides instant feedback instead of waiting up to 100ms for next broadcast cycle.
   */
  public void sendImmediateGlobalSummary(Session session, ObjectMapper objectMapper) {
    try {
      Map<String, Map<Integer, Map<ExecutionState, Integer>>> snapshot =
          aggregator.getGlobalSnapshotWithVersions();

      // Convert ExecutionState enum keys to String keys for proper JSON serialization
      Map<String, Map<Integer, Map<String, Integer>>> stringKeyedSnapshot = new HashMap<>();

      for (Map.Entry<String, Map<Integer, Map<ExecutionState, Integer>>> defEntry :
          snapshot.entrySet()) {
        String definitionId = defEntry.getKey();
        Map<Integer, Map<String, Integer>> versionsMap = new HashMap<>();

        for (Map.Entry<Integer, Map<ExecutionState, Integer>> versionEntry :
            defEntry.getValue().entrySet()) {
          Integer version = versionEntry.getKey();
          Map<String, Integer> stateCounts = new HashMap<>();

          for (Map.Entry<ExecutionState, Integer> stateEntry : versionEntry.getValue().entrySet()) {
            stateCounts.put(stateEntry.getKey().name(), stateEntry.getValue());
          }

          versionsMap.put(version, stateCounts);
        }

        stringKeyedSnapshot.put(definitionId, versionsMap);
      }

      // Add incident counts per version as "INCIDENT" pseudo-state
      Map<String, Map<Integer, Integer>> incidentCounts =
          aggregator.getGlobalIncidentCountsWithVersions();
      for (Map.Entry<String, Map<Integer, Integer>> defEntry : incidentCounts.entrySet()) {
        String definitionId = defEntry.getKey();
        Map<Integer, Map<String, Integer>> versionsMap =
            stringKeyedSnapshot.computeIfAbsent(definitionId, k -> new HashMap<>());

        for (Map.Entry<Integer, Integer> versionEntry : defEntry.getValue().entrySet()) {
          Integer version = versionEntry.getKey();
          Map<String, Integer> stateCounts =
              versionsMap.computeIfAbsent(version, v -> new HashMap<>());
          stateCounts.put("INCIDENT", versionEntry.getValue());
        }
      }

      // Even if no instances exist yet, send empty map so frontend knows subscription succeeded
      ProcessDefinitionsWithVersionsSummaryMessage message =
          new ProcessDefinitionsWithVersionsSummaryMessage(
              "process-definitions-with-versions-summary",
              stringKeyedSnapshot,
              System.currentTimeMillis());

      String json = objectMapper.writeValueAsString(message);
      sendToSession(session, json);

      if (log.isDebugEnabled()) {
        log.debug(
            "Sent immediate global with versions to session {}: {} definitions",
            session.getId(),
            snapshot.size());
      }
    } catch (Exception e) {
      log.error(
          "Error sending immediate global with versions to session {}: {}",
          session.getId(),
          e.getMessage(),
          e);
    }
  }
}
