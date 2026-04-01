/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 */

package io.taktx.console.ingester.inmemory.integration;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.common.http.TestHTTPResource;
import io.quarkus.test.junit.QuarkusTest;
import io.taktx.console.ingester.inmemory.InstanceUpdateRegistry;
import io.taktx.console.ingester.inmemory.testing.KafkaTestResource;
import io.taktx.console.ingester.inmemory.websocket.FlowNodeEventBroadcaster;
import io.taktx.console.ingester.inmemory.websocket.FlowNodeEventMessage;
import io.taktx.dto.ExecutionState;
import io.taktx.dto.ProcessDefinitionKey;
import jakarta.inject.Inject;
import jakarta.websocket.*;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Integration test for WebSocket broadcasting architecture. Tests the complete message flow from
 * event ingestion to WebSocket delivery.
 *
 * <p>Note: Uses @TestHTTPResource to get the WebSocket URI with the random test port
 * (quarkus.http.test-port=0) to avoid conflicts with running application.
 */
@QuarkusTest
@QuarkusTestResource(KafkaTestResource.class)
class WebSocketBroadcastingIntegrationTest {

  @TestHTTPResource("/ws/process-events")
  URI websocketUri;

  @Inject FlowNodeEventBroadcaster broadcaster;
  @Inject InstanceUpdateRegistry instanceRegistry;

  private final ObjectMapper objectMapper = new ObjectMapper();
  private TestWebSocketClient client;
  private Session session;

  @BeforeEach
  void setUp() throws Exception {
    // Connect directly; WebSocket endpoint no longer requires auth token in tests.
    client = new TestWebSocketClient();
    session = ContainerProvider.getWebSocketContainer().connectToServer(client, websocketUri);

    // Wait for connection to be established and verify it stayed open
    Thread.sleep(200);

    if (session == null || !session.isOpen()) {
      throw new IllegalStateException(
          "WebSocket session was not established. Check endpoint startup and connection setup.");
    }
  }

  @AfterEach
  void tearDown() throws Exception {
    if (session != null && session.isOpen()) {
      session.close();
    }
  }

  @Test
  void shouldReceiveProcessDefinitionAggregateState() throws Exception {
    // Given: Subscribe to definition version
    String subscribeMsg =
        """
        {
          "type": "subscribe-definition-version",
          "processDefinitionId": "test-process",
          "version": 1
        }
        """;
    session.getBasicRemote().sendText(subscribeMsg);
    Thread.sleep(100);

    // When: Queue flow node events
    ProcessDefinitionKey key = new ProcessDefinitionKey("test-process", 1);
    FlowNodeEventMessage event =
        new FlowNodeEventMessage(
            "flownode-event",
            null,
            "Task1",
            ExecutionState.ACTIVE,
            System.currentTimeMillis(),
            null,
            null);
    broadcaster.queueEvent(key, event);

    // Wait for broadcast cycle (100ms + buffer)
    Thread.sleep(250);

    // Then: Should receive aggregate state message
    List<String> messages = client.getReceivedMessages();
    assertTrue(messages.size() > 0, "Should receive at least one message");

    boolean foundAggregateState =
        messages.stream().anyMatch(msg -> msg.contains("process-definition-aggregate-state"));
    assertTrue(foundAggregateState, "Should receive aggregate state message");
  }

  @Test
  void shouldReceiveGlobalProcessDefinitionsSummary() throws Exception {
    // Given: Subscribe to global view
    String subscribeMsg = """
        {
          "type": "subscribe-all"
        }
        """;
    session.getBasicRemote().sendText(subscribeMsg);
    Thread.sleep(100);

    // When: Record instance state change
    ProcessDefinitionKey key = new ProcessDefinitionKey("test-process", 1);
    broadcaster.recordInstanceStateChange(key, null, ExecutionState.ACTIVE);

    // Wait for multiple broadcast cycles
    Thread.sleep(1000);

    // Then: Should receive global summary
    List<String> messages = client.getReceivedMessages();

    boolean foundSummary =
        messages.stream()
            .anyMatch(msg -> msg.contains("process-definitions-with-versions-summary"));
    assertTrue(foundSummary, "Should receive global definitions summary");
  }

  @Test
  void shouldReceiveDefinitionVersionsSummary() throws Exception {
    // Given: Subscribe to global view (to receive versions summary)
    String subscribeMsg = """
        {
          "type": "subscribe-all"
        }
        """;
    session.getBasicRemote().sendText(subscribeMsg);
    Thread.sleep(100);

    // When: Record instance state changes for multiple versions
    broadcaster.recordInstanceStateChange(
        new ProcessDefinitionKey("test-process", 1), null, ExecutionState.ACTIVE);
    broadcaster.recordInstanceStateChange(
        new ProcessDefinitionKey("test-process", 2), null, ExecutionState.ACTIVE);

    // Wait for broadcast cycles
    Thread.sleep(500);

    // Then: Should receive versions summary
    List<String> messages = client.getReceivedMessages();
    boolean foundVersionsSummary =
        messages.stream()
            .anyMatch(msg -> msg.contains("process-definitions-with-versions-summary"));
    assertTrue(foundVersionsSummary, "Should receive definition versions summary");
  }

  @Test
  void shouldReceiveAnimationEvents() throws Exception {
    // Given: Subscribe to definition version
    String subscribeMsg =
        """
        {
          "type": "subscribe-definition-version",
          "processDefinitionId": "test-process",
          "version": 1
        }
        """;
    session.getBasicRemote().sendText(subscribeMsg);
    Thread.sleep(100);

    // When: Queue animation events
    ProcessDefinitionKey key = new ProcessDefinitionKey("test-process", 1);
    FlowNodeEventMessage event =
        new FlowNodeEventMessage(
            "flownode-event",
            null,
            "Task1",
            ExecutionState.COMPLETED,
            System.currentTimeMillis(),
            List.of("seq1", "seq2"),
            null);
    broadcaster.queueEvent(key, event);

    // Wait for broadcast cycle
    Thread.sleep(250);

    // Then: Should receive animation message
    List<String> messages = client.getReceivedMessages();
    boolean foundAnimation = messages.stream().anyMatch(msg -> msg.contains("flownode-activity"));
    assertTrue(foundAnimation, "Should receive animation events");
  }

  @Test
  void shouldSwitchSubscriptionTypes() throws Exception {
    // Given: Subscribe to global
    session
        .getBasicRemote()
        .sendText("""
        {
          "type": "subscribe-all"
        }
        """);
    Thread.sleep(100);
    client.clearMessages();

    // When: Switch to definition version
    session
        .getBasicRemote()
        .sendText(
            """
        {
          "type": "subscribe-definition-version",
          "processDefinitionId": "test-process",
          "version": 1
        }
        """);
    Thread.sleep(100);

    ProcessDefinitionKey key = new ProcessDefinitionKey("test-process", 1);
    broadcaster.queueEvent(
        key,
        new FlowNodeEventMessage(
            "flownode-event",
            null,
            "Task1",
            ExecutionState.ACTIVE,
            System.currentTimeMillis(),
            null,
            null));

    Thread.sleep(250);

    // Then: Should receive definition version messages, not global
    List<String> messages = client.getReceivedMessages();
    boolean hasAggregateState =
        messages.stream().anyMatch(msg -> msg.contains("process-definition-aggregate-state"));
    assertTrue(hasAggregateState, "Should receive definition version messages");
  }

  @Test
  void shouldUnsubscribeCleanly() throws Exception {
    // Given: Subscribed
    session
        .getBasicRemote()
        .sendText(
            """
        {
          "type": "subscribe-definition-version",
          "processDefinitionId": "test-process",
          "version": 1
        }
        """);
    Thread.sleep(100);
    client.clearMessages();

    // When: Unsubscribe
    session
        .getBasicRemote()
        .sendText("""
        {
          "type": "unsubscribe"
        }
        """);
    Thread.sleep(100);

    // Queue event
    ProcessDefinitionKey key = new ProcessDefinitionKey("test-process", 1);
    broadcaster.queueEvent(
        key,
        new FlowNodeEventMessage(
            "flownode-event",
            null,
            "Task1",
            ExecutionState.ACTIVE,
            System.currentTimeMillis(),
            null,
            null));

    Thread.sleep(250);

    // Then: Should not receive any messages
    List<String> messages = client.getReceivedMessages();
    assertEquals(0, messages.size(), "Should not receive messages after unsubscribe");
  }

  @Test
  void shouldHandleMultipleConcurrentSubscribers() throws Exception {
    // Given: Multiple clients
    TestWebSocketClient client2 = new TestWebSocketClient();
    TestWebSocketClient client3 = new TestWebSocketClient();

    Session session2 =
        ContainerProvider.getWebSocketContainer().connectToServer(client2, websocketUri);
    Session session3 =
        ContainerProvider.getWebSocketContainer().connectToServer(client3, websocketUri);

    Thread.sleep(100);

    try {
      // When: All subscribe to same definition version
      String subscribeMsg =
          """
          {
            "type": "subscribe-definition-version",
            "processDefinitionId": "test-process",
            "version": 1
          }
          """;

      session.getBasicRemote().sendText(subscribeMsg);
      session2.getBasicRemote().sendText(subscribeMsg);
      session3.getBasicRemote().sendText(subscribeMsg);
      Thread.sleep(100);

      // Queue event
      ProcessDefinitionKey key = new ProcessDefinitionKey("test-process", 1);
      broadcaster.queueEvent(
          key,
          new FlowNodeEventMessage(
              "flownode-event",
              null,
              "Task1",
              ExecutionState.ACTIVE,
              System.currentTimeMillis(),
              null,
              null));

      Thread.sleep(250);

      // Then: All clients should receive messages
      assertTrue(client.getReceivedMessages().size() > 0, "Client 1 should receive messages");
      assertTrue(client2.getReceivedMessages().size() > 0, "Client 2 should receive messages");
      assertTrue(client3.getReceivedMessages().size() > 0, "Client 3 should receive messages");

    } finally {
      session2.close();
      session3.close();
    }
  }

  @Test
  void shouldReceiveMessagesInCorrectFormat() throws Exception {
    // Given: Subscribe to definition version
    session
        .getBasicRemote()
        .sendText(
            """
        {
          "type": "subscribe-definition-version",
          "processDefinitionId": "test-process",
          "version": 1
        }
        """);
    Thread.sleep(100);

    // When: Queue event
    ProcessDefinitionKey key = new ProcessDefinitionKey("test-process", 1);
    broadcaster.queueEvent(
        key,
        new FlowNodeEventMessage(
            "flownode-event",
            null,
            "Task1",
            ExecutionState.ACTIVE,
            System.currentTimeMillis(),
            null,
            null));

    Thread.sleep(250);

    // Then: Validate message structure
    List<String> messages = client.getReceivedMessages();
    boolean foundValidMessage = false;

    for (String msg : messages) {
      if (msg.contains("process-definition-aggregate-state")) {
        JsonNode node = objectMapper.readTree(msg);
        assertEquals("process-definition-aggregate-state", node.get("type").asText());
        assertEquals("test-process", node.get("processDefinitionId").asText());
        assertEquals(1, node.get("version").asInt());
        assertNotNull(node.get("flowNodeStates"));
        assertNotNull(node.get("timestamp"));
        foundValidMessage = true;
        break;
      }
    }

    assertTrue(foundValidMessage, "Should receive properly formatted message");
  }

  /** Test WebSocket client that collects received messages */
  @ClientEndpoint
  public static class TestWebSocketClient {
    private final BlockingQueue<String> messages = new LinkedBlockingQueue<>();
    private Session session;

    @OnOpen
    public void onOpen(Session session) {
      this.session = session;
    }

    @OnMessage
    public void onMessage(String message) {
      messages.offer(message);
    }

    @OnError
    public void onError(Throwable error) {
      error.printStackTrace();
    }

    public Session getSession() {
      return session;
    }

    public List<String> getReceivedMessages() {
      List<String> result = new ArrayList<>();
      messages.drainTo(result);
      return result;
    }

    public void clearMessages() {
      messages.clear();
    }

    public String waitForMessage(long timeout, TimeUnit unit) throws InterruptedException {
      return messages.poll(timeout, unit);
    }
  }
}
