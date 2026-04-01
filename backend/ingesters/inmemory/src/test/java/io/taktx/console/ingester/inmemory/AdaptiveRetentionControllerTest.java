/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 */

package io.taktx.console.ingester.inmemory;

import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import io.taktx.console.ingester.inmemory.websocket.FlowNodeEventBroadcaster;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

class AdaptiveRetentionControllerTest {

  private AdaptiveRetentionController controller;
  private IngestionStore ingestionStore;
  private FlowNodeEventBroadcaster broadcaster;
  private HeapPressureSampler heapPressureSampler;

  @BeforeEach
  void setUp() {
    controller = new AdaptiveRetentionController();
    ingestionStore = Mockito.mock(IngestionStore.class);
    broadcaster = Mockito.mock(FlowNodeEventBroadcaster.class);
    heapPressureSampler = Mockito.mock(HeapPressureSampler.class);

    controller.ingestionStore = ingestionStore;
    controller.broadcaster = broadcaster;
    controller.heapPressureSampler = heapPressureSampler;
    controller.startupConfig = retentionConfig();
  }

  @Test
  void shouldEvictWhenHeapPressureExceedsHighWatermark() {
    when(heapPressureSampler.sample())
        .thenReturn(new HeapPressureSnapshot(85, 100), new HeapPressureSnapshot(50, 100));
    when(ingestionStore.getRetentionStats())
        .thenReturn(
            new RetentionStats(30_000, 20_000, 600_000L, 900_000_000L),
            new RetentionStats(29_750, 19_750, 599_000L, 700_000_000L));
    when(ingestionStore.evictOldestTerminalInstances(250, 300_000L, 0L))
        .thenReturn(List.of(new EvictedProcessInstance(UUID.randomUUID(), null, null, List.of())));

    controller.runRetentionCheck(0L);

    verify(ingestionStore).evictOldestTerminalInstances(250, 300_000L, 0L);
    verify(broadcaster).handleEvictedInstances(anyList());
  }

  @Test
  void shouldSkipEvictionWhenHeapPressureAndStatsAreHealthy() {
    when(heapPressureSampler.sample()).thenReturn(new HeapPressureSnapshot(50, 100));
    when(ingestionStore.getRetentionStats())
        .thenReturn(new RetentionStats(10_000, 4_000, 100_000L, 100_000_000L));

    controller.runRetentionCheck(0L);

    verify(ingestionStore, never())
        .evictOldestTerminalInstances(Mockito.anyInt(), Mockito.anyLong(), Mockito.anyLong());
    verify(broadcaster, never()).handleEvictedInstances(anyList());
  }

  @Test
  void shouldEvictWhenEstimatedRetainedBytesExceedDynamicCap() {
    when(heapPressureSampler.sample())
        .thenReturn(new HeapPressureSnapshot(70, 100), new HeapPressureSnapshot(60, 100));
    when(ingestionStore.getRetentionStats())
        .thenReturn(
            new RetentionStats(10_000, 4_000, 100_000L, 900_000_000L),
            new RetentionStats(9_900, 3_900, 99_000L, 500_000_000L));
    when(ingestionStore.evictOldestTerminalInstances(250, 300_000L, 0L))
        .thenReturn(List.of(new EvictedProcessInstance(UUID.randomUUID(), null, null, List.of())));

    controller.runRetentionCheck(0L);

    verify(ingestionStore).evictOldestTerminalInstances(250, 300_000L, 0L);
    verify(broadcaster).handleEvictedInstances(anyList());
  }

  private IngesterStartupConfig retentionConfig() {
    IngesterStartupConfig config = new IngesterStartupConfig();
    config.retentionEnabled = true;
    config.retentionCheckInterval = Duration.ofSeconds(30);
    config.retentionHeapTargetWatermark = 0.65d;
    config.retentionHeapHighWatermark = 0.80d;
    config.retentionMinTerminalInstances = 5_000;
    config.retentionMaxTerminalInstances = 25_000;
    config.retentionMinFlowNodeUpdates = 150_000L;
    config.retentionMaxFlowNodeUpdates = 750_000L;
    config.retentionMinRetainedBytes = 268_435_456L;
    config.retentionMaxRetainedBytes = 1_073_741_824L;
    config.retentionEvictBatchSize = 250;
    config.retentionMinTerminalAge = Duration.ofMinutes(5);
    return config;
  }
}
