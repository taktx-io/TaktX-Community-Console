/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 */

package io.taktx.console.ingester.inmemory.websocket;

import java.util.concurrent.atomic.AtomicInteger;
import lombok.ToString;

/**
 * Tracks the ACTUAL STATE of flow node execution counts for a process definition.
 *
 * <p>This is NOT event counts, but the CURRENT STATE: - active: How many instances are CURRENTLY
 * executing this flow node - completed: How many instances have COMPLETED this flow node
 * (cumulative) - aborted: How many instances have ABORTED at this flow node (cumulative)
 */
@ToString
public class FlowNodeStateTracker {
  private final AtomicInteger active = new AtomicInteger(0);
  private final AtomicInteger completed = new AtomicInteger(0);
  private final AtomicInteger aborted = new AtomicInteger(0);

  /** Called when an instance STARTS this flow node (becomes active) */
  public void onActivate() {
    active.incrementAndGet();
  }

  /**
   * Called when an instance COMPLETES this flow node Uses atomic operation to safely decrement
   * active count (won't go below 0)
   */
  public void onComplete() {
    // Atomically decrement active, but never go below 0
    active.updateAndGet(current -> Math.max(0, current - 1));
    completed.incrementAndGet();
  }

  /**
   * Called when an instance ABORTS at this flow node Uses atomic operation to safely decrement
   * active count (won't go below 0)
   */
  public void onAbort() {
    // Atomically decrement active, but never go below 0
    active.updateAndGet(current -> Math.max(0, current - 1));
    aborted.incrementAndGet();
  }

  /** Get current state snapshot */
  public StateSnapshot getSnapshot() {
    return new StateSnapshot(active.get(), completed.get(), aborted.get());
  }

  /** Remove a previously retained contribution snapshot from this tracker. */
  public void subtractSnapshot(StateSnapshot snapshot) {
    active.updateAndGet(current -> Math.max(0, current - snapshot.active()));
    completed.updateAndGet(current -> Math.max(0, current - snapshot.completed()));
    aborted.updateAndGet(current -> Math.max(0, current - snapshot.aborted()));
  }

  /** Immutable snapshot of current state */
  public record StateSnapshot(int active, int completed, int aborted) {
    public boolean hasActivity() {
      return active > 0 || completed > 0 || aborted > 0;
    }
  }

  public AtomicInteger getActive() {
    return active;
  }

  public AtomicInteger getCompleted() {
    return completed;
  }

  public AtomicInteger getAborted() {
    return aborted;
  }
}
