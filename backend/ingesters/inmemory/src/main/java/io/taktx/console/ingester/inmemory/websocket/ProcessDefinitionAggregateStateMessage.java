/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 */

package io.taktx.console.ingester.inmemory.websocket;

import java.util.Map;

/**
 * Message containing aggregate flow node state for a process definition.
 *
 * <p>Sent periodically (every 100ms) to clients subscribed to a process definition. Contains the
 * CURRENT STATE of all flow nodes, not event counts.
 */
public record ProcessDefinitionAggregateStateMessage(
    String type, // "process-definition-aggregate-state"
    String processDefinitionId,
    int version,
    Map<String, FlowNodeState> flowNodeStates, // flowNodeId -> state
    long timestamp) {

  /** State of a single flow node (activity/gateway/event) */
  public record FlowNodeState(
      int active, // Currently executing instances
      int completed, // Total completed instances
      int aborted // Total aborted instances
      ) {}
}
