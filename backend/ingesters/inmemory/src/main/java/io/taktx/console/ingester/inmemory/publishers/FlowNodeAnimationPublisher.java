/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 * This file is part of TaktX, licensed under the TaktX Business Source License v1.0.
 * Free use is permitted with up to 3 Kafka partitions per topic. See LICENSE file for details.
 * For commercial use or more partitions and features, contact [https://www.taktx.io/contact].
 */

package io.taktx.console.ingester.inmemory.publishers;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.taktx.console.ingester.inmemory.metrics.FlowNodeAnimationAggregator;
import io.taktx.console.ingester.inmemory.websocket.FlowNodeActivityMessage;
import io.taktx.console.ingester.inmemory.websocket.SubscriptionRegistry;
import io.taktx.dto.ExecutionState;
import io.taktx.dto.ProcessDefinitionKey;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.websocket.Session;
import java.util.Map;
import java.util.Set;
import lombok.extern.slf4j.Slf4j;

/**
 * Publishes flow node animation events to definition-version subscribers. Uses windowed aggregation
 * (get-and-reset) for 100ms intervals.
 */
@Slf4j
@ApplicationScoped
public class FlowNodeAnimationPublisher implements Publisher {

  @Inject FlowNodeAnimationAggregator aggregator;

  @Override
  public void recordFlowNodeEvent(
      ProcessDefinitionKey key,
      java.util.UUID instanceId,
      String flowNodeId,
      String flowNodeInstancePath,
      ExecutionState state,
      java.util.List<String> sequenceFlowIds) {
    aggregator.recordEvent(key, flowNodeId, state, sequenceFlowIds);
  }

  @Override
  public void broadcast(SubscriptionRegistry registry, ObjectMapper objectMapper) {
    // We need to know which definition versions have subscribers and data
    // For now, this will be called per-key from the coordinator
  }

  /**
   * Broadcast animation data for a specific definition version. Called from coordinator for each
   * subscribed key.
   */
  public void broadcastForDefinitionVersion(
      ProcessDefinitionKey key, SubscriptionRegistry registry, ObjectMapper objectMapper) {
    Set<Session> sessions = registry.getVersionSubscribers(key);
    if (sessions.isEmpty()) {
      return;
    }

    FlowNodeAnimationAggregator.AnimationSnapshot snapshot = aggregator.getAndResetSnapshot(key);
    if (snapshot == null) {
      return; // No activity in this window
    }

    try {
      // Build aggregated sequence flow message (sent once for all flows)
      if (!snapshot.sequenceFlows().isEmpty()) {
        FlowNodeActivityMessage seqFlowMsg =
            new FlowNodeActivityMessage(
                "flownode-activity",
                "_sequenceflows_",
                0,
                0,
                0,
                System.currentTimeMillis(),
                snapshot.sequenceFlows());

        String json = objectMapper.writeValueAsString(seqFlowMsg);
        for (Session session : sessions) {
          sendToSession(session, json);
        }
      }

      // Send activity messages for each flow node
      for (Map.Entry<String, FlowNodeAnimationAggregator.ActivitySnapshot> entry :
          snapshot.activities().entrySet()) {
        String flowNodeId = entry.getKey();
        FlowNodeAnimationAggregator.ActivitySnapshot activity = entry.getValue();

        FlowNodeActivityMessage activityMsg =
            new FlowNodeActivityMessage(
                "flownode-activity",
                flowNodeId,
                activity.active(),
                activity.completed(),
                activity.aborted(),
                System.currentTimeMillis(),
                null);

        String json = objectMapper.writeValueAsString(activityMsg);
        for (Session session : sessions) {
          sendToSession(session, json);
        }
      }

      if (log.isDebugEnabled()) {
        log.debug(
            "Broadcast animations for {} to {} session(s): {} activities, {} sequence flows",
            key,
            sessions.size(),
            snapshot.activities().size(),
            snapshot.sequenceFlows().size());
      }
    } catch (Exception e) {
      log.error("Error broadcasting animations for {}: {}", key, e.getMessage(), e);
    }
  }
}
