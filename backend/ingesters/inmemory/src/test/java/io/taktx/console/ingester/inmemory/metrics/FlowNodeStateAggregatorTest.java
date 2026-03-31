/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 */

package io.taktx.console.ingester.inmemory.metrics;

import static org.junit.jupiter.api.Assertions.*;

import io.taktx.console.ingester.inmemory.websocket.FlowNodeStateTracker;
import io.taktx.dto.ExecutionState;
import io.taktx.dto.ProcessDefinitionKey;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Tests for FlowNodeStateAggregator. Tests the core purpose: track flow node state at both
 * definition and instance levels with deduplication.
 */
class FlowNodeStateAggregatorTest {

  private FlowNodeStateAggregator aggregator;
  private ProcessDefinitionKey orderV1;
  private UUID instance1;
  private UUID instance2;

  @BeforeEach
  void setUp() {
    aggregator = new FlowNodeStateAggregator();
    orderV1 = new ProcessDefinitionKey("order-process", 1);
    instance1 = UUID.randomUUID();
    instance2 = UUID.randomUUID();
  }

  @Test
  void shouldRecordFlowNodeActivation() {
    // When: Flow node becomes active
    boolean changed =
        aggregator.recordEvent(orderV1, instance1, "Task1", "Task1_1", ExecutionState.ACTIVE);

    // Then: State changed, counts updated
    assertTrue(changed);
    Map<String, FlowNodeStateTracker.StateSnapshot> snapshot =
        aggregator.getDefinitionSnapshot(orderV1);
    assertEquals(1, snapshot.get("Task1").active());
  }

  @Test
  void shouldDeduplicateDuplicateEvents() {
    // Given: Flow node already active
    aggregator.recordEvent(orderV1, instance1, "Task1", "Task1_1", ExecutionState.ACTIVE);

    // When: Same event received again
    boolean changed =
        aggregator.recordEvent(orderV1, instance1, "Task1", "Task1_1", ExecutionState.ACTIVE);

    // Then: Not counted again
    assertFalse(changed);
    Map<String, FlowNodeStateTracker.StateSnapshot> snapshot =
        aggregator.getDefinitionSnapshot(orderV1);
    assertEquals(1, snapshot.get("Task1").active());
  }

  @Test
  void shouldTrackCompletionDecrementsActive() {
    // Given: Flow node is active
    aggregator.recordEvent(orderV1, instance1, "Task1", "Task1_1", ExecutionState.ACTIVE);

    // When: Flow node completes
    aggregator.recordEvent(orderV1, instance1, "Task1", "Task1_1", ExecutionState.COMPLETED);

    // Then: Active decremented, completed incremented
    Map<String, FlowNodeStateTracker.StateSnapshot> snapshot =
        aggregator.getDefinitionSnapshot(orderV1);
    assertEquals(0, snapshot.get("Task1").active());
    assertEquals(1, snapshot.get("Task1").completed());
  }

  @Test
  void shouldTrackMultipleInstancesSeparately() {
    // Given: Two instances at same flow node
    aggregator.recordEvent(orderV1, instance1, "Task1", "Task1_1", ExecutionState.ACTIVE);
    aggregator.recordEvent(orderV1, instance2, "Task1", "Task1_2", ExecutionState.ACTIVE);

    // Then: Definition shows 2 active
    Map<String, FlowNodeStateTracker.StateSnapshot> snapshot =
        aggregator.getDefinitionSnapshot(orderV1);
    assertEquals(2, snapshot.get("Task1").active());
  }

  @Test
  void shouldTrackInstanceLevelStateSeparately() {
    // Given: Two different instances
    aggregator.recordEvent(orderV1, instance1, "Task1", "Task1_1", ExecutionState.ACTIVE);
    aggregator.recordEvent(orderV1, instance2, "Task1", "Task1_2", ExecutionState.COMPLETED);

    // Then: Each instance has own state
    Map<String, FlowNodeStateTracker.StateSnapshot> inst1 =
        aggregator.getInstanceSnapshot(instance1);
    Map<String, FlowNodeStateTracker.StateSnapshot> inst2 =
        aggregator.getInstanceSnapshot(instance2);

    assertEquals(1, inst1.get("Task1").active());
    assertEquals(0, inst1.get("Task1").completed());

    assertEquals(0, inst2.get("Task1").active());
    assertEquals(1, inst2.get("Task1").completed());
  }

  @Test
  void shouldHandleMultiInstanceScenarios() {
    // Given: Multi-instance with unique paths
    aggregator.recordEvent(orderV1, instance1, "Task1", "Task1[0]", ExecutionState.ACTIVE);
    aggregator.recordEvent(orderV1, instance1, "Task1", "Task1[1]", ExecutionState.ACTIVE);
    aggregator.recordEvent(orderV1, instance1, "Task1", "Task1[2]", ExecutionState.ACTIVE);

    // Then: All three tracked separately
    Map<String, FlowNodeStateTracker.StateSnapshot> snapshot =
        aggregator.getDefinitionSnapshot(orderV1);
    assertEquals(3, snapshot.get("Task1").active());
  }

  @Test
  void shouldHandleAbortedState() {
    // Given: Flow node active then aborted
    aggregator.recordEvent(orderV1, instance1, "Task1", "Task1_1", ExecutionState.ACTIVE);
    aggregator.recordEvent(orderV1, instance1, "Task1", "Task1_1", ExecutionState.ABORTED);

    // Then: Active decremented, aborted incremented
    Map<String, FlowNodeStateTracker.StateSnapshot> snapshot =
        aggregator.getDefinitionSnapshot(orderV1);
    assertEquals(0, snapshot.get("Task1").active());
    assertEquals(1, snapshot.get("Task1").aborted());
  }

  @Test
  void shouldClearInstanceData() {
    // Given: Instance has state data
    aggregator.recordEvent(orderV1, instance1, "Task1", "Task1_1", ExecutionState.ACTIVE);
    aggregator.recordEvent(orderV1, instance1, "Task2", "Task2_1", ExecutionState.COMPLETED);

    // When: Clear instance
    aggregator.clearInstance(instance1);

    // Then: Instance data removed, definition data unchanged
    Map<String, FlowNodeStateTracker.StateSnapshot> instSnapshot =
        aggregator.getInstanceSnapshot(instance1);
    assertTrue(instSnapshot.isEmpty());

    Map<String, FlowNodeStateTracker.StateSnapshot> defSnapshot =
        aggregator.getDefinitionSnapshot(orderV1);
    assertFalse(defSnapshot.isEmpty());
  }

  @Test
  void shouldHandleNullInstanceId() {
    // When: Record event without instance ID (edge case)
    boolean changed = aggregator.recordEvent(orderV1, null, "Task1", null, ExecutionState.ACTIVE);

    // Then: Still records at definition level
    assertTrue(changed);
    Map<String, FlowNodeStateTracker.StateSnapshot> snapshot =
        aggregator.getDefinitionSnapshot(orderV1);
    assertEquals(1, snapshot.get("Task1").active());
  }

  @Test
  void shouldFilterOutInactiveFlowNodesFromSnapshot() {
    // Given: Flow node activated then completed (goes back to 0 active)
    aggregator.recordEvent(orderV1, instance1, "Task1", "Task1_1", ExecutionState.ACTIVE);
    aggregator.recordEvent(orderV1, instance1, "Task1", "Task1_1", ExecutionState.COMPLETED);

    // When: Another flow node is still active
    aggregator.recordEvent(orderV1, instance1, "Task2", "Task2_1", ExecutionState.ACTIVE);

    // Then: Snapshot includes both (Task1 has completed count)
    Map<String, FlowNodeStateTracker.StateSnapshot> snapshot =
        aggregator.getDefinitionSnapshot(orderV1);
    assertTrue(snapshot.containsKey("Task1"));
    assertTrue(snapshot.containsKey("Task2"));
  }

  @Test
  void shouldHandleInitializedStateAsActive() {
    // When: Flow node initialized (treated as active)
    aggregator.recordEvent(orderV1, instance1, "Task1", "Task1_1", ExecutionState.INITIALIZED);

    // Then: Shows as active
    Map<String, FlowNodeStateTracker.StateSnapshot> snapshot =
        aggregator.getDefinitionSnapshot(orderV1);
    assertEquals(1, snapshot.get("Task1").active());
  }

  @Test
  void shouldReturnEmptySnapshotForUnknownDefinition() {
    // When: Query definition with no data
    Map<String, FlowNodeStateTracker.StateSnapshot> snapshot =
        aggregator.getDefinitionSnapshot(orderV1);

    // Then: Returns empty map
    assertTrue(snapshot.isEmpty());
  }

  @Test
  void shouldReturnEmptySnapshotForUnknownInstance() {
    // When: Query instance with no data
    Map<String, FlowNodeStateTracker.StateSnapshot> snapshot =
        aggregator.getInstanceSnapshot(UUID.randomUUID());

    // Then: Returns empty map
    assertTrue(snapshot.isEmpty());
  }
}
