/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 * This file is part of TaktX, licensed under the TaktX Business Source License v1.0.
 * Free use is permitted with up to 3 Kafka partitions per topic. See LICENSE file for details.
 * For commercial use or more partitions and features, contact [https://www.taktx.io/contact].
 */

package io.taktx.console.ingester.inmemory.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.taktx.dto.ProcessDefinitionKey;
import io.taktx.security.AuthorizationTokenValidator;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.websocket.*;
import jakarta.websocket.server.ServerEndpoint;
import java.io.IOException;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@ApplicationScoped
@ServerEndpoint("/ws/process-events")
public class ProcessEventWebSocket {

  @Inject FlowNodeEventBroadcaster broadcaster;

  @Inject SubscriptionRegistry subscriptionRegistry;

  private final ObjectMapper objectMapper = new ObjectMapper();

  @OnOpen
  public void onOpen(Session session) {
    // Extract token from query string: ws://host/ws/process-events?token=<readToken>
    String token = extractToken(session);
    if (token == null) {
      log.warn("WS session {} rejected: missing token query parameter", session.getId());
      closeUnauthorized(session, "Missing token");
    }
  }

  @OnClose
  public void onClose(Session session) {
    try {
      subscriptionRegistry.unsubscribeSession(session);
      log.info("WebSocket connection closed and unsubscribed: {}", session.getId());
    } catch (Exception e) {
      log.warn(
          "Error while unsubscribing session {} on close: {}", session.getId(), e.getMessage());
    }
  }

  @OnError
  public void onError(Session session, Throwable throwable) {
    log.error(
        "WebSocket error for session {}: {}", session.getId(), throwable.getMessage(), throwable);
    try {
      subscriptionRegistry.unsubscribeSession(session);
    } catch (Exception e) {
      log.warn(
          "Error while unsubscribing session {} on error: {}", session.getId(), e.getMessage());
    }
  }

  @OnMessage
  public void onMessage(String message, Session session) {
    log.info("Received WebSocket message from session {}: {}", session.getId(), message);
    try {
      SubscribeMessage msg = objectMapper.readValue(message, SubscribeMessage.class);

      switch (msg.getType()) {
        case "subscribe-all":
          subscriptionRegistry.subscribeAll(session);
          log.info("Session {} subscribed to global overview", session.getId());
          // Send immediate snapshot instead of waiting for next broadcast
          broadcaster.sendImmediateGlobalSummary(session);
          break;

        case "subscribe-definition":
          if (msg.getProcessDefinitionId() == null) {
            log.warn(
                "Session {} sent subscribe-definition without processDefinitionId",
                session.getId());
            return;
          }
          subscriptionRegistry.subscribeToDefinition(session, msg.getProcessDefinitionId());
          log.info(
              "Session {} subscribed to definition {}",
              session.getId(),
              msg.getProcessDefinitionId());
          break;

        case "subscribe-definition-version":
          if (msg.getProcessDefinitionId() == null || msg.getVersion() == null) {
            log.warn(
                "Session {} sent subscribe-definition-version without required fields",
                session.getId());
            return;
          }
          ProcessDefinitionKey key =
              new ProcessDefinitionKey(msg.getProcessDefinitionId(), msg.getVersion());
          subscriptionRegistry.subscribeToDefinitionVersion(session, key);
          log.info("Session {} subscribed to definition version {}", session.getId(), key);
          break;

        case "subscribe-instance":
          if (msg.getProcessInstanceId() == null) {
            log.warn(
                "Session {} sent subscribe-instance without processInstanceId", session.getId());
            return;
          }
          try {
            java.util.UUID instanceId = java.util.UUID.fromString(msg.getProcessInstanceId());
            subscriptionRegistry.subscribeToInstance(session, instanceId);
            log.info("Session {} subscribed to instance {}", session.getId(), instanceId);
          } catch (IllegalArgumentException ex) {
            log.warn(
                "Invalid processInstanceId from session {}: {}",
                session.getId(),
                msg.getProcessInstanceId());
          }
          break;

        case "unsubscribe":
          subscriptionRegistry.unsubscribeSession(session);
          log.info("Session {} unsubscribed", session.getId());
          break;

        default:
          log.warn("Unknown message type from session {}: {}", session.getId(), msg.getType());
      }
    } catch (Exception e) {
      log.error("Error processing WebSocket message: {}", e.getMessage(), e);
    }
  }

  private String extractToken(Session session) {
    String query = session.getQueryString(); // e.g. "token=eyJ..."
    if (query == null || query.isBlank()) return null;
    for (String part : query.split("&")) {
      String[] kv = part.split("=", 2);
      if (kv.length == 2 && "token".equals(kv[0])) return kv[1];
    }
    return null;
  }

  private void closeUnauthorized(Session session, String reason) {
    try {
      session.close(
          new CloseReason(CloseReason.CloseCodes.VIOLATED_POLICY, "Unauthorized: " + reason));
    } catch (IOException e) {
      log.debug("Error closing unauthorized WS session {}: {}", session.getId(), e.getMessage());
    }
  }
}
