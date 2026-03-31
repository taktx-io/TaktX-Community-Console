/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 */

package io.taktx.console.ingester.inmemory.websocket;

import java.util.Map;

/**
 * Message containing process instance counts for all definitions with version-level detail. Sent to
 * sessions subscribed with "subscribe-all".
 *
 * <p>This message includes counts per version for all process definitions, allowing the frontend to
 * display a tree table with expandable versions while aggregating totals per definition.
 */
public record ProcessDefinitionsWithVersionsSummaryMessage(
    String type, // "process-definitions-with-versions-summary"
    Map<String, Map<Integer, Map<String, Integer>>>
        definitions, // processDefinitionId -> version -> state -> count
    long timestamp) {}
