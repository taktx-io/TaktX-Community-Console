/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 */

package io.taktx.console.ingester.inmemory.websocket;

import java.util.Map;

/**
 * Message containing process instance counts for all definitions (global overview). Sent to
 * sessions subscribed with "subscribe-all".
 *
 * <p>Note: Using String keys for state counts instead of ExecutionState enum to ensure proper JSON
 * serialization (enum keys can cause issues with Jackson serialization).
 */
public record ProcessDefinitionsSummaryMessage(
    String type, // "process-definitions-summary"
    Map<String, Map<String, Integer>>
        definitions, // processDefinitionId -> state (as String) -> count
    long timestamp) {}
