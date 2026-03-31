/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 */

package io.taktx.console.ingester.inmemory.websocket;

import io.taktx.dto.ExecutionState;

/**
 * Lightweight metadata message for process instance state changes. Sent to instance subscribers for
 * table row updates.
 */
public record ProcessInstanceMetadataMessage(
    String type, // "process-instance-metadata"
    String instanceId,
    ExecutionState state,
    Long endTimeMillis) {}
