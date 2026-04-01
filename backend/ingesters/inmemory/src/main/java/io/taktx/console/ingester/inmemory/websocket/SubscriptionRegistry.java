/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 * This file is part of TaktX, licensed under the TaktX Business Source License v1.0.
 * Free use is permitted with up to 3 Kafka partitions per topic. See LICENSE file for details.
 * For commercial use or more partitions and features, contact [https://www.taktx.io/contact].
 */

package io.taktx.console.ingester.inmemory.websocket;

import io.taktx.console.ingester.inmemory.IngestionStore;
import io.taktx.console.ingester.inmemory.ProcessInstanceView;
import io.taktx.dto.ProcessDefinitionKey;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.websocket.Session;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArraySet;
import lombok.extern.slf4j.Slf4j;

/**
 * Manages WebSocket subscriptions at 4 levels: - Global (all definitions) - Definition (all
 * versions of one definition) - Definition-Version (specific version) - Instance (specific process
 * instance)
 */
@Slf4j
@ApplicationScoped
public class SubscriptionRegistry {

  @Inject IngestionStore ingestionStore;

  // Global subscribers (subscribe-all)
  private final Set<Session> globalSubscribers = new CopyOnWriteArraySet<>();

  // Definition subscribers (subscribe-definition): processDefinitionId -> sessions
  private final Map<String, Set<Session>> definitionSubscribers = new ConcurrentHashMap<>();

  // Version subscribers (subscribe-definition-version): ProcessDefinitionKey -> sessions
  private final Map<ProcessDefinitionKey, Set<Session>> versionSubscribers =
      new ConcurrentHashMap<>();

  // Instance subscribers (subscribe-instance): processInstanceId -> sessions
  private final Map<UUID, Set<Session>> instanceSubscribers = new ConcurrentHashMap<>();

  // Track what each session is subscribed to
  private final Map<Session, SubscriptionContext> sessionContexts = new ConcurrentHashMap<>();

  /** Subscribe to global overview (all definitions) */
  public void subscribeAll(Session session) {
    unsubscribeSession(session); // Remove from previous subscription
    globalSubscribers.add(session);
    sessionContexts.put(session, SubscriptionContext.forAll());
    log.info("Session {} subscribed to global overview", session.getId());
  }

  /** Subscribe to all versions of a specific definition */
  public void subscribeToDefinition(Session session, String processDefinitionId) {
    unsubscribeSession(session);
    definitionSubscribers
        .computeIfAbsent(processDefinitionId, id -> new CopyOnWriteArraySet<>())
        .add(session);
    sessionContexts.put(session, SubscriptionContext.forDefinition(processDefinitionId));
    log.info("Session {} subscribed to definition {}", session.getId(), processDefinitionId);
  }

  /** Subscribe to a specific definition version */
  public void subscribeToDefinitionVersion(Session session, ProcessDefinitionKey key) {
    unsubscribeSession(session);
    versionSubscribers.computeIfAbsent(key, k -> new CopyOnWriteArraySet<>()).add(session);
    sessionContexts.put(session, SubscriptionContext.forDefinitionVersion(key));
    log.info("Session {} subscribed to definition version {}", session.getId(), key);
  }

  /** Subscribe to a specific process instance */
  public void subscribeToInstance(Session session, UUID instanceId) {
    unsubscribeSession(session);
    instanceSubscribers.computeIfAbsent(instanceId, id -> new CopyOnWriteArraySet<>()).add(session);
    sessionContexts.put(session, SubscriptionContext.forInstance(instanceId));
    log.info("Session {} subscribed to instance {}", session.getId(), instanceId);
  }

  /** Unsubscribe session from whatever it's currently subscribed to */
  public void unsubscribeSession(Session session) {
    SubscriptionContext context = sessionContexts.remove(session);
    if (context == null) {
      return; // Not subscribed to anything
    }

    switch (context.type()) {
      case ALL:
        globalSubscribers.remove(session);
        break;
      case DEFINITION:
        if (context.processDefinitionId() != null) {
          Set<Session> sessions = definitionSubscribers.get(context.processDefinitionId());
          if (sessions != null) {
            sessions.remove(session);
            if (sessions.isEmpty()) {
              definitionSubscribers.remove(context.processDefinitionId());
            }
          }
        }
        break;
      case DEFINITION_VERSION:
        ProcessDefinitionKey key = context.getProcessDefinitionKey();
        if (key != null) {
          Set<Session> sessions = versionSubscribers.get(key);
          if (sessions != null) {
            sessions.remove(session);
            if (sessions.isEmpty()) {
              versionSubscribers.remove(key);
            }
          }
        }
        break;
      case INSTANCE:
        if (context.processInstanceId() != null) {
          Set<Session> sessions = instanceSubscribers.get(context.processInstanceId());
          if (sessions != null) {
            sessions.remove(session);
            if (sessions.isEmpty()) {
              instanceSubscribers.remove(context.processInstanceId());
            }
          }
        }
        break;
    }

    log.info("Session {} unsubscribed from {}", session.getId(), context.type());
  }

  // Query methods for publishers

  public Set<Session> getGlobalSubscribers() {
    return globalSubscribers;
  }

  public Set<Session> getDefinitionSubscribers(String processDefinitionId) {
    return definitionSubscribers.getOrDefault(processDefinitionId, Set.of());
  }

  public Set<Session> getVersionSubscribers(ProcessDefinitionKey key) {
    return versionSubscribers.getOrDefault(key, Set.of());
  }

  public Set<Session> getInstanceSubscribers(UUID instanceId) {
    return instanceSubscribers.getOrDefault(instanceId, Set.of());
  }

  /**
   * Get ALL active WebSocket sessions regardless of subscription type. Used for broadcasting
   * messages that should reach all connected clients.
   */
  public Set<Session> getAllSessions() {
    Set<Session> allSessions = new java.util.HashSet<>(sessionContexts.keySet());
    // Filter out closed sessions
    allSessions.removeIf(session -> !session.isOpen());
    return allSessions;
  }

  /**
   * Get the process definition key for a given instance ID. Used when subscribing by instance ID to
   * determine which definition it belongs to.
   */
  public ProcessDefinitionKey getInstanceDefinitionKey(UUID instanceId) {
    ProcessInstanceView view = ingestionStore.getProcessInstanceById(instanceId);
    if (view != null) {
      return new ProcessDefinitionKey(view.getProcessDefinitionId(), view.getVersion());
    }
    return null;
  }

  /** Get subscription context for a session (for debugging/monitoring) */
  public SubscriptionContext getSessionContext(Session session) {
    return sessionContexts.get(session);
  }
}
