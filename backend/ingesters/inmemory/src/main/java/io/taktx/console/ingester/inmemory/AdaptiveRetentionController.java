/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 * This file is part of TaktX, licensed under the TaktX Business Source License v1.0.
 * Free use is permitted with up to 3 Kafka partitions per topic. See LICENSE file for details.
 * For commercial use or more partitions and features, contact [https://www.taktx.io/contact].
 */

package io.taktx.console.ingester.inmemory;

import io.quarkus.runtime.Startup;
import io.taktx.console.ingester.inmemory.websocket.FlowNodeEventBroadcaster;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Startup
@ApplicationScoped
public class AdaptiveRetentionController {

  private static final int MAX_SWEEPS_PER_RUN = 20;

  private final ScheduledExecutorService scheduler =
      Executors.newSingleThreadScheduledExecutor(
          runnable -> {
            Thread thread = new Thread(runnable, "adaptive-retention-controller");
            thread.setDaemon(true);
            return thread;
          });

  @Inject IngesterStartupConfig startupConfig;
  @Inject IngestionStore ingestionStore;
  @Inject HeapPressureSampler heapPressureSampler;
  @Inject FlowNodeEventBroadcaster broadcaster;

  @PostConstruct
  void onStartup() {
    if (!startupConfig.isRetentionEnabled()) {
      log.info("Adaptive retention disabled");
      return;
    }

    long intervalMillis = Math.max(1L, startupConfig.getRetentionCheckInterval().toMillis());
    scheduler.scheduleWithFixedDelay(
        this::runRetentionCheckSafely, intervalMillis, intervalMillis, TimeUnit.MILLISECONDS);
    log.info(
        "Adaptive retention enabled: interval={} targetWatermark={} highWatermark={} terminalInstances=[{}, {}] flowNodeUpdates=[{}, {}] retainedBytes=[{}, {}]",
        startupConfig.getRetentionCheckInterval(),
        startupConfig.getRetentionHeapTargetWatermark(),
        startupConfig.getRetentionHeapHighWatermark(),
        startupConfig.getRetentionMinTerminalInstances(),
        startupConfig.getRetentionMaxTerminalInstances(),
        startupConfig.getRetentionMinFlowNodeUpdates(),
        startupConfig.getRetentionMaxFlowNodeUpdates(),
        startupConfig.getRetentionMinRetainedBytes(),
        startupConfig.getRetentionMaxRetainedBytes());
  }

  void runRetentionCheckSafely() {
    try {
      runRetentionCheck(System.currentTimeMillis());
    } catch (Exception e) {
      log.error("Adaptive retention check failed", e);
    }
  }

  void runRetentionCheck() {
    runRetentionCheck(System.currentTimeMillis());
  }

  void runRetentionCheck(long nowMillis) {
    HeapPressureSnapshot heapPressure = heapPressureSampler.sample();
    RetentionStats retentionStats = ingestionStore.getRetentionStats();

    int terminalInstanceCap =
        dynamicCap(
            heapPressure.usedRatio(),
            startupConfig.getRetentionMinTerminalInstances(),
            startupConfig.getRetentionMaxTerminalInstances(),
            startupConfig.getRetentionHeapTargetWatermark(),
            startupConfig.getRetentionHeapHighWatermark());
    long flowNodeUpdateCap =
        dynamicCap(
            heapPressure.usedRatio(),
            startupConfig.getRetentionMinFlowNodeUpdates(),
            startupConfig.getRetentionMaxFlowNodeUpdates(),
            startupConfig.getRetentionHeapTargetWatermark(),
            startupConfig.getRetentionHeapHighWatermark());
    long retainedBytesCap =
        dynamicCap(
            heapPressure.usedRatio(),
            startupConfig.getRetentionMinRetainedBytes(),
            startupConfig.getRetentionMaxRetainedBytes(),
            startupConfig.getRetentionHeapTargetWatermark(),
            startupConfig.getRetentionHeapHighWatermark());

    if (!shouldEvict(
        heapPressure, retentionStats, terminalInstanceCap, flowNodeUpdateCap, retainedBytesCap)) {
      return;
    }

    if (log.isDebugEnabled()) {
      log.debug(
          "Adaptive retention triggered: heapUsedRatio={} terminalInstances={} totalFlowNodeUpdates={} retainedBytes={} targetTerminalCap={} targetFlowNodeCap={} targetRetainedBytesCap={}",
          String.format("%.3f", heapPressure.usedRatio()),
          retentionStats.terminalProcessInstances(),
          retentionStats.totalFlowNodeUpdates(),
          retentionStats.totalEstimatedRetainedBytes(),
          terminalInstanceCap,
          flowNodeUpdateCap,
          retainedBytesCap);
    }

    int sweepCount = 0;
    while (sweepCount < MAX_SWEEPS_PER_RUN
        && shouldEvict(
            heapPressure,
            retentionStats,
            terminalInstanceCap,
            flowNodeUpdateCap,
            retainedBytesCap)) {
      List<EvictedProcessInstance> evictedInstances =
          ingestionStore.evictOldestTerminalInstances(
              startupConfig.getRetentionEvictBatchSize(),
              startupConfig.getRetentionMinTerminalAge().toMillis(),
              nowMillis);
      if (evictedInstances.isEmpty()) {
        break;
      }

      broadcaster.handleEvictedInstances(evictedInstances);
      retentionStats = ingestionStore.getRetentionStats();
      heapPressure = heapPressureSampler.sample();
      terminalInstanceCap =
          dynamicCap(
              heapPressure.usedRatio(),
              startupConfig.getRetentionMinTerminalInstances(),
              startupConfig.getRetentionMaxTerminalInstances(),
              startupConfig.getRetentionHeapTargetWatermark(),
              startupConfig.getRetentionHeapHighWatermark());
      flowNodeUpdateCap =
          dynamicCap(
              heapPressure.usedRatio(),
              startupConfig.getRetentionMinFlowNodeUpdates(),
              startupConfig.getRetentionMaxFlowNodeUpdates(),
              startupConfig.getRetentionHeapTargetWatermark(),
              startupConfig.getRetentionHeapHighWatermark());
      retainedBytesCap =
          dynamicCap(
              heapPressure.usedRatio(),
              startupConfig.getRetentionMinRetainedBytes(),
              startupConfig.getRetentionMaxRetainedBytes(),
              startupConfig.getRetentionHeapTargetWatermark(),
              startupConfig.getRetentionHeapHighWatermark());
      sweepCount++;
    }
  }

  private boolean shouldEvict(
      HeapPressureSnapshot heapPressure,
      RetentionStats retentionStats,
      int terminalInstanceCap,
      long flowNodeUpdateCap,
      long retainedBytesCap) {
    return heapPressure.usedRatio() >= startupConfig.getRetentionHeapHighWatermark()
        || retentionStats.terminalProcessInstances() > terminalInstanceCap
        || retentionStats.totalFlowNodeUpdates() > flowNodeUpdateCap
        || retentionStats.totalEstimatedRetainedBytes() > retainedBytesCap;
  }

  private int dynamicCap(
      double usedRatio, int minCap, int maxCap, double targetWatermark, double highWatermark) {
    return (int)
        Math.round(
            dynamicCap(
                (double) usedRatio,
                (double) minCap,
                (double) maxCap,
                targetWatermark,
                highWatermark));
  }

  private long dynamicCap(
      double usedRatio, long minCap, long maxCap, double targetWatermark, double highWatermark) {
    return Math.round(
        dynamicCap(
            (double) usedRatio, (double) minCap, (double) maxCap, targetWatermark, highWatermark));
  }

  private double dynamicCap(
      double usedRatio,
      double minCap,
      double maxCap,
      double targetWatermark,
      double highWatermark) {
    if (maxCap <= minCap) {
      return minCap;
    }
    if (usedRatio <= targetWatermark) {
      return maxCap;
    }
    if (usedRatio >= highWatermark || highWatermark <= targetWatermark) {
      return minCap;
    }

    double pressure = (usedRatio - targetWatermark) / (highWatermark - targetWatermark);
    return maxCap - ((maxCap - minCap) * pressure);
  }

  @PreDestroy
  void onShutdown() {
    scheduler.shutdownNow();
    try {
      if (!scheduler.awaitTermination(5, TimeUnit.SECONDS)) {
        log.warn("Adaptive retention scheduler did not terminate cleanly within timeout");
      }
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
  }
}
