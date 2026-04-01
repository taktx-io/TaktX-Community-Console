/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 */

package io.taktx.console.ingester.inmemory.metrics;

import static org.junit.jupiter.api.Assertions.*;

import io.taktx.dto.ExecutionState;
import io.taktx.dto.ProcessDefinitionKey;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Tests for ProcessInstanceStateAggregator. Tests the core purpose: track process instance counts
 * by state at multiple levels.
 */
class ProcessInstanceStateAggregatorTest {

  private ProcessInstanceStateAggregator aggregator;
  private ProcessDefinitionKey orderV1;
  private ProcessDefinitionKey orderV2;
  private ProcessDefinitionKey paymentV1;

  @BeforeEach
  void setUp() {
    aggregator = new ProcessInstanceStateAggregator();
    orderV1 = new ProcessDefinitionKey("order-process", 1);
    orderV2 = new ProcessDefinitionKey("order-process", 2);
    paymentV1 = new ProcessDefinitionKey("payment-process", 1);
  }

  @Test
  void shouldTrackNewInstanceTransition() {
    // When: New instance starts (null -> ACTIVE)
    aggregator.recordStateTransition(orderV1, null, ExecutionState.ACTIVE);

    // Then: Version snapshot shows 1 active instance
    Map<ExecutionState, Integer> snapshot = aggregator.getVersionSnapshot(orderV1);
    assertEquals(1, snapshot.get(ExecutionState.ACTIVE));
    assertNull(snapshot.get(ExecutionState.COMPLETED));
  }

  @Test
  void shouldTrackStateTransitionFromActiveToCompleted() {
    // Given: Instance is active
    aggregator.recordStateTransition(orderV1, null, ExecutionState.ACTIVE);

    // When: Instance completes
    aggregator.recordStateTransition(orderV1, ExecutionState.ACTIVE, ExecutionState.COMPLETED);

    // Then: Active decremented, completed incremented
    Map<ExecutionState, Integer> snapshot = aggregator.getVersionSnapshot(orderV1);
    assertEquals(0, snapshot.getOrDefault(ExecutionState.ACTIVE, 0));
    assertEquals(1, snapshot.get(ExecutionState.COMPLETED));
  }

  @Test
  void shouldTrackMultipleInstancesPerVersion() {
    // Given: 3 active instances, 2 completed
    aggregator.recordStateTransition(orderV1, null, ExecutionState.ACTIVE);
    aggregator.recordStateTransition(orderV1, null, ExecutionState.ACTIVE);
    aggregator.recordStateTransition(orderV1, null, ExecutionState.ACTIVE);
    aggregator.recordStateTransition(orderV1, ExecutionState.ACTIVE, ExecutionState.COMPLETED);
    aggregator.recordStateTransition(orderV1, ExecutionState.ACTIVE, ExecutionState.COMPLETED);

    // Then: Counts are accurate
    Map<ExecutionState, Integer> snapshot = aggregator.getVersionSnapshot(orderV1);
    assertEquals(1, snapshot.get(ExecutionState.ACTIVE));
    assertEquals(2, snapshot.get(ExecutionState.COMPLETED));
  }

  @Test
  void shouldAggregateAcrossVersionsForDefinition() {
    // Given: v1 has 2 active, v2 has 3 active
    aggregator.recordStateTransition(orderV1, null, ExecutionState.ACTIVE);
    aggregator.recordStateTransition(orderV1, null, ExecutionState.ACTIVE);
    aggregator.recordStateTransition(orderV2, null, ExecutionState.ACTIVE);
    aggregator.recordStateTransition(orderV2, null, ExecutionState.ACTIVE);
    aggregator.recordStateTransition(orderV2, null, ExecutionState.ACTIVE);

    // When: Get definition snapshot (all versions)
    Map<ExecutionState, Integer> snapshot = aggregator.getDefinitionSnapshot("order-process");

    // Then: Shows 5 total active across both versions
    assertEquals(5, snapshot.get(ExecutionState.ACTIVE));
  }

  @Test
  void shouldProvideGlobalSnapshotAcrossAllDefinitions() {
    // Given: Multiple definitions with different states
    aggregator.recordStateTransition(orderV1, null, ExecutionState.ACTIVE);
    aggregator.recordStateTransition(orderV1, ExecutionState.ACTIVE, ExecutionState.COMPLETED);
    aggregator.recordStateTransition(paymentV1, null, ExecutionState.ACTIVE);
    aggregator.recordStateTransition(paymentV1, null, ExecutionState.ACTIVE);

    // When: Get global snapshot
    Map<String, Map<ExecutionState, Integer>> global = aggregator.getGlobalSnapshot();

    // Then: Shows counts per definition
    assertEquals(1, global.get("order-process").get(ExecutionState.COMPLETED));
    assertEquals(2, global.get("payment-process").get(ExecutionState.ACTIVE));
  }

  @Test
  void shouldProvideVersionBreakdownForDefinition() {
    // Given: Multiple versions with different counts
    aggregator.recordStateTransition(orderV1, null, ExecutionState.ACTIVE);
    aggregator.recordStateTransition(orderV1, null, ExecutionState.ACTIVE);
    aggregator.recordStateTransition(orderV2, null, ExecutionState.ACTIVE);
    aggregator.recordStateTransition(orderV2, ExecutionState.ACTIVE, ExecutionState.COMPLETED);

    // When: Get versions snapshot
    Map<Integer, Map<ExecutionState, Integer>> versions =
        aggregator.getVersionsSnapshot("order-process");

    // Then: Shows per-version breakdown
    assertEquals(2, versions.get(1).get(ExecutionState.ACTIVE));
    assertEquals(1, versions.get(2).get(ExecutionState.COMPLETED));
  }

  @Test
  void shouldHandleAbortedState() {
    // Given: Instance becomes aborted
    aggregator.recordStateTransition(orderV1, null, ExecutionState.ACTIVE);
    aggregator.recordStateTransition(orderV1, ExecutionState.ACTIVE, ExecutionState.ABORTED);

    // Then: Shows aborted count
    Map<ExecutionState, Integer> snapshot = aggregator.getVersionSnapshot(orderV1);
    assertEquals(0, snapshot.getOrDefault(ExecutionState.ACTIVE, 0));
    assertEquals(1, snapshot.get(ExecutionState.ABORTED));
  }

  @Test
  void shouldNotGoNegativeOnActiveCount() {
    // Given: More completions than activations (edge case)
    aggregator.recordStateTransition(orderV1, null, ExecutionState.ACTIVE);
    aggregator.recordStateTransition(orderV1, ExecutionState.ACTIVE, ExecutionState.COMPLETED);
    aggregator.recordStateTransition(orderV1, ExecutionState.ACTIVE, ExecutionState.COMPLETED);

    // Then: Active count stays at 0 (doesn't go negative)
    Map<ExecutionState, Integer> snapshot = aggregator.getVersionSnapshot(orderV1);
    assertEquals(0, snapshot.getOrDefault(ExecutionState.ACTIVE, 0));
    assertEquals(2, snapshot.get(ExecutionState.COMPLETED));
  }

  @Test
  void shouldIgnoreNullNewState() {
    // When: Attempt to record null state
    aggregator.recordStateTransition(orderV1, null, null);

    // Then: No state recorded
    Map<ExecutionState, Integer> snapshot = aggregator.getVersionSnapshot(orderV1);
    assertTrue(snapshot.isEmpty());
  }

  @Test
  void shouldReturnEmptySnapshotForUnknownDefinition() {
    // When: Query definition with no data
    Map<ExecutionState, Integer> snapshot = aggregator.getVersionSnapshot(orderV1);

    // Then: Returns empty map
    assertTrue(snapshot.isEmpty());
  }

  @Test
  void shouldRemoveEvictedInstanceFromAggregateCounts() {
    UUID processInstanceId = UUID.randomUUID();

    aggregator.recordStateTransition(processInstanceId, orderV1, null, ExecutionState.ACTIVE);
    aggregator.recordStateTransition(
        processInstanceId, orderV1, ExecutionState.ACTIVE, ExecutionState.COMPLETED);

    aggregator.removeInstance(processInstanceId);

    Map<ExecutionState, Integer> snapshot = aggregator.getVersionSnapshot(orderV1);
    assertEquals(0, snapshot.getOrDefault(ExecutionState.COMPLETED, 0));
  }
}
