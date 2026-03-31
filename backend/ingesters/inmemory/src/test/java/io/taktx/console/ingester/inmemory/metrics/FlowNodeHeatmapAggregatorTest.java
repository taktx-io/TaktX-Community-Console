/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 */

package io.taktx.console.ingester.inmemory.metrics;

import static org.junit.jupiter.api.Assertions.*;

import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Tests for FlowNodeHeatmapAggregator. Tests the core purpose: maintain cumulative lifetime heatmap
 * data for instances.
 */
class FlowNodeHeatmapAggregatorTest {

  private FlowNodeHeatmapAggregator aggregator;
  private UUID instance1;
  private UUID instance2;

  @BeforeEach
  void setUp() {
    aggregator = new FlowNodeHeatmapAggregator();
    instance1 = UUID.randomUUID();
    instance2 = UUID.randomUUID();
  }

  @Test
  void shouldRecordActivityCompletion() {
    // When: Flow node completes
    aggregator.recordCompletion(instance1, "Task1");

    // Then: Pass count incremented
    FlowNodeHeatmapAggregator.HeatmapSnapshot snapshot = aggregator.getSnapshot(instance1);

    assertEquals(1, snapshot.activityPassCounts().get("Task1"));
  }

  @Test
  void shouldAccumulateMultiplePasses() {
    // When: Same flow node completes multiple times (loops)
    aggregator.recordCompletion(instance1, "Task1");
    aggregator.recordCompletion(instance1, "Task1");
    aggregator.recordCompletion(instance1, "Task1");

    // Then: Count accumulates
    FlowNodeHeatmapAggregator.HeatmapSnapshot snapshot = aggregator.getSnapshot(instance1);

    assertEquals(3, snapshot.activityPassCounts().get("Task1"));
  }

  @Test
  void shouldTrackMultipleFlowNodes() {
    // When: Multiple flow nodes complete
    aggregator.recordCompletion(instance1, "Task1");
    aggregator.recordCompletion(instance1, "Task2");
    aggregator.recordCompletion(instance1, "Task3");
    aggregator.recordCompletion(instance1, "Task1");

    // Then: All tracked separately
    FlowNodeHeatmapAggregator.HeatmapSnapshot snapshot = aggregator.getSnapshot(instance1);

    assertEquals(2, snapshot.activityPassCounts().get("Task1"));
    assertEquals(1, snapshot.activityPassCounts().get("Task2"));
    assertEquals(1, snapshot.activityPassCounts().get("Task3"));
  }

  @Test
  void shouldRecordSequenceFlows() {
    // When: Sequence flows traversed
    aggregator.recordSequenceFlow(instance1, "seq1");
    aggregator.recordSequenceFlow(instance1, "seq2");
    aggregator.recordSequenceFlow(instance1, "seq3");

    // Then: All recorded in set
    FlowNodeHeatmapAggregator.HeatmapSnapshot snapshot = aggregator.getSnapshot(instance1);

    assertTrue(snapshot.sequenceFlowIds().contains("seq1"));
    assertTrue(snapshot.sequenceFlowIds().contains("seq2"));
    assertTrue(snapshot.sequenceFlowIds().contains("seq3"));
    assertEquals(3, snapshot.sequenceFlowIds().size());
  }

  @Test
  void shouldDeduplicateSequenceFlows() {
    // When: Same sequence flow traversed multiple times
    aggregator.recordSequenceFlow(instance1, "seq1");
    aggregator.recordSequenceFlow(instance1, "seq1");
    aggregator.recordSequenceFlow(instance1, "seq1");

    // Then: Only recorded once (set deduplication)
    FlowNodeHeatmapAggregator.HeatmapSnapshot snapshot = aggregator.getSnapshot(instance1);

    assertEquals(1, snapshot.sequenceFlowIds().size());
    assertTrue(snapshot.sequenceFlowIds().contains("seq1"));
  }

  @Test
  void shouldIsolateInstanceData() {
    // Given: Two separate instances
    aggregator.recordCompletion(instance1, "Task1");
    aggregator.recordCompletion(instance2, "Task1");
    aggregator.recordCompletion(instance2, "Task1");

    // Then: Each has own counts
    FlowNodeHeatmapAggregator.HeatmapSnapshot snap1 = aggregator.getSnapshot(instance1);
    FlowNodeHeatmapAggregator.HeatmapSnapshot snap2 = aggregator.getSnapshot(instance2);

    assertEquals(1, snap1.activityPassCounts().get("Task1"));
    assertEquals(2, snap2.activityPassCounts().get("Task1"));
  }

  @Test
  void shouldNeverReset() {
    // Given: Data recorded
    aggregator.recordCompletion(instance1, "Task1");

    // When: Get snapshot multiple times
    FlowNodeHeatmapAggregator.HeatmapSnapshot first = aggregator.getSnapshot(instance1);
    FlowNodeHeatmapAggregator.HeatmapSnapshot second = aggregator.getSnapshot(instance1);

    // Then: Both return same data (not reset)
    assertEquals(1, first.activityPassCounts().get("Task1"));
    assertEquals(1, second.activityPassCounts().get("Task1"));
  }

  @Test
  void shouldAccumulateOverTime() {
    // When: Data added over multiple calls
    aggregator.recordCompletion(instance1, "Task1");
    FlowNodeHeatmapAggregator.HeatmapSnapshot snap1 = aggregator.getSnapshot(instance1);

    aggregator.recordCompletion(instance1, "Task1");
    FlowNodeHeatmapAggregator.HeatmapSnapshot snap2 = aggregator.getSnapshot(instance1);

    // Then: Cumulative data grows
    assertEquals(1, snap1.activityPassCounts().get("Task1"));
    assertEquals(2, snap2.activityPassCounts().get("Task1"));
  }

  @Test
  void shouldClearInstanceData() {
    // Given: Instance has heatmap data
    aggregator.recordCompletion(instance1, "Task1");
    aggregator.recordSequenceFlow(instance1, "seq1");

    // When: Clear instance
    aggregator.clearInstance(instance1);

    // Then: Data removed
    FlowNodeHeatmapAggregator.HeatmapSnapshot snapshot = aggregator.getSnapshot(instance1);

    assertNull(snapshot.activityPassCounts());
    assertNull(snapshot.sequenceFlowIds());
  }

  @Test
  void shouldReturnNullForEmptyInstance() {
    // When: Query instance with no data
    FlowNodeHeatmapAggregator.HeatmapSnapshot snapshot = aggregator.getSnapshot(UUID.randomUUID());

    // Then: Returns null values
    assertNull(snapshot.activityPassCounts());
    assertNull(snapshot.sequenceFlowIds());
  }

  @Test
  void shouldHandleMixedData() {
    // When: Mix of activities and sequence flows
    aggregator.recordCompletion(instance1, "Task1");
    aggregator.recordCompletion(instance1, "Task2");
    aggregator.recordSequenceFlow(instance1, "seq1");
    aggregator.recordSequenceFlow(instance1, "seq2");

    // Then: Both types tracked
    FlowNodeHeatmapAggregator.HeatmapSnapshot snapshot = aggregator.getSnapshot(instance1);

    assertEquals(2, snapshot.activityPassCounts().size());
    assertEquals(2, snapshot.sequenceFlowIds().size());
  }

  @Test
  void shouldSupportHighVolumeLoops() {
    // When: Flow node completes many times (simulate loop)
    for (int i = 0; i < 1000; i++) {
      aggregator.recordCompletion(instance1, "LoopTask");
    }

    // Then: Count accurate even at high volume
    FlowNodeHeatmapAggregator.HeatmapSnapshot snapshot = aggregator.getSnapshot(instance1);

    assertEquals(1000, snapshot.activityPassCounts().get("LoopTask"));
  }
}
