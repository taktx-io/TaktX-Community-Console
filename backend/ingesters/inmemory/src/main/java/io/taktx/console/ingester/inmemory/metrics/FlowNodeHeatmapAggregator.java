/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 * This file is part of TaktX, licensed under the TaktX Business Source License v1.0.
 * Free use is permitted with up to 3 Kafka partitions per topic. See LICENSE file for details.
 * For commercial use or more partitions and features, contact [https://www.taktx.io/contact].
 */

package io.taktx.console.ingester.inmemory.metrics;

import jakarta.enterprise.context.ApplicationScoped;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import lombok.extern.slf4j.Slf4j;

/**
 * Aggregates cumulative heatmap data for process instances. Tracks: - Activity pass counts (how
 * many times each flow node completed) - Sequence flows traversed (set of sequence flow IDs) Never
 * resets - maintains cumulative data for instance lifetime.
 */
@Slf4j
@ApplicationScoped
public class FlowNodeHeatmapAggregator {

  // Per-instance cumulative activity counts: InstanceId -> FlowNodeId -> Count
  private final Map<UUID, Map<String, Integer>> cumulativeActivityCounts =
      new ConcurrentHashMap<>();

  // Per-instance cumulative sequence flows: InstanceId -> Set of SequenceFlowIds
  private final Map<UUID, Set<String>> cumulativeSequenceFlows = new ConcurrentHashMap<>();

  /**
   * Record a flow node completion (increment pass count).
   *
   * @param instanceId The process instance ID
   * @param flowNodeId The flow node ID
   */
  public void recordCompletion(UUID instanceId, String flowNodeId) {
    cumulativeActivityCounts
        .computeIfAbsent(instanceId, id -> new ConcurrentHashMap<>())
        .merge(flowNodeId, 1, Integer::sum);
  }

  /**
   * Record sequence flow traversal.
   *
   * @param instanceId The process instance ID
   * @param sequenceFlowId The sequence flow ID
   */
  public void recordSequenceFlow(UUID instanceId, String sequenceFlowId) {
    cumulativeSequenceFlows
        .computeIfAbsent(instanceId, id -> ConcurrentHashMap.newKeySet())
        .add(sequenceFlowId);
  }

  /**
   * Get cumulative heatmap snapshot for a specific instance.
   *
   * @param instanceId The process instance ID
   * @return Heatmap snapshot with activity counts and sequence flows
   */
  public HeatmapSnapshot getSnapshot(UUID instanceId) {
    Map<String, Integer> activities =
        cumulativeActivityCounts.getOrDefault(instanceId, Collections.emptyMap());
    Set<String> sequenceFlows =
        cumulativeSequenceFlows.getOrDefault(instanceId, Collections.emptySet());

    return new HeatmapSnapshot(
        activities.isEmpty() ? null : new HashMap<>(activities),
        sequenceFlows.isEmpty() ? null : new ArrayList<>(sequenceFlows));
  }

  /** Clear heatmap data for a specific instance. */
  public void clearInstance(UUID instanceId) {
    cumulativeActivityCounts.remove(instanceId);
    cumulativeSequenceFlows.remove(instanceId);
    log.debug("Cleared heatmap data for instance {}", instanceId);
  }

  /** Immutable snapshot of cumulative heatmap data */
  public record HeatmapSnapshot(
      Map<String, Integer> activityPassCounts, List<String> sequenceFlowIds) {}
}
