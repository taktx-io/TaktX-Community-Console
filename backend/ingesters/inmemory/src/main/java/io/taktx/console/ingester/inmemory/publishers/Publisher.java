/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 * This file is part of TaktX, licensed under the TaktX Business Source License v1.0.
 * Free use is permitted with up to 3 Kafka partitions per topic. See LICENSE file for details.
 * For commercial use or more partitions and features, contact [https://www.taktx.io/contact].
 */

package io.taktx.console.ingester.inmemory.publishers;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.taktx.console.ingester.inmemory.websocket.SubscriptionRegistry;
import io.taktx.dto.ExecutionState;
import io.taktx.dto.ProcessDefinitionKey;
import jakarta.websocket.Session;

/**
 * Publisher interface for broadcasting WebSocket messages. Each publisher handles specific message
 * types and subscription scopes.
 */
public interface Publisher {

  /** Record a flow node event for aggregation. Not all publishers need to handle this. */
  default void recordFlowNodeEvent(
      ProcessDefinitionKey key,
      java.util.UUID instanceId,
      String flowNodeId,
      String flowNodeInstancePath,
      ExecutionState state,
      java.util.List<String> sequenceFlowIds) {
    // Optional - override if publisher needs flow node events
  }

  /** Record a process instance state transition. Not all publishers need to handle this. */
  default void recordInstanceStateChange(
      ProcessDefinitionKey key, ExecutionState oldState, ExecutionState newState) {
    // Optional - override if publisher needs instance state changes
  }

  /** Broadcast accumulated data to subscribed sessions. Called every 100ms by coordinator. */
  void broadcast(SubscriptionRegistry registry, ObjectMapper objectMapper);

  /** Clear data for a specific instance (cleanup). */
  default void clearInstance(java.util.UUID instanceId) {
    // Optional - override if publisher tracks per-instance data
  }

  /** Helper method to send message to a session safely. */
  default void sendToSession(Session session, String json) {
    if (session.isOpen()) {
      try {
        session.getAsyncRemote().sendText(json);
      } catch (Exception e) {
        // Log handled by caller
      }
    }
  }
}
