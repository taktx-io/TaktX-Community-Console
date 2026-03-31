/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 * This file is part of TaktX, licensed under the TaktX Business Source License v1.0.
 * Free use is permitted with up to 3 Kafka partitions per topic. See LICENSE file for details.
 * For commercial use or more partitions and features, contact [https://www.taktx.io/contact].
 */

package io.taktx.console.ingester.inmemory.publishers;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.taktx.console.ingester.inmemory.metrics.FlowNodeHeatmapAggregator;
import io.taktx.console.ingester.inmemory.websocket.ProcessInstanceHeatmapMessage;
import io.taktx.console.ingester.inmemory.websocket.SubscriptionRegistry;
import io.taktx.dto.ExecutionState;
import io.taktx.dto.ProcessDefinitionKey;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.websocket.Session;
import java.util.Set;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;

/**
 * Publishes cumulative heatmap data to instance subscribers. Never resets - maintains cumulative
 * counts for instance lifetime.
 */
@Slf4j
@ApplicationScoped
public class FlowNodeHeatmapPublisher implements Publisher {

  @Inject FlowNodeHeatmapAggregator aggregator;

  @Override
  public void recordFlowNodeEvent(
      ProcessDefinitionKey key,
      UUID instanceId,
      String flowNodeId,
      String flowNodeInstancePath,
      ExecutionState state,
      java.util.List<String> sequenceFlowIds) {

    if (instanceId == null) {
      return; // Heatmap only for specific instances
    }

    // Record completions for activity pass counts
    if (state == ExecutionState.COMPLETED) {
      aggregator.recordCompletion(instanceId, flowNodeId);
    }

    // Record sequence flow traversals
    if (sequenceFlowIds != null && !sequenceFlowIds.isEmpty()) {
      for (String seqFlowId : sequenceFlowIds) {
        aggregator.recordSequenceFlow(instanceId, seqFlowId);
      }
    }
  }

  @Override
  public void broadcast(SubscriptionRegistry registry, ObjectMapper objectMapper) {
    // We need to know which instances have subscribers
    // For now, this will be called per-instance from the coordinator
  }

  /**
   * Broadcast heatmap for a specific instance. Called from coordinator for each subscribed
   * instance.
   */
  public void broadcastForInstance(
      UUID instanceId, SubscriptionRegistry registry, ObjectMapper objectMapper) {
    Set<Session> sessions = registry.getInstanceSubscribers(instanceId);
    if (sessions.isEmpty()) {
      return;
    }

    FlowNodeHeatmapAggregator.HeatmapSnapshot snapshot = aggregator.getSnapshot(instanceId);

    try {
      ProcessInstanceHeatmapMessage message =
          new ProcessInstanceHeatmapMessage(
              "process-instance-heatmap",
              instanceId.toString(),
              snapshot.activityPassCounts(),
              snapshot.sequenceFlowIds(),
              System.currentTimeMillis());

      String json = objectMapper.writeValueAsString(message);

      int sentCount = 0;
      for (Session session : sessions) {
        sendToSession(session, json);
        sentCount++;
      }

      if (sentCount > 0 && log.isDebugEnabled()) {
        int activityCount =
            snapshot.activityPassCounts() != null ? snapshot.activityPassCounts().size() : 0;
        int seqFlowCount =
            snapshot.sequenceFlowIds() != null ? snapshot.sequenceFlowIds().size() : 0;
        log.debug(
            "Broadcast heatmap for {} to {} session(s): {} activities, {} sequence flows",
            instanceId,
            sentCount,
            activityCount,
            seqFlowCount);
      }
    } catch (Exception e) {
      log.error("Error broadcasting heatmap for {}: {}", instanceId, e.getMessage(), e);
    }
  }

  @Override
  public void clearInstance(UUID instanceId) {
    aggregator.clearInstance(instanceId);
  }
}
