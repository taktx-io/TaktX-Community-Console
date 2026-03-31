/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 * This file is part of TaktX, licensed under the TaktX Business Source License v1.0.
 * Free use is permitted with up to 3 Kafka partitions per topic. See LICENSE file for details.
 * For commercial use or more partitions and features, contact [https://www.taktx.io/contact].
 */

package io.taktx.console.ingester.inmemory.metrics;

import io.taktx.dto.ExecutionState;
import io.taktx.dto.ProcessDefinitionKey;
import jakarta.enterprise.context.ApplicationScoped;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import lombok.extern.slf4j.Slf4j;

/**
 * Aggregates flow node animation events for 100ms time windows. Tracks activity counts (active,
 * completed, aborted) and sequence flow traversals. Uses get-and-reset pattern for windowed
 * broadcasting.
 */
@Slf4j
@ApplicationScoped
public class FlowNodeAnimationAggregator {

  // Activity metrics: ProcessDefinitionKey -> FlowNodeId -> Counts
  private final Map<ProcessDefinitionKey, Map<String, ActivityCounts>> activityMetrics =
      new ConcurrentHashMap<>();

  // Sequence flow metrics: ProcessDefinitionKey -> SequenceFlowId -> Count
  private final Map<ProcessDefinitionKey, Map<String, AtomicInteger>> sequenceFlowMetrics =
      new ConcurrentHashMap<>();

  /**
   * Record a flow node event for animation aggregation.
   *
   * @param key The process definition key
   * @param flowNodeId The flow node ID
   * @param state The execution state
   * @param sequenceFlowIds List of sequence flow IDs traversed (nullable)
   */
  public void recordEvent(
      ProcessDefinitionKey key,
      String flowNodeId,
      ExecutionState state,
      List<String> sequenceFlowIds) {

    // Record activity counts
    ActivityCounts counts =
        activityMetrics
            .computeIfAbsent(key, k -> new ConcurrentHashMap<>())
            .computeIfAbsent(flowNodeId, fn -> new ActivityCounts());

    counts.recordEvent(state);

    // Record sequence flow traversals
    if (sequenceFlowIds != null && !sequenceFlowIds.isEmpty()) {
      Map<String, AtomicInteger> seqFlowMap =
          sequenceFlowMetrics.computeIfAbsent(key, k -> new ConcurrentHashMap<>());
      for (String seqFlowId : sequenceFlowIds) {
        seqFlowMap.computeIfAbsent(seqFlowId, id -> new AtomicInteger(0)).incrementAndGet();
      }
    }
  }

  /**
   * Get and reset animation metrics for a specific definition version. Returns counts for the
   * current window and clears for the next window.
   *
   * @param key The process definition key
   * @return Snapshot with activity and sequence flow counts, or null if no data
   */
  public AnimationSnapshot getAndResetSnapshot(ProcessDefinitionKey key) {
    Map<String, ActivityCounts> activityMap = activityMetrics.get(key);
    Map<String, AtomicInteger> seqFlowMap = sequenceFlowMetrics.get(key);

    if ((activityMap == null || activityMap.isEmpty())
        && (seqFlowMap == null || seqFlowMap.isEmpty())) {
      return null; // No data for this window
    }

    // Build activity snapshot and reset
    Map<String, ActivitySnapshot> activities = new HashMap<>();
    if (activityMap != null) {
      for (Map.Entry<String, ActivityCounts> entry : activityMap.entrySet()) {
        ActivitySnapshot snapshot = entry.getValue().getAndReset();
        if (snapshot.hasActivity()) {
          activities.put(entry.getKey(), snapshot);
        }
      }
    }

    // Build sequence flow snapshot and reset
    Map<String, Integer> sequenceFlows = new HashMap<>();
    if (seqFlowMap != null) {
      for (Map.Entry<String, AtomicInteger> entry : seqFlowMap.entrySet()) {
        int count = entry.getValue().getAndSet(0);
        if (count > 0) {
          sequenceFlows.put(entry.getKey(), count);
        }
      }
    }

    if (activities.isEmpty() && sequenceFlows.isEmpty()) {
      return null; // Nothing to broadcast
    }

    return new AnimationSnapshot(activities, sequenceFlows);
  }

  /** Immutable snapshot of activity counts for a single flow node */
  public record ActivitySnapshot(int active, int completed, int aborted) {
    public boolean hasActivity() {
      return active > 0 || completed > 0 || aborted > 0;
    }

    public int total() {
      return active + completed + aborted;
    }
  }

  /** Immutable snapshot of all animation data for a time window */
  public record AnimationSnapshot(
      Map<String, ActivitySnapshot> activities, Map<String, Integer> sequenceFlows) {}

  /** Internal class to track activity counts with atomic operations */
  private static class ActivityCounts {
    private final AtomicInteger activeCount = new AtomicInteger(0);
    private final AtomicInteger completedCount = new AtomicInteger(0);
    private final AtomicInteger abortedCount = new AtomicInteger(0);

    void recordEvent(ExecutionState state) {
      switch (state) {
        case ACTIVE:
        case INITIALIZED:
          activeCount.incrementAndGet();
          break;
        case COMPLETED:
          completedCount.incrementAndGet();
          break;
        case ABORTED:
          abortedCount.incrementAndGet();
          break;
      }
    }

    synchronized ActivitySnapshot getAndReset() {
      int active = activeCount.getAndSet(0);
      int completed = completedCount.getAndSet(0);
      int aborted = abortedCount.getAndSet(0);
      return new ActivitySnapshot(active, completed, aborted);
    }
  }
}
