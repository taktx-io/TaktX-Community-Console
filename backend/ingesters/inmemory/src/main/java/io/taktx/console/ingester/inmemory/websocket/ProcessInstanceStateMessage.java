/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 */

package io.taktx.console.ingester.inmemory.websocket;

import java.util.Map;

/**
 * Message containing flow node state for a specific process instance.
 *
 * <p>Sent periodically (every 100ms) to clients subscribed to a specific instance. Contains the
 * CURRENT STATE of all flow nodes for that instance.
 */
public record ProcessInstanceStateMessage(
    String type, // "process-instance-state"
    String processInstanceId,
    Map<String, FlowNodeState> flowNodeStates, // flowNodeId -> state
    long timestamp) {

  /** State of a single flow node for this instance */
  public record FlowNodeState(
      int active, // Currently executing (0 or 1 for single instance)
      int completed, // Total completed
      int aborted // Total aborted
      ) {}
}
