/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 */

package io.taktx.console.ingester.inmemory.websocket;

import java.util.Map;

/**
 * Message containing process instance counts per version for a specific definition. Sent to
 * sessions subscribed with "subscribe-definition".
 *
 * <p>Note: Using String keys for state counts instead of ExecutionState enum to ensure proper JSON
 * serialization.
 */
public record ProcessDefinitionVersionsSummaryMessage(
    String type, // "process-definition-versions-summary"
    String processDefinitionId,
    Map<Integer, Map<String, Integer>> versions, // version -> state (as String) -> count
    long timestamp) {}
