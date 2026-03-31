/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 * This file is part of TaktX, licensed under the TaktX Business Source License v1.0.
 * Free use is permitted with up to 3 Kafka partitions per topic. See LICENSE file for details.
 * For commercial use or more partitions and features, contact [https://www.taktx.io/contact].
 */

package io.taktx.console.ingester.inmemory.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkus.runtime.Startup;
import io.taktx.console.ingester.inmemory.publishers.*;
import io.taktx.dto.ExecutionState;
import io.taktx.dto.ProcessDefinitionKey;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.util.*;
import java.util.concurrent.*;
import lombok.extern.slf4j.Slf4j;

/**
 * Refactored coordinator for WebSocket broadcasting.
 *
 * <p>Simplified responsibilities: - Single 100ms scheduler - Event fan-out to publishers - No
 * direct state management (delegated to aggregators) - No subscription management (delegated to
 * SubscriptionRegistry)
 */
@Slf4j
@Startup
@ApplicationScoped
public class FlowNodeEventBroadcaster {

  private final ObjectMapper objectMapper = new ObjectMapper();

  @Inject SubscriptionRegistry subscriptionRegistry;

  // Inject all publishers
  @Inject ProcessInstanceSummaryPublisher instanceSummaryPublisher;
  @Inject ProcessInstanceDeltaPublisher instanceDeltaPublisher;
  @Inject FlowNodeStatePublisher flowNodeStatePublisher;
  @Inject FlowNodeAnimationPublisher animationPublisher;
  @Inject FlowNodeHeatmapPublisher heatmapPublisher;

  // Single scheduler for coordinated broadcasting
  private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(1);

  // Track which keys and instances have active subscriptions for efficient broadcasting
  private final Set<ProcessDefinitionKey> activeVersionSubscriptions =
      ConcurrentHashMap.newKeySet();
  private final Set<UUID> activeInstanceSubscriptions = ConcurrentHashMap.newKeySet();

  @PostConstruct
  void onStartup() {
    log.info("FlowNodeEventBroadcaster initialized - starting 100ms broadcast scheduler");
    scheduler.scheduleAtFixedRate(this::coordinateBroadcasts, 100, 100, TimeUnit.MILLISECONDS);
  }

  @PreDestroy
  void onShutdown() {
    log.info("Shutting down FlowNodeEventBroadcaster scheduler");
    scheduler.shutdown();
    try {
      if (!scheduler.awaitTermination(5, TimeUnit.SECONDS)) {
        scheduler.shutdownNow();
      }
    } catch (InterruptedException e) {
      scheduler.shutdownNow();
      Thread.currentThread().interrupt();
    }
  }

  /** Record a flow node event - fan out to all publishers. */
  public void queueEvent(ProcessDefinitionKey key, FlowNodeEventMessage event) {
    UUID instanceId = null;
    if (event.getProcessInstanceId() != null && !event.getProcessInstanceId().isEmpty()) {
      try {
        instanceId = UUID.fromString(event.getProcessInstanceId());
      } catch (IllegalArgumentException ex) {
        log.warn("Invalid processInstanceId in event: {}", event.getProcessInstanceId());
      }
    }

    String flowNodeInstancePath = event.getFlowNodeInstancePath();
    ExecutionState state = event.getEventType();
    List<String> sequenceFlowIds = event.getSequenceFlowIds();

    // Fan out to all publishers
    try {
      flowNodeStatePublisher.recordFlowNodeEvent(
          key, instanceId, event.getFlowNodeId(), flowNodeInstancePath, state, sequenceFlowIds);
    } catch (Exception e) {
      log.error("Error in flowNodeStatePublisher.recordFlowNodeEvent: {}", e.getMessage(), e);
    }

    try {
      animationPublisher.recordFlowNodeEvent(
          key, instanceId, event.getFlowNodeId(), flowNodeInstancePath, state, sequenceFlowIds);
    } catch (Exception e) {
      log.error("Error in animationPublisher.recordFlowNodeEvent: {}", e.getMessage(), e);
    }

    try {
      heatmapPublisher.recordFlowNodeEvent(
          key, instanceId, event.getFlowNodeId(), flowNodeInstancePath, state, sequenceFlowIds);
    } catch (Exception e) {
      log.error("Error in heatmapPublisher.recordFlowNodeEvent: {}", e.getMessage(), e);
    }

    // Track that this key/instance has activity (for efficient broadcasting)
    activeVersionSubscriptions.add(key);
    if (instanceId != null) {
      activeInstanceSubscriptions.add(instanceId);
    }
  }

  /** Record a process instance state transition - fan out to relevant publishers. */
  public void recordInstanceStateChange(
      ProcessDefinitionKey key, ExecutionState oldState, ExecutionState newState) {
    try {
      instanceSummaryPublisher.recordInstanceStateChange(key, oldState, newState);
    } catch (Exception e) {
      log.error(
          "Error in instanceSummaryPublisher.recordInstanceStateChange: {}", e.getMessage(), e);
    }
  }

  /**
   * Record a process instance incident state change. When an instance gets an incident, it's
   * counted ONLY as INCIDENT, not in its ExecutionState.
   */
  public void recordIncidentChange(
      ProcessDefinitionKey key,
      ExecutionState currentState,
      boolean hadIncident,
      boolean hasIncident) {
    try {
      instanceSummaryPublisher.recordIncidentChange(key, currentState, hadIncident, hasIncident);
    } catch (Exception e) {
      log.error("Error in instanceSummaryPublisher.recordIncidentChange: {}", e.getMessage(), e);
    }
  }

  /**
   * Record process instance state change (lifecycle: ACTIVE → COMPLETED/ABORTED) for table row
   * updates.
   */
  public void recordInstanceDeltaChange(
      UUID instanceId, ProcessDefinitionKey key, ExecutionState state, Long endTimeMillis) {
    try {
      instanceDeltaPublisher.broadcastInstanceDelta(
          instanceId, key, state, endTimeMillis, subscriptionRegistry, objectMapper);
    } catch (Exception e) {
      log.error("Error broadcasting process instance delta: {}", e.getMessage(), e);
    }
  }

  /**
   * Coordinate all broadcasts - called every 100ms. Error isolation: Each publisher wrapped in
   * try-catch.
   */
  private void coordinateBroadcasts() {
    try {
      // Broadcast process instance summaries (global + definition-level)
      try {
        instanceSummaryPublisher.broadcast(subscriptionRegistry, objectMapper);
      } catch (Exception e) {
        log.error("Error in instanceSummaryPublisher.broadcast: {}", e.getMessage(), e);
      }

      // Broadcast flow node states for active version subscriptions
      for (ProcessDefinitionKey key : activeVersionSubscriptions) {
        try {
          flowNodeStatePublisher.broadcastDefinitionState(key, subscriptionRegistry, objectMapper);
        } catch (Exception e) {
          log.error("Error broadcasting definition state for {}: {}", key, e.getMessage(), e);
        }
      }

      // Broadcast animations for active version subscriptions
      for (ProcessDefinitionKey key : activeVersionSubscriptions) {
        try {
          animationPublisher.broadcastForDefinitionVersion(key, subscriptionRegistry, objectMapper);
        } catch (Exception e) {
          log.error("Error broadcasting animations for {}: {}", key, e.getMessage(), e);
        }
      }

      // Broadcast instance states for active instance subscriptions
      for (UUID instanceId : activeInstanceSubscriptions) {
        try {
          flowNodeStatePublisher.broadcastInstanceState(
              instanceId, subscriptionRegistry, objectMapper);
        } catch (Exception e) {
          log.error("Error broadcasting instance state for {}: {}", instanceId, e.getMessage(), e);
        }
      }

      // Broadcast heatmaps for active instance subscriptions
      for (UUID instanceId : activeInstanceSubscriptions) {
        try {
          heatmapPublisher.broadcastForInstance(instanceId, subscriptionRegistry, objectMapper);
        } catch (Exception e) {
          log.error("Error broadcasting heatmap for {}: {}", instanceId, e.getMessage(), e);
        }
      }

    } catch (Exception e) {
      log.error("Error in coordinateBroadcasts: {}", e.getMessage(), e);
    }
  }

  /** Clear all metrics for a specific instance (e.g., when instance completes). */
  public void clearMetricsForInstance(UUID instanceId) {
    try {
      flowNodeStatePublisher.clearInstance(instanceId);
      heatmapPublisher.clearInstance(instanceId);
      activeInstanceSubscriptions.remove(instanceId);
      log.info("Cleared all metrics for instance {}", instanceId);
    } catch (Exception e) {
      log.error("Error clearing metrics for instance {}: {}", instanceId, e.getMessage(), e);
    }
  }

  /**
   * Send immediate global summary to a specific session (called when session subscribes). This
   * provides instant feedback instead of waiting up to 100ms for next broadcast cycle.
   */
  public void sendImmediateGlobalSummary(jakarta.websocket.Session session) {
    try {
      instanceSummaryPublisher.sendImmediateGlobalSummary(session, objectMapper);
    } catch (Exception e) {
      log.error(
          "Error sending immediate global summary to session {}: {}",
          session.getId(),
          e.getMessage(),
          e);
    }
  }
}
