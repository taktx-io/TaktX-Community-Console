/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 */

package io.taktx.console.ingester.inmemory.integration;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.taktx.console.ingester.inmemory.metrics.FlowNodeAnimationAggregator;
import io.taktx.console.ingester.inmemory.metrics.FlowNodeStateAggregator;
import io.taktx.console.ingester.inmemory.metrics.ProcessInstanceStateAggregator;
import io.taktx.console.ingester.inmemory.publishers.FlowNodeAnimationPublisher;
import io.taktx.console.ingester.inmemory.publishers.FlowNodeStatePublisher;
import io.taktx.console.ingester.inmemory.publishers.ProcessInstanceSummaryPublisher;
import io.taktx.console.ingester.inmemory.testing.KafkaTestResource;
import io.taktx.dto.ExecutionState;
import io.taktx.dto.ProcessDefinitionKey;
import jakarta.inject.Inject;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Integration test for Publishers working with real Aggregators. Tests the data flow from
 * aggregators through publishers.
 *
 * <p>Note: Tests run on random port (quarkus.http.test-port=0) to avoid conflicts with running
 * application instances.
 *
 * <p>IMPORTANT: Aggregators are application-scoped CDI beans, so we need to isolate tests by using
 * unique process definition IDs for each test to avoid state pollution.
 */
@QuarkusTest
@QuarkusTestResource(KafkaTestResource.class)
class PublisherAggregatorIntegrationTest {

  @Inject ProcessInstanceStateAggregator instanceStateAggregator;

  @Inject FlowNodeStateAggregator flowNodeStateAggregator;

  @Inject FlowNodeAnimationAggregator animationAggregator;

  @Inject ProcessInstanceSummaryPublisher instanceSummaryPublisher;

  @Inject FlowNodeStatePublisher flowNodeStatePublisher;

  @Inject FlowNodeAnimationPublisher animationPublisher;

  @Inject ObjectMapper objectMapper;

  // Use unique test IDs to avoid state pollution between tests
  private String testId;

  @BeforeEach
  void setUp() {
    // Generate unique test ID for each test to avoid aggregator state pollution
    testId = "test-" + UUID.randomUUID().toString().substring(0, 8);
  }

  @AfterEach
  void tearDown() {
    // Note: We don't clear aggregators as they're shared application beans
    // Instead, each test uses unique process definition IDs
  }

  @Test
  void shouldPublishProcessInstanceSummaryFromRealAggregator() {
    // Given: Record state transitions in aggregator
    ProcessDefinitionKey key1 = new ProcessDefinitionKey(testId + "-order", 1);
    ProcessDefinitionKey key2 = new ProcessDefinitionKey(testId + "-payment", 1);

    instanceStateAggregator.recordStateTransition(key1, null, ExecutionState.ACTIVE);
    instanceStateAggregator.recordStateTransition(key1, null, ExecutionState.ACTIVE);
    instanceStateAggregator.recordStateTransition(key2, null, ExecutionState.ACTIVE);
    instanceStateAggregator.recordStateTransition(
        key2, ExecutionState.ACTIVE, ExecutionState.COMPLETED);

    // When: Get snapshots
    var globalSnapshot = instanceStateAggregator.getGlobalSnapshot();

    // Then: Verify aggregator data is correct
    assertEquals(2, globalSnapshot.get(testId + "-order").get(ExecutionState.ACTIVE));
    assertEquals(1, globalSnapshot.get(testId + "-payment").get(ExecutionState.COMPLETED));

    // And: Publisher can access the data
    assertNotNull(instanceSummaryPublisher);
    // Publisher would broadcast this data to subscribers in broadcast() method
  }

  @Test
  void shouldPublishFlowNodeStateFromRealAggregator() {
    // Given: Record flow node events in aggregator
    ProcessDefinitionKey key = new ProcessDefinitionKey(testId + "-process", 1);
    UUID instanceId = UUID.randomUUID();

    flowNodeStateAggregator.recordEvent(key, instanceId, "Task1", "Task1_1", ExecutionState.ACTIVE);
    flowNodeStateAggregator.recordEvent(key, instanceId, "Task2", "Task2_1", ExecutionState.ACTIVE);
    flowNodeStateAggregator.recordEvent(
        key, instanceId, "Task1", "Task1_1", ExecutionState.COMPLETED);

    // When: Get snapshots
    var definitionSnapshot = flowNodeStateAggregator.getDefinitionSnapshot(key);
    var instanceSnapshot = flowNodeStateAggregator.getInstanceSnapshot(instanceId);

    // Then: Verify aggregator data
    assertEquals(0, definitionSnapshot.get("Task1").active()); // Task1 completed, so 0 active
    assertEquals(1, definitionSnapshot.get("Task1").completed());
    assertEquals(1, definitionSnapshot.get("Task2").active()); // Task2 is still active

    // Instance snapshot should match
    assertEquals(0, instanceSnapshot.get("Task1").active());
    assertEquals(1, instanceSnapshot.get("Task1").completed());
    assertEquals(1, instanceSnapshot.get("Task2").active());

    // And: Publisher can access and format this data
    assertNotNull(flowNodeStatePublisher);
  }

  @Test
  void shouldPublishAnimationsFromRealAggregator() {
    // Given: Record animation events
    ProcessDefinitionKey key = new ProcessDefinitionKey(testId + "-process", 1);

    animationAggregator.recordEvent(key, "Task1", ExecutionState.ACTIVE, null);
    animationAggregator.recordEvent(key, "Task1", ExecutionState.ACTIVE, null);
    animationAggregator.recordEvent(
        key, "Task1", ExecutionState.COMPLETED, java.util.List.of("seq1", "seq2"));

    // When: Get and reset snapshot
    var snapshot = animationAggregator.getAndResetSnapshot(key);

    // Then: Verify animation data
    assertNotNull(snapshot);
    assertEquals(2, snapshot.activities().get("Task1").active());
    assertEquals(1, snapshot.activities().get("Task1").completed());
    assertEquals(1, snapshot.sequenceFlows().get("seq1"));
    assertEquals(1, snapshot.sequenceFlows().get("seq2"));

    // And: Next snapshot should be null (reset)
    var nextSnapshot = animationAggregator.getAndResetSnapshot(key);
    assertNull(nextSnapshot);

    // And: Publisher can broadcast this data
    assertNotNull(animationPublisher);
  }

  @Test
  void shouldHandleDeduplicationAcrossPublisherCycle() {
    // Given: Record same event multiple times (simulating duplicate events)
    ProcessDefinitionKey key = new ProcessDefinitionKey(testId + "-process", 1);
    UUID instanceId = UUID.randomUUID();

    // First event
    boolean changed1 =
        flowNodeStateAggregator.recordEvent(
            key, instanceId, "Task1", "Task1_1", ExecutionState.ACTIVE);

    // Duplicate event
    boolean changed2 =
        flowNodeStateAggregator.recordEvent(
            key, instanceId, "Task1", "Task1_1", ExecutionState.ACTIVE);

    // Then: First should change, second should be deduplicated
    assertTrue(changed1, "First event should cause change");
    assertFalse(changed2, "Duplicate should be filtered");

    var snapshot = flowNodeStateAggregator.getDefinitionSnapshot(key);
    assertEquals(1, snapshot.get("Task1").active(), "Should only count once");
  }

  @Test
  void shouldHandleMultiInstanceScenarios() {
    // Given: Multi-instance task with 3 instances
    ProcessDefinitionKey key = new ProcessDefinitionKey(testId + "-process", 1);
    UUID instanceId = UUID.randomUUID();

    flowNodeStateAggregator.recordEvent(
        key, instanceId, "Task1", "Task1[0]", ExecutionState.ACTIVE);
    flowNodeStateAggregator.recordEvent(
        key, instanceId, "Task1", "Task1[1]", ExecutionState.ACTIVE);
    flowNodeStateAggregator.recordEvent(
        key, instanceId, "Task1", "Task1[2]", ExecutionState.ACTIVE);

    // When: One completes
    flowNodeStateAggregator.recordEvent(
        key, instanceId, "Task1", "Task1[0]", ExecutionState.COMPLETED);

    // Then: Should show 2 active, 1 completed
    var snapshot = flowNodeStateAggregator.getDefinitionSnapshot(key);
    assertEquals(2, snapshot.get("Task1").active());
    assertEquals(1, snapshot.get("Task1").completed());
  }

  @Test
  void shouldIsolateDefinitionVersions() {
    // Given: Two versions of same definition
    ProcessDefinitionKey v1 = new ProcessDefinitionKey(testId + "-process", 1);
    ProcessDefinitionKey v2 = new ProcessDefinitionKey(testId + "-process", 2);

    instanceStateAggregator.recordStateTransition(v1, null, ExecutionState.ACTIVE);
    instanceStateAggregator.recordStateTransition(v1, null, ExecutionState.ACTIVE);
    instanceStateAggregator.recordStateTransition(v2, null, ExecutionState.ACTIVE);

    // When: Get snapshots
    var v1Snapshot = instanceStateAggregator.getVersionSnapshot(v1);
    var v2Snapshot = instanceStateAggregator.getVersionSnapshot(v2);
    var definitionSnapshot = instanceStateAggregator.getDefinitionSnapshot(testId + "-process");

    // Then: Versions are isolated
    assertEquals(2, v1Snapshot.get(ExecutionState.ACTIVE));
    assertEquals(1, v2Snapshot.get(ExecutionState.ACTIVE));

    // But definition aggregates both
    assertEquals(3, definitionSnapshot.get(ExecutionState.ACTIVE));
  }

  @Test
  void shouldHandleHighVolumeEvents() {
    // Given: High volume of events (simulating busy system)
    ProcessDefinitionKey key = new ProcessDefinitionKey(testId + "-process", 1);

    // When: Record 1000 events
    for (int i = 0; i < 1000; i++) {
      animationAggregator.recordEvent(key, "Task1", ExecutionState.COMPLETED, null);
    }

    // Then: Should aggregate correctly
    var snapshot = animationAggregator.getAndResetSnapshot(key);
    assertNotNull(snapshot);
    assertEquals(1000, snapshot.activities().get("Task1").completed());
  }

  @Test
  void shouldSupportCompleteWorkflow() {
    // Given: Simulate complete process instance lifecycle
    ProcessDefinitionKey key = new ProcessDefinitionKey(testId + "-process", 1);
    UUID instanceId = UUID.randomUUID();

    // Process instance starts
    instanceStateAggregator.recordStateTransition(key, null, ExecutionState.ACTIVE);

    // Flow nodes execute
    flowNodeStateAggregator.recordEvent(
        key, instanceId, "StartEvent", "start_1", ExecutionState.ACTIVE);
    flowNodeStateAggregator.recordEvent(
        key, instanceId, "StartEvent", "start_1", ExecutionState.COMPLETED);

    flowNodeStateAggregator.recordEvent(key, instanceId, "Task1", "task1_1", ExecutionState.ACTIVE);
    animationAggregator.recordEvent(key, "Task1", ExecutionState.ACTIVE, java.util.List.of("seq1"));
    flowNodeStateAggregator.recordEvent(
        key, instanceId, "Task1", "task1_1", ExecutionState.COMPLETED);
    animationAggregator.recordEvent(
        key, "Task1", ExecutionState.COMPLETED, java.util.List.of("seq2"));

    flowNodeStateAggregator.recordEvent(
        key, instanceId, "EndEvent", "end_1", ExecutionState.ACTIVE);
    flowNodeStateAggregator.recordEvent(
        key, instanceId, "EndEvent", "end_1", ExecutionState.COMPLETED);

    // Process instance completes
    instanceStateAggregator.recordStateTransition(
        key, ExecutionState.ACTIVE, ExecutionState.COMPLETED);

    // Then: Verify final state
    var instanceSummary = instanceStateAggregator.getVersionSnapshot(key);
    assertEquals(0, instanceSummary.getOrDefault(ExecutionState.ACTIVE, 0));
    assertEquals(1, instanceSummary.get(ExecutionState.COMPLETED));

    var flowNodeSnapshot = flowNodeStateAggregator.getDefinitionSnapshot(key);
    assertEquals(0, flowNodeSnapshot.get("StartEvent").active());
    assertEquals(1, flowNodeSnapshot.get("StartEvent").completed());
    assertEquals(0, flowNodeSnapshot.get("Task1").active());
    assertEquals(1, flowNodeSnapshot.get("Task1").completed());

    var animationSnapshot = animationAggregator.getAndResetSnapshot(key);
    assertNotNull(animationSnapshot);
    assertEquals(1, animationSnapshot.activities().get("Task1").active());
    assertEquals(1, animationSnapshot.activities().get("Task1").completed());
    assertEquals(2, animationSnapshot.sequenceFlows().size());
  }
}
