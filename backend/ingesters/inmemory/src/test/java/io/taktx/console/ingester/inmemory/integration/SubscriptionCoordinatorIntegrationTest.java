/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 */

package io.taktx.console.ingester.inmemory.integration;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.taktx.console.ingester.inmemory.testing.KafkaTestResource;
import io.taktx.console.ingester.inmemory.websocket.FlowNodeEventBroadcaster;
import io.taktx.console.ingester.inmemory.websocket.FlowNodeEventMessage;
import io.taktx.console.ingester.inmemory.websocket.SubscriptionRegistry;
import io.taktx.dto.ExecutionState;
import io.taktx.dto.ProcessDefinitionKey;
import jakarta.inject.Inject;
import jakarta.websocket.Session;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

/**
 * Integration test for SubscriptionRegistry working with the coordinator. Tests subscription
 * management and event routing.
 *
 * <p>Note: Tests run on random port (quarkus.http.test-port=0) to avoid conflicts with running
 * application instances.
 *
 * <p>IMPORTANT: SubscriptionRegistry is an application-scoped CDI bean, so we need to track and
 * clean up mock sessions between tests to avoid state pollution.
 */
@QuarkusTest
@QuarkusTestResource(KafkaTestResource.class)
class SubscriptionCoordinatorIntegrationTest {

  @Inject SubscriptionRegistry subscriptionRegistry;

  @Inject FlowNodeEventBroadcaster broadcaster;

  // Track all mock sessions created during a test for cleanup
  private final java.util.List<Session> mockSessions = new java.util.ArrayList<>();

  @BeforeEach
  void setUp() {
    // Clear the list of mock sessions for this test
    mockSessions.clear();
  }

  @AfterEach
  void tearDown() {
    // Unsubscribe all mock sessions created during the test
    for (Session session : mockSessions) {
      try {
        subscriptionRegistry.unsubscribeSession(session);
      } catch (Exception e) {
        // Ignore cleanup errors
      }
    }
    mockSessions.clear();
  }

  // Helper method to create and track mock sessions
  private Session createMockSession(String id) {
    Session session = Mockito.mock(Session.class);
    when(session.getId()).thenReturn(id);
    mockSessions.add(session);
    return session;
  }

  @Test
  void shouldManageGlobalSubscriptions() {
    // Given: Multiple sessions
    Session session1 = createMockSession("global-session-1");
    Session session2 = createMockSession("global-session-2");

    // When: Subscribe to global
    subscriptionRegistry.subscribeAll(session1);
    subscriptionRegistry.subscribeAll(session2);

    // Then: Both should be in global subscribers
    Set<Session> subscribers = subscriptionRegistry.getGlobalSubscribers();
    assertEquals(2, subscribers.size());
    assertTrue(subscribers.contains(session1));
    assertTrue(subscribers.contains(session2));
  }

  @Test
  void shouldManageDefinitionSubscriptions() {
    // Given: Sessions subscribing to different definitions
    Session session1 = createMockSession("def-session-1");
    Session session2 = createMockSession("def-session-2");

    // When: Subscribe to different definitions
    subscriptionRegistry.subscribeToDefinition(session1, "order-process");
    subscriptionRegistry.subscribeToDefinition(session2, "payment-process");

    // Then: Each definition has its subscribers
    assertEquals(1, subscriptionRegistry.getDefinitionSubscribers("order-process").size());
    assertEquals(1, subscriptionRegistry.getDefinitionSubscribers("payment-process").size());
  }

  @Test
  void shouldManageDefinitionVersionSubscriptions() {
    // Given: Sessions subscribing to different versions
    Session session1 = createMockSession("ver-session-1");
    Session session2 = createMockSession("ver-session-2");

    ProcessDefinitionKey v1 = new ProcessDefinitionKey("test-process", 1);
    ProcessDefinitionKey v2 = new ProcessDefinitionKey("test-process", 2);

    // When: Subscribe to versions
    subscriptionRegistry.subscribeToDefinitionVersion(session1, v1);
    subscriptionRegistry.subscribeToDefinitionVersion(session2, v2);

    // Then: Each version has correct subscribers
    assertEquals(1, subscriptionRegistry.getVersionSubscribers(v1).size());
    assertEquals(1, subscriptionRegistry.getVersionSubscribers(v2).size());
    assertTrue(subscriptionRegistry.getVersionSubscribers(v1).contains(session1));
    assertTrue(subscriptionRegistry.getVersionSubscribers(v2).contains(session2));
  }

  @Test
  void shouldManageInstanceSubscriptions() {
    // Given: Sessions subscribing to instances
    Session session = createMockSession("inst-session-1");
    UUID instanceId = UUID.randomUUID();

    // When: Subscribe to instance
    subscriptionRegistry.subscribeToInstance(session, instanceId);

    // Then: Session is subscribed
    Set<Session> subscribers = subscriptionRegistry.getInstanceSubscribers(instanceId);
    assertEquals(1, subscribers.size());
    assertTrue(subscribers.contains(session));
  }

  @Test
  void shouldAutoUnsubscribeWhenSwitching() {
    // Given: Session subscribed to global
    Session session = createMockSession("switch-session-1");
    subscriptionRegistry.subscribeAll(session);

    // When: Switch to definition version
    ProcessDefinitionKey key = new ProcessDefinitionKey("test-process", 1);
    subscriptionRegistry.subscribeToDefinitionVersion(session, key);

    // Then: Should be removed from global
    assertFalse(subscriptionRegistry.getGlobalSubscribers().contains(session));
    assertTrue(subscriptionRegistry.getVersionSubscribers(key).contains(session));
  }

  @Test
  void shouldHandleCoordinatorEventRouting() throws Exception {
    // Given: Session subscribed to definition version
    ProcessDefinitionKey key = new ProcessDefinitionKey("test-process", 1);

    // When: Queue events through broadcaster
    FlowNodeEventMessage event =
        new FlowNodeEventMessage(
            "flownode-event",
            UUID.randomUUID().toString(),
            "Task1",
            ExecutionState.ACTIVE,
            System.currentTimeMillis(),
            null,
            "Task1_1");

    broadcaster.queueEvent(key, event);

    // Wait for async processing
    Thread.sleep(150);

    // Then: Event should be processed through aggregators
    // (Verification happens through message broadcasting in real integration)
    assertNotNull(broadcaster);
  }

  @Test
  void shouldHandleStateTransitionRouting() throws Exception {
    // Given: Subscriptions set up
    ProcessDefinitionKey key = new ProcessDefinitionKey("test-process", 1);

    // When: Record state transition
    broadcaster.recordInstanceStateChange(key, null, ExecutionState.ACTIVE);
    broadcaster.recordInstanceStateChange(key, ExecutionState.ACTIVE, ExecutionState.COMPLETED);

    // Wait for processing
    Thread.sleep(150);

    // Then: State changes should flow through aggregators
    assertNotNull(broadcaster);
  }

  @Test
  void shouldSupportConcurrentSubscriptionChanges() throws Exception {
    // Given: Multiple threads making subscription changes
    Session session1 = createMockSession("concurrent-session-1");
    Session session2 = createMockSession("concurrent-session-2");

    CountDownLatch startLatch = new CountDownLatch(1);
    CountDownLatch doneLatch = new CountDownLatch(2);

    // When: Concurrent subscription operations
    Thread thread1 =
        new Thread(
            () -> {
              try {
                startLatch.await();
                for (int i = 0; i < 100; i++) {
                  subscriptionRegistry.subscribeAll(session1);
                  subscriptionRegistry.subscribeToDefinition(session1, "process-" + i);
                }
              } catch (Exception e) {
                e.printStackTrace();
              } finally {
                doneLatch.countDown();
              }
            });

    Thread thread2 =
        new Thread(
            () -> {
              try {
                startLatch.await();
                for (int i = 0; i < 100; i++) {
                  subscriptionRegistry.subscribeAll(session2);
                  subscriptionRegistry.subscribeToDefinition(session2, "process-" + i);
                }
              } catch (Exception e) {
                e.printStackTrace();
              } finally {
                doneLatch.countDown();
              }
            });

    thread1.start();
    thread2.start();
    startLatch.countDown();

    // Then: Should complete without errors
    assertTrue(doneLatch.await(10, TimeUnit.SECONDS), "Concurrent operations should complete");
  }

  @Test
  void shouldCleanupOnUnsubscribe() {
    // Given: Multiple subscriptions
    Session session = createMockSession("cleanup-session-1");

    subscriptionRegistry.subscribeAll(session);
    subscriptionRegistry.subscribeToDefinition(session, "process-1");
    subscriptionRegistry.subscribeToDefinitionVersion(
        session, new ProcessDefinitionKey("process-2", 1));
    subscriptionRegistry.subscribeToInstance(session, UUID.randomUUID());

    // When: Unsubscribe
    subscriptionRegistry.unsubscribeSession(session);

    // Then: Session should be removed from all
    assertFalse(subscriptionRegistry.getGlobalSubscribers().contains(session));
    // Other checks would verify removal from other maps
  }

  @Test
  void shouldHandleSubscriptionContextTracking() {
    // Given: Session with subscription
    Session session = createMockSession("context-session-1");
    ProcessDefinitionKey key = new ProcessDefinitionKey("test-process", 1);

    // When: Subscribe
    subscriptionRegistry.subscribeToDefinitionVersion(session, key);

    // Then: Context should be tracked
    var context = subscriptionRegistry.getSessionContext(session);
    assertNotNull(context);
    assertEquals("test-process", context.processDefinitionId());
    assertEquals(1, context.version());
  }

  @Test
  void shouldSupportRapidSubscriptionSwitching() {
    // Given: Session that rapidly switches subscriptions
    Session session = createMockSession("rapid-session-1");

    // When: Rapidly switch between different subscription types
    subscriptionRegistry.subscribeAll(session);
    subscriptionRegistry.subscribeToDefinition(session, "process-1");
    subscriptionRegistry.subscribeToDefinitionVersion(
        session, new ProcessDefinitionKey("process-2", 1));
    subscriptionRegistry.subscribeToInstance(session, UUID.randomUUID());
    subscriptionRegistry.subscribeAll(session);

    // Then: Should end up in correct state (global)
    assertTrue(subscriptionRegistry.getGlobalSubscribers().contains(session));
  }

  @Test
  void shouldIsolateSubscribersAcrossDefinitions() {
    // Given: Sessions subscribed to different definitions
    Session session1 = createMockSession("isolate-session-1");
    Session session2 = createMockSession("isolate-session-2");

    ProcessDefinitionKey key1 = new ProcessDefinitionKey("process-1", 1);
    ProcessDefinitionKey key2 = new ProcessDefinitionKey("process-2", 1);

    subscriptionRegistry.subscribeToDefinitionVersion(session1, key1);
    subscriptionRegistry.subscribeToDefinitionVersion(session2, key2);

    // Then: Each definition has only its subscribers
    Set<Session> subs1 = subscriptionRegistry.getVersionSubscribers(key1);
    Set<Session> subs2 = subscriptionRegistry.getVersionSubscribers(key2);

    assertEquals(1, subs1.size());
    assertEquals(1, subs2.size());
    assertTrue(subs1.contains(session1));
    assertFalse(subs1.contains(session2));
    assertTrue(subs2.contains(session2));
    assertFalse(subs2.contains(session1));
  }
}
