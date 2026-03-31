/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 * This file is part of TaktX, licensed under the TaktX Business Source License v1.0.
 * Free use is permitted with up to 3 Kafka partitions per topic. See LICENSE file for details.
 * For commercial use or more partitions and features, contact [https://www.taktx.io/contact].
 */

package io.taktx.console.ingester.inmemory.publishers;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.taktx.console.ingester.inmemory.metrics.FlowNodeStateAggregator;
import io.taktx.console.ingester.inmemory.websocket.FlowNodeStateTracker;
import io.taktx.console.ingester.inmemory.websocket.ProcessDefinitionAggregateStateMessage;
import io.taktx.console.ingester.inmemory.websocket.ProcessInstanceStateMessage;
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
 * Publishes flow node state (badges) at both definition and instance levels. Broadcasts: -
 * "process-definition-aggregate-state" to definition-version subscribers - "process-instance-state"
 * to instance subscribers - "process-instance-metadata" to instance subscribers (for table updates)
 */
@Slf4j
@ApplicationScoped
public class FlowNodeStatePublisher implements Publisher {

  @Inject FlowNodeStateAggregator aggregator;

  @Override
  public void recordFlowNodeEvent(
      ProcessDefinitionKey key,
      UUID instanceId,
      String flowNodeId,
      String flowNodeInstancePath,
      ExecutionState state,
      java.util.List<String> sequenceFlowIds) {
    aggregator.recordEvent(key, instanceId, flowNodeId, flowNodeInstancePath, state);
  }

  @Override
  public void broadcast(SubscriptionRegistry registry, ObjectMapper objectMapper) {
    broadcastDefinitionStates(registry, objectMapper);
    broadcastInstanceStates(registry, objectMapper);
  }

  /** Broadcast definition-level flow node states to version subscribers. */
  private void broadcastDefinitionStates(SubscriptionRegistry registry, ObjectMapper objectMapper) {
    // We don't track which definitions changed, so we iterate all possible subscriptions
    // This is acceptable since version subscribers are typically limited

    // Note: In a production system, we might want to track which keys have active subscriptions
    // For now, we rely on the registry to return empty sets for unsubscribed keys
  }

  /** Broadcast instance-level flow node states to instance subscribers. */
  private void broadcastInstanceStates(SubscriptionRegistry registry, ObjectMapper objectMapper) {
    // Similar challenge: we need to know which instances have subscribers
    // The registry should provide this, but we need to iterate known instances

    // For now, this will be triggered from the coordinator when it knows about instances
  }

  /** Broadcast definition state for a specific key (called from coordinator). */
  public void broadcastDefinitionState(
      ProcessDefinitionKey key, SubscriptionRegistry registry, ObjectMapper objectMapper) {
    Set<Session> sessions = registry.getVersionSubscribers(key);
    if (sessions.isEmpty()) {
      return;
    }

    Map<String, FlowNodeStateTracker.StateSnapshot> snapshot =
        aggregator.getDefinitionSnapshot(key);
    if (snapshot.isEmpty()) {
      return;
    }

    try {
      // Convert to message format
      Map<String, ProcessDefinitionAggregateStateMessage.FlowNodeState> states = new HashMap<>();
      for (Map.Entry<String, FlowNodeStateTracker.StateSnapshot> entry : snapshot.entrySet()) {
        FlowNodeStateTracker.StateSnapshot state = entry.getValue();
        states.put(
            entry.getKey(),
            new ProcessDefinitionAggregateStateMessage.FlowNodeState(
                state.active(), state.completed(), state.aborted()));
      }

      ProcessDefinitionAggregateStateMessage message =
          new ProcessDefinitionAggregateStateMessage(
              "process-definition-aggregate-state",
              key.getProcessDefinitionId(),
              key.getVersion(),
              states,
              System.currentTimeMillis());

      String json = objectMapper.writeValueAsString(message);

      int sentCount = 0;
      for (Session session : sessions) {
        sendToSession(session, json);
        sentCount++;
      }

      if (sentCount > 0 && log.isDebugEnabled()) {
        log.debug(
            "Broadcast definition state for {} to {} session(s): {} flow nodes",
            key,
            sentCount,
            states.size());
      }
    } catch (Exception e) {
      log.error("Error broadcasting definition state for {}: {}", key, e.getMessage(), e);
    }
  }

  /** Broadcast instance state for a specific instance (called from coordinator). */
  public void broadcastInstanceState(
      UUID instanceId, SubscriptionRegistry registry, ObjectMapper objectMapper) {
    Set<Session> sessions = registry.getInstanceSubscribers(instanceId);
    if (sessions.isEmpty()) {
      return;
    }

    Map<String, FlowNodeStateTracker.StateSnapshot> snapshot =
        aggregator.getInstanceSnapshot(instanceId);
    if (snapshot.isEmpty()) {
      return;
    }

    try {
      // Convert to message format
      Map<String, ProcessInstanceStateMessage.FlowNodeState> states = new HashMap<>();
      for (Map.Entry<String, FlowNodeStateTracker.StateSnapshot> entry : snapshot.entrySet()) {
        FlowNodeStateTracker.StateSnapshot state = entry.getValue();
        states.put(
            entry.getKey(),
            new ProcessInstanceStateMessage.FlowNodeState(
                state.active(), state.completed(), state.aborted()));
      }

      ProcessInstanceStateMessage message =
          new ProcessInstanceStateMessage(
              "process-instance-state", instanceId.toString(), states, System.currentTimeMillis());

      String json = objectMapper.writeValueAsString(message);

      int sentCount = 0;
      for (Session session : sessions) {
        sendToSession(session, json);
        sentCount++;
      }

      if (sentCount > 0 && log.isDebugEnabled()) {
        log.debug(
            "Broadcast instance state for {} to {} session(s): {} flow nodes",
            instanceId,
            sentCount,
            states.size());
      }
    } catch (Exception e) {
      log.error("Error broadcasting instance state for {}: {}", instanceId, e.getMessage(), e);
    }
  }

  @Override
  public void clearInstance(UUID instanceId) {
    aggregator.clearInstance(instanceId);
  }
}
