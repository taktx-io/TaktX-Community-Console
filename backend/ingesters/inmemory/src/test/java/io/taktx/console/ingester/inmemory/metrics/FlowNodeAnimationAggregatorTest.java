/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 */

package io.taktx.console.ingester.inmemory.metrics;

import static org.junit.jupiter.api.Assertions.*;

import io.taktx.dto.ExecutionState;
import io.taktx.dto.ProcessDefinitionKey;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Tests for FlowNodeAnimationAggregator. Tests the core purpose: batch animation events in 100ms
 * windows with get-and-reset pattern.
 */
class FlowNodeAnimationAggregatorTest {

  private FlowNodeAnimationAggregator aggregator;
  private ProcessDefinitionKey orderV1;

  @BeforeEach
  void setUp() {
    aggregator = new FlowNodeAnimationAggregator();
    orderV1 = new ProcessDefinitionKey("order-process", 1);
  }

  @Test
  void shouldRecordActivityCounts() {
    // When: Record various activities
    aggregator.recordEvent(orderV1, "Task1", ExecutionState.ACTIVE, null);
    aggregator.recordEvent(orderV1, "Task1", ExecutionState.COMPLETED, null);
    aggregator.recordEvent(orderV1, "Task2", ExecutionState.ACTIVE, null);

    // Then: Snapshot shows counts
    FlowNodeAnimationAggregator.AnimationSnapshot snapshot =
        aggregator.getAndResetSnapshot(orderV1);

    assertNotNull(snapshot);
    assertEquals(1, snapshot.activities().get("Task1").active());
    assertEquals(1, snapshot.activities().get("Task1").completed());
    assertEquals(1, snapshot.activities().get("Task2").active());
  }

  @Test
  void shouldAggregateMultipleEventsForSameNode() {
    // When: Multiple events for same flow node
    aggregator.recordEvent(orderV1, "Task1", ExecutionState.ACTIVE, null);
    aggregator.recordEvent(orderV1, "Task1", ExecutionState.ACTIVE, null);
    aggregator.recordEvent(orderV1, "Task1", ExecutionState.COMPLETED, null);

    // Then: Counts aggregated
    FlowNodeAnimationAggregator.AnimationSnapshot snapshot =
        aggregator.getAndResetSnapshot(orderV1);

    assertEquals(2, snapshot.activities().get("Task1").active());
    assertEquals(1, snapshot.activities().get("Task1").completed());
  }

  @Test
  void shouldRecordSequenceFlowTraversals() {
    // When: Record events with sequence flows
    aggregator.recordEvent(orderV1, "Task1", ExecutionState.COMPLETED, List.of("seq1", "seq2"));
    aggregator.recordEvent(orderV1, "Task2", ExecutionState.COMPLETED, List.of("seq2", "seq3"));

    // Then: Sequence flows aggregated
    FlowNodeAnimationAggregator.AnimationSnapshot snapshot =
        aggregator.getAndResetSnapshot(orderV1);

    assertEquals(1, snapshot.sequenceFlows().get("seq1"));
    assertEquals(2, snapshot.sequenceFlows().get("seq2")); // Appeared twice
    assertEquals(1, snapshot.sequenceFlows().get("seq3"));
  }

  @Test
  void shouldResetAfterSnapshot() {
    // Given: Events recorded
    aggregator.recordEvent(orderV1, "Task1", ExecutionState.ACTIVE, null);

    // When: Get and reset
    FlowNodeAnimationAggregator.AnimationSnapshot first = aggregator.getAndResetSnapshot(orderV1);
    FlowNodeAnimationAggregator.AnimationSnapshot second = aggregator.getAndResetSnapshot(orderV1);

    // Then: First has data, second is null (no new data)
    assertNotNull(first);
    assertNull(second);
  }

  @Test
  void shouldHandleInitializedAsActive() {
    // When: INITIALIZED event
    aggregator.recordEvent(orderV1, "Task1", ExecutionState.INITIALIZED, null);

    // Then: Counted as active
    FlowNodeAnimationAggregator.AnimationSnapshot snapshot =
        aggregator.getAndResetSnapshot(orderV1);

    assertEquals(1, snapshot.activities().get("Task1").active());
  }

  @Test
  void shouldHandleAbortedState() {
    // When: ABORTED event
    aggregator.recordEvent(orderV1, "Task1", ExecutionState.ABORTED, null);

    // Then: Counted as aborted
    FlowNodeAnimationAggregator.AnimationSnapshot snapshot =
        aggregator.getAndResetSnapshot(orderV1);

    assertEquals(1, snapshot.activities().get("Task1").aborted());
  }

  @Test
  void shouldReturnNullForEmptyWindow() {
    // When: Get snapshot without any events
    FlowNodeAnimationAggregator.AnimationSnapshot snapshot =
        aggregator.getAndResetSnapshot(orderV1);

    // Then: Returns null (no data)
    assertNull(snapshot);
  }

  @Test
  void shouldHandleNullSequenceFlows() {
    // When: Record event without sequence flows
    aggregator.recordEvent(orderV1, "Task1", ExecutionState.COMPLETED, null);

    // Then: No sequence flows in snapshot
    FlowNodeAnimationAggregator.AnimationSnapshot snapshot =
        aggregator.getAndResetSnapshot(orderV1);

    assertTrue(snapshot.sequenceFlows().isEmpty());
  }

  @Test
  void shouldHandleEmptySequenceFlowsList() {
    // When: Record event with empty list
    aggregator.recordEvent(orderV1, "Task1", ExecutionState.COMPLETED, List.of());

    // Then: No sequence flows in snapshot
    FlowNodeAnimationAggregator.AnimationSnapshot snapshot =
        aggregator.getAndResetSnapshot(orderV1);

    assertTrue(snapshot.sequenceFlows().isEmpty());
  }

  @Test
  void shouldCalculateTotalEventsCorrectly() {
    // When: Mix of event types
    aggregator.recordEvent(orderV1, "Task1", ExecutionState.ACTIVE, null);
    aggregator.recordEvent(orderV1, "Task1", ExecutionState.ACTIVE, null);
    aggregator.recordEvent(orderV1, "Task1", ExecutionState.COMPLETED, null);
    aggregator.recordEvent(orderV1, "Task1", ExecutionState.ABORTED, null);

    // Then: Total calculates correctly
    FlowNodeAnimationAggregator.AnimationSnapshot snapshot =
        aggregator.getAndResetSnapshot(orderV1);

    FlowNodeAnimationAggregator.ActivitySnapshot activity = snapshot.activities().get("Task1");
    assertEquals(4, activity.total());
  }

  @Test
  void shouldFilterZeroCountsFromSnapshot() {
    // Given: Events recorded and reset
    aggregator.recordEvent(orderV1, "Task1", ExecutionState.ACTIVE, null);
    aggregator.getAndResetSnapshot(orderV1); // Reset to zero

    // When: Get another snapshot
    FlowNodeAnimationAggregator.AnimationSnapshot snapshot =
        aggregator.getAndResetSnapshot(orderV1);

    // Then: Returns null (no activity)
    assertNull(snapshot);
  }

  @Test
  void shouldIsolateDifferentDefinitionVersions() {
    // Given: Two different versions
    ProcessDefinitionKey orderV2 = new ProcessDefinitionKey("order-process", 2);
    aggregator.recordEvent(orderV1, "Task1", ExecutionState.ACTIVE, null);
    aggregator.recordEvent(orderV2, "Task1", ExecutionState.ACTIVE, null);

    // When: Get snapshots separately
    FlowNodeAnimationAggregator.AnimationSnapshot v1Snapshot =
        aggregator.getAndResetSnapshot(orderV1);
    FlowNodeAnimationAggregator.AnimationSnapshot v2Snapshot =
        aggregator.getAndResetSnapshot(orderV2);

    // Then: Each has own data
    assertEquals(1, v1Snapshot.activities().get("Task1").active());
    assertEquals(1, v2Snapshot.activities().get("Task1").active());
  }
}
