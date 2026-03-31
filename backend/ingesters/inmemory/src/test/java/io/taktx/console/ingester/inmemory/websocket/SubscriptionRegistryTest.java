/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 */

package io.taktx.console.ingester.inmemory.websocket;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import io.taktx.console.ingester.inmemory.InstanceUpdateRegistry;
import io.taktx.console.ingester.inmemory.ProcessInstanceView;
import io.taktx.dto.ExecutionState;
import io.taktx.dto.ProcessDefinitionKey;
import jakarta.websocket.Session;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

/**
 * Tests for SubscriptionRegistry. Tests the core purpose: manage 4-level WebSocket subscriptions
 * with clean transitions.
 */
class SubscriptionRegistryTest {

  private SubscriptionRegistry registry;
  private InstanceUpdateRegistry instanceRegistry;
  private Session session1;
  private Session session2;
  private ProcessDefinitionKey orderV1;
  private ProcessDefinitionKey orderV2;
  private UUID instance1;

  @BeforeEach
  void setUp() {
    instanceRegistry = mock(InstanceUpdateRegistry.class);
    registry = new SubscriptionRegistry();
    registry.instanceUpdateRegistry = instanceRegistry;

    session1 = Mockito.mock(Session.class);
    session2 = Mockito.mock(Session.class);
    when(session1.getId()).thenReturn("session-1");
    when(session2.getId()).thenReturn("session-2");

    orderV1 = new ProcessDefinitionKey("order-process", 1);
    orderV2 = new ProcessDefinitionKey("order-process", 2);
    instance1 = UUID.randomUUID();
  }

  @Test
  void shouldSubscribeToGlobalView() {
    // When: Subscribe to global
    registry.subscribeAll(session1);

    // Then: Session in global subscribers
    Set<Session> subscribers = registry.getGlobalSubscribers();
    assertTrue(subscribers.contains(session1));
    assertEquals(1, subscribers.size());
  }

  @Test
  void shouldSubscribeToDefinition() {
    // When: Subscribe to definition (all versions)
    registry.subscribeToDefinition(session1, "order-process");

    // Then: Session in definition subscribers
    Set<Session> subscribers = registry.getDefinitionSubscribers("order-process");
    assertTrue(subscribers.contains(session1));
  }

  @Test
  void shouldSubscribeToDefinitionVersion() {
    // When: Subscribe to specific version
    registry.subscribeToDefinitionVersion(session1, orderV1);

    // Then: Session in version subscribers
    Set<Session> subscribers = registry.getVersionSubscribers(orderV1);
    assertTrue(subscribers.contains(session1));
  }

  @Test
  void shouldSubscribeToInstance() {
    // When: Subscribe to instance
    registry.subscribeToInstance(session1, instance1);

    // Then: Session in instance subscribers
    Set<Session> subscribers = registry.getInstanceSubscribers(instance1);
    assertTrue(subscribers.contains(session1));
  }

  @Test
  void shouldAutoUnsubscribeWhenSwitchingLevels() {
    // Given: Subscribed to global
    registry.subscribeAll(session1);

    // When: Switch to definition
    registry.subscribeToDefinition(session1, "order-process");

    // Then: Removed from global, added to definition
    assertFalse(registry.getGlobalSubscribers().contains(session1));
    assertTrue(registry.getDefinitionSubscribers("order-process").contains(session1));
  }

  @Test
  void shouldSupportMultipleSessions() {
    // When: Multiple sessions subscribe to same level
    registry.subscribeToDefinitionVersion(session1, orderV1);
    registry.subscribeToDefinitionVersion(session2, orderV1);

    // Then: Both tracked
    Set<Session> subscribers = registry.getVersionSubscribers(orderV1);
    assertEquals(2, subscribers.size());
    assertTrue(subscribers.contains(session1));
    assertTrue(subscribers.contains(session2));
  }

  @Test
  void shouldIsolateDifferentVersions() {
    // When: Sessions subscribe to different versions
    registry.subscribeToDefinitionVersion(session1, orderV1);
    registry.subscribeToDefinitionVersion(session2, orderV2);

    // Then: Each version has own subscribers
    assertEquals(1, registry.getVersionSubscribers(orderV1).size());
    assertEquals(1, registry.getVersionSubscribers(orderV2).size());
    assertTrue(registry.getVersionSubscribers(orderV1).contains(session1));
    assertTrue(registry.getVersionSubscribers(orderV2).contains(session2));
  }

  @Test
  void shouldUnsubscribeFromAll() {
    // Given: Session subscribed to version
    registry.subscribeToDefinitionVersion(session1, orderV1);

    // When: Unsubscribe
    registry.unsubscribeSession(session1);

    // Then: Removed from all subscriptions
    assertFalse(registry.getVersionSubscribers(orderV1).contains(session1));
  }

  @Test
  void shouldCleanupEmptySubscriptionSets() {
    // Given: Session subscribed
    registry.subscribeToDefinitionVersion(session1, orderV1);

    // When: Unsubscribe (leaves empty set)
    registry.unsubscribeSession(session1);

    // Then: Empty set removed (returns empty, not null)
    Set<Session> subscribers = registry.getVersionSubscribers(orderV1);
    assertTrue(subscribers.isEmpty());
  }

  @Test
  void shouldTrackSubscriptionContext() {
    // When: Subscribe to definition version
    registry.subscribeToDefinitionVersion(session1, orderV1);

    // Then: Context tracked
    SubscriptionContext context = registry.getSessionContext(session1);
    assertNotNull(context);
    assertEquals(SubscriptionType.DEFINITION_VERSION, context.type());
    assertEquals("order-process", context.processDefinitionId());
    assertEquals(1, context.version());
  }

  @Test
  void shouldLookupInstanceDefinitionKey() {
    // Given: Instance exists in registry
    ProcessInstanceView view =
        ProcessInstanceView.builder()
            .processInstanceId(instance1)
            .processDefinitionId("order-process")
            .version(1)
            .state(ExecutionState.ACTIVE)
            .build();
    when(instanceRegistry.getProcessInstanceById(instance1)).thenReturn(view);

    // When: Look up definition key
    ProcessDefinitionKey key = registry.getInstanceDefinitionKey(instance1);

    // Then: Returns correct key
    assertNotNull(key);
    assertEquals("order-process", key.getProcessDefinitionId());
    assertEquals(1, key.getVersion());
  }

  @Test
  void shouldReturnNullForUnknownInstance() {
    // Given: Instance not found
    when(instanceRegistry.getProcessInstanceById(instance1)).thenReturn(null);

    // When: Look up definition key
    ProcessDefinitionKey key = registry.getInstanceDefinitionKey(instance1);

    // Then: Returns null
    assertNull(key);
  }

  @Test
  void shouldReturnEmptySetForUnsubscribedLevel() {
    // When: Query level with no subscribers
    Set<Session> subscribers = registry.getVersionSubscribers(orderV1);

    // Then: Returns empty set (not null)
    assertNotNull(subscribers);
    assertTrue(subscribers.isEmpty());
  }

  @Test
  void shouldSupportConcurrentIteration() {
    // Given: Multiple subscribers
    registry.subscribeToDefinitionVersion(session1, orderV1);
    registry.subscribeToDefinitionVersion(session2, orderV1);

    // When: Get subscribers (uses CopyOnWriteArraySet)
    Set<Session> subscribers = registry.getVersionSubscribers(orderV1);

    // Then: Can iterate safely (CopyOnWriteArraySet allows concurrent modification)
    assertDoesNotThrow(
        () -> {
          for (Session session : subscribers) {
            // Simulate concurrent modification
            registry.unsubscribeSession(session);
          }
        });
  }

  @Test
  void shouldPreserveContextAfterUnsubscribe() {
    // Given: Session subscribed and unsubscribed
    registry.subscribeToDefinitionVersion(session1, orderV1);
    registry.unsubscribeSession(session1);

    // When: Check context
    SubscriptionContext context = registry.getSessionContext(session1);

    // Then: Context removed
    assertNull(context);
  }

  @Test
  void shouldSupportQuickSubscriptionChanges() {
    // When: Rapidly switch subscription types
    registry.subscribeAll(session1);
    registry.subscribeToDefinition(session1, "order-process");
    registry.subscribeToDefinitionVersion(session1, orderV1);
    registry.subscribeToInstance(session1, instance1);

    // Then: Only last subscription active
    assertTrue(registry.getInstanceSubscribers(instance1).contains(session1));
    assertFalse(registry.getGlobalSubscribers().contains(session1));
    assertFalse(registry.getDefinitionSubscribers("order-process").contains(session1));
    assertFalse(registry.getVersionSubscribers(orderV1).contains(session1));
  }
}
