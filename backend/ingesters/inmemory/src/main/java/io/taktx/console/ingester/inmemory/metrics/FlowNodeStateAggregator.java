/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 * This file is part of TaktX, licensed under the TaktX Business Source License v1.0.
 * Free use is permitted with up to 3 Kafka partitions per topic. See LICENSE file for details.
 * For commercial use or more partitions and features, contact [https://www.taktx.io/contact].
 */

package io.taktx.console.ingester.inmemory.metrics;

import io.taktx.console.ingester.inmemory.resources.TimedFlowNodeInstance;
import io.taktx.console.ingester.inmemory.resources.TimedFlowNodeInstance.TimedFlowNodeUpdate;
import io.taktx.console.ingester.inmemory.websocket.FlowNodeStateTracker;
import io.taktx.dto.ExecutionState;
import io.taktx.dto.ProcessDefinitionKey;
import jakarta.enterprise.context.ApplicationScoped;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import lombok.extern.slf4j.Slf4j;

/**
 * Unified aggregator for flow node state tracking at both definition and instance levels. Handles
 * deduplication to prevent duplicate state updates for the same flow node instance.
 */
@Slf4j
@ApplicationScoped
public class FlowNodeStateAggregator {

  // Definition-level: ProcessDefinitionKey -> FlowNodeId -> StateTracker
  private final Map<ProcessDefinitionKey, Map<String, FlowNodeStateTracker>> definitionStates =
      new ConcurrentHashMap<>();

  // Instance-level: ProcessInstanceId -> FlowNodeId -> StateTracker
  private final Map<UUID, Map<String, FlowNodeStateTracker>> instanceStates =
      new ConcurrentHashMap<>();

  // Deduplication: ProcessInstanceId -> FlowNodeInstancePath -> Last known state
  private final Map<UUID, Map<String, ExecutionState>> flowNodeInstancePreviousState =
      new ConcurrentHashMap<>();

  /**
   * Record a flow node event, updating both definition and instance level states. Uses
   * deduplication to prevent counting the same state transition multiple times.
   *
   * @param key The process definition key
   * @param instanceId The process instance ID (nullable)
   * @param flowNodeId The flow node ID
   * @param flowNodeInstancePath The unique path to this flow node instance (for multi-instance)
   * @param state The execution state
   * @return true if state actually changed (not a duplicate)
   */
  public boolean recordEvent(
      ProcessDefinitionKey key,
      UUID instanceId,
      String flowNodeId,
      String flowNodeInstancePath,
      ExecutionState state) {

    // Build unique key for deduplication
    String uniqueInstanceKey =
        flowNodeInstancePath != null ? flowNodeInstancePath : flowNodeId + "_" + instanceId;

    // Check for duplicate
    ExecutionState previousState = null;
    if (instanceId != null) {
      previousState =
          flowNodeInstancePreviousState
              .computeIfAbsent(instanceId, id -> new ConcurrentHashMap<>())
              .get(uniqueInstanceKey);
    }

    boolean stateHasChanged = !state.equals(previousState);

    if (!stateHasChanged) {
      if (log.isDebugEnabled()) {
        log.debug("Duplicate state for {}: {} - {} (skipping)", key, flowNodeId, state);
      }
      return false;
    }

    // Update definition-level state
    FlowNodeStateTracker definitionTracker =
        definitionStates
            .computeIfAbsent(key, k -> new ConcurrentHashMap<>())
            .computeIfAbsent(flowNodeId, fn -> new FlowNodeStateTracker());

    updateTracker(definitionTracker, state);

    // Update instance-level state (if instanceId provided)
    if (instanceId != null) {
      FlowNodeStateTracker instanceTracker =
          instanceStates
              .computeIfAbsent(instanceId, id -> new ConcurrentHashMap<>())
              .computeIfAbsent(flowNodeId, fn -> new FlowNodeStateTracker());

      updateTracker(instanceTracker, state);

      // Store for deduplication
      flowNodeInstancePreviousState.get(instanceId).put(uniqueInstanceKey, state);
    }

    if (log.isDebugEnabled()) {
      log.debug(
          "Flow node state updated for {}: {} - {} -> {} (active={}, completed={}, aborted={})",
          key,
          flowNodeId,
          previousState,
          state,
          definitionTracker.getSnapshot().active(),
          definitionTracker.getSnapshot().completed(),
          definitionTracker.getSnapshot().aborted());
    }

    return true;
  }

  /** Update a state tracker based on the execution state. */
  private void updateTracker(FlowNodeStateTracker tracker, ExecutionState state) {
    switch (state) {
      case ACTIVE:
      case INITIALIZED:
        tracker.onActivate();
        break;
      case COMPLETED:
        tracker.onComplete();
        break;
      case ABORTED:
        tracker.onAbort();
        break;
    }
  }

  /**
   * Get snapshot of flow node states for a specific definition version.
   *
   * @param key The process definition key
   * @return Map of flowNodeId to state snapshot
   */
  public Map<String, FlowNodeStateTracker.StateSnapshot> getDefinitionSnapshot(
      ProcessDefinitionKey key) {
    Map<String, FlowNodeStateTracker> stateMap = definitionStates.get(key);
    if (stateMap == null || stateMap.isEmpty()) {
      return Map.of();
    }

    Map<String, FlowNodeStateTracker.StateSnapshot> snapshot = new HashMap<>();
    for (Map.Entry<String, FlowNodeStateTracker> entry : stateMap.entrySet()) {
      FlowNodeStateTracker.StateSnapshot state = entry.getValue().getSnapshot();
      if (state.hasActivity()) {
        snapshot.put(entry.getKey(), state);
      }
    }
    return snapshot;
  }

  /**
   * Get snapshot of flow node states for a specific process instance.
   *
   * @param instanceId The process instance ID
   * @return Map of flowNodeId to state snapshot
   */
  public Map<String, FlowNodeStateTracker.StateSnapshot> getInstanceSnapshot(UUID instanceId) {
    Map<String, FlowNodeStateTracker> stateMap = instanceStates.get(instanceId);
    if (stateMap == null || stateMap.isEmpty()) {
      return Map.of();
    }

    Map<String, FlowNodeStateTracker.StateSnapshot> snapshot = new HashMap<>();
    for (Map.Entry<String, FlowNodeStateTracker> entry : stateMap.entrySet()) {
      FlowNodeStateTracker.StateSnapshot state = entry.getValue().getSnapshot();
      if (state.hasActivity()) {
        snapshot.put(entry.getKey(), state);
      }
    }
    return snapshot;
  }

  /** Clear state tracking for a specific process instance. */
  public void clearInstance(UUID instanceId) {
    instanceStates.remove(instanceId);
    flowNodeInstancePreviousState.remove(instanceId);
    log.debug("Cleared flow node state tracking for instance {}", instanceId);
  }

  public void removeInstance(
      ProcessDefinitionKey key, List<TimedFlowNodeInstance> flowNodeInstances) {
    if (key == null || flowNodeInstances == null || flowNodeInstances.isEmpty()) {
      return;
    }

    Map<String, FlowNodeStateTracker> definitionStateMap = definitionStates.get(key);
    if (definitionStateMap == null || definitionStateMap.isEmpty()) {
      return;
    }

    for (TimedFlowNodeInstance flowNodeInstance : flowNodeInstances) {
      String flowNodeId = resolveFlowNodeId(flowNodeInstance);
      if (flowNodeId == null) {
        continue;
      }

      FlowNodeStateTracker definitionTracker = definitionStateMap.get(flowNodeId);
      if (definitionTracker == null) {
        continue;
      }

      definitionTracker.subtractSnapshot(calculateContribution(flowNodeInstance));
      if (!definitionTracker.getSnapshot().hasActivity()) {
        definitionStateMap.remove(flowNodeId);
      }
    }

    if (definitionStateMap.isEmpty()) {
      definitionStates.remove(key);
    }
  }

  private String resolveFlowNodeId(TimedFlowNodeInstance flowNodeInstance) {
    if (flowNodeInstance.elementId() != null) {
      return flowNodeInstance.elementId();
    }
    if (flowNodeInstance.flowNodeInstanceUpdate() == null
        || flowNodeInstance.flowNodeInstanceUpdate().getFlowNodeInstance() == null) {
      return null;
    }
    return flowNodeInstance.flowNodeInstanceUpdate().getFlowNodeInstance().getElementId();
  }

  private FlowNodeStateTracker.StateSnapshot calculateContribution(
      TimedFlowNodeInstance flowNodeInstance) {
    FlowNodeStateTracker tracker = new FlowNodeStateTracker();
    ExecutionState previousState = null;

    List<TimedFlowNodeUpdate> updateHistory = flowNodeInstance.updateHistory();
    if (updateHistory != null && !updateHistory.isEmpty()) {
      for (TimedFlowNodeUpdate timedUpdate : updateHistory) {
        if (timedUpdate.flowNodeInstanceUpdate() == null
            || timedUpdate.flowNodeInstanceUpdate().getFlowNodeInstance() == null) {
          continue;
        }
        previousState =
            applyIfChanged(
                tracker,
                previousState,
                timedUpdate.flowNodeInstanceUpdate().getFlowNodeInstance().getState());
      }
      return tracker.getSnapshot();
    }

    if (flowNodeInstance.flowNodeInstanceUpdate() != null
        && flowNodeInstance.flowNodeInstanceUpdate().getFlowNodeInstance() != null) {
      applyIfChanged(
          tracker,
          null,
          flowNodeInstance.flowNodeInstanceUpdate().getFlowNodeInstance().getState());
    }
    return tracker.getSnapshot();
  }

  private ExecutionState applyIfChanged(
      FlowNodeStateTracker tracker, ExecutionState previousState, ExecutionState newState) {
    if (newState == null || newState.equals(previousState)) {
      return previousState;
    }
    updateTracker(tracker, newState);
    return newState;
  }
}
