/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 * This file is part of TaktX, licensed under the TaktX Business Source License v1.0.
 * Free use is permitted with up to 3 Kafka partitions per topic. See LICENSE file for details.
 * For commercial use or more partitions and features, contact [https://www.taktx.io/contact].
 */

package io.taktx.console.ingester.inmemory.publishers;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.taktx.console.ingester.inmemory.websocket.ProcessInstanceDeltaMessage;
import io.taktx.console.ingester.inmemory.websocket.SubscriptionRegistry;
import io.taktx.dto.ExecutionState;
import io.taktx.dto.ProcessDefinitionKey;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.websocket.Session;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;

/**
 * Publishes process instance lifecycle state changes (ACTIVE → COMPLETED/ABORTED) to WebSocket
 * subscribers. Broadcasts "process-instance-delta" messages to definition-version subscribers for
 * real-time table updates.
 */
@Slf4j
@ApplicationScoped
public class ProcessInstanceDeltaPublisher {

  // Track last state sent per instance to avoid duplicate broadcasts
  private final Map<UUID, DeltaCache> lastDeltaSent =
      new java.util.concurrent.ConcurrentHashMap<>();

  /**
   * Broadcast process instance state change to ALL connected WebSocket sessions. Frontend will
   * filter and process only relevant updates based on current view. This simple approach ensures
   * updates are never missed due to subscription complexity. Only sends if state actually changed
   * from last broadcast.
   *
   * @param instanceId The process instance ID
   * @param key The process definition key (included in message for frontend filtering)
   * @param state The new execution state
   * @param endTimeMillis The end time in milliseconds (null if still active)
   * @param registry The subscription registry (to get all sessions)
   * @param objectMapper Jackson mapper for JSON serialization
   */
  public void broadcastInstanceDelta(
      UUID instanceId,
      ProcessDefinitionKey key,
      ExecutionState state,
      Long endTimeMillis,
      SubscriptionRegistry registry,
      ObjectMapper objectMapper) {

    // Get ALL connected WebSocket sessions - simple and reliable!
    Set<Session> allSessions = registry.getAllSessions();

    log.debug(
        "broadcastInstanceDelta called: instanceId={}, key={}, state={}, sessions={}",
        instanceId,
        key,
        state.name(),
        allSessions.size());

    if (allSessions.isEmpty()) {
      log.debug("No active WebSocket sessions, skipping broadcast");
      return;
    }

    // Check if we already sent this exact state
    DeltaCache cached = lastDeltaSent.get(instanceId);
    if (cached != null
        && cached.state == state
        && java.util.Objects.equals(cached.endTimeMillis, endTimeMillis)) {
      log.debug(
          "State unchanged for instance {}, skipping broadcast (cached state: {})",
          instanceId,
          cached.state.name());
      return; // No change, skip broadcast
    }

    try {
      ProcessInstanceDeltaMessage message =
          new ProcessInstanceDeltaMessage(
              "process-instance-delta",
              instanceId.toString(),
              key.getProcessDefinitionId(), // Include for frontend filtering
              key.getVersion(), // Include for frontend filtering
              state,
              endTimeMillis);

      String json = objectMapper.writeValueAsString(message);

      // Broadcast to all connected WebSocket sessions
      for (Session session : allSessions) {
        sendToSession(session, json);
      }

      // Cache what we sent
      lastDeltaSent.put(instanceId, new DeltaCache(state, endTimeMillis));

    } catch (Exception e) {
      log.error(
          "Error broadcasting process instance delta for {}: {}", instanceId, e.getMessage(), e);
    }
  }

  /** Clear cached delta for an instance (when instance is removed from memory) */
  public void clearInstance(UUID instanceId) {
    lastDeltaSent.remove(instanceId);
  }

  /** Send message to WebSocket session with error handling */
  private void sendToSession(Session session, String message) {
    try {
      if (session.isOpen()) {
        session.getBasicRemote().sendText(message);
      }
    } catch (Exception e) {
      log.warn("Failed to send message to session {}: {}", session.getId(), e.getMessage());
    }
  }

  /** Simple cache to track last delta sent */
  private record DeltaCache(ExecutionState state, Long endTimeMillis) {}
}
