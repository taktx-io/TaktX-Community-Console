/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 * This file is part of TaktX, licensed under the TaktX Business Source License v1.0.
 * Free use is permitted with up to 3 Kafka partitions per topic. See LICENSE file for details.
 * For commercial use or more partitions and features, contact [https://www.taktx.io/contact].
 */

package io.taktx.console.ingester.inmemory.resources;

import io.taktx.dto.ExecutionState;
import java.util.Objects;

/**
 * Wrapper for state query parameters that handles both actual ExecutionState enum values and the
 * special pseudo-state "INCIDENT" used by the frontend.
 *
 * <p>INCIDENT is not a real execution state - it's a filter that matches process instances with
 * active incidents (incidentInfo != null), regardless of their actual execution state.
 */
public class ExecutionStateQueryParam {
  private final ExecutionState executionState;
  private final boolean isIncidentFilter;

  private ExecutionStateQueryParam(ExecutionState executionState, boolean isIncidentFilter) {
    this.executionState = executionState;
    this.isIncidentFilter = isIncidentFilter;
  }

  /**
   * Parse a state query parameter value. Accepts ExecutionState enum names (INITIALIZED, ACTIVE,
   * COMPLETED, ABORTED) or the special pseudo-state "INCIDENT".
   */
  public static ExecutionStateQueryParam fromString(String value) {
    if (value == null || value.isBlank()) {
      throw new IllegalArgumentException("State value cannot be null or empty");
    }

    String normalized = value.trim().toUpperCase();

    // Handle special INCIDENT pseudo-state
    if ("INCIDENT".equals(normalized)) {
      return new ExecutionStateQueryParam(null, true);
    }

    // Parse as ExecutionState enum
    try {
      ExecutionState state = ExecutionState.valueOf(normalized);
      return new ExecutionStateQueryParam(state, false);
    } catch (IllegalArgumentException e) {
      throw new IllegalArgumentException(
          "Invalid state value: "
              + value
              + ". Must be one of: INITIALIZED, ACTIVE, COMPLETED, ABORTED, or INCIDENT");
    }
  }

  public ExecutionState getExecutionState() {
    return executionState;
  }

  public boolean isIncidentFilter() {
    return isIncidentFilter;
  }

  public boolean isExecutionState() {
    return executionState != null;
  }

  @Override
  public boolean equals(Object o) {
    if (this == o) return true;
    if (o == null || getClass() != o.getClass()) return false;
    ExecutionStateQueryParam that = (ExecutionStateQueryParam) o;
    return isIncidentFilter == that.isIncidentFilter
        && Objects.equals(executionState, that.executionState);
  }

  @Override
  public int hashCode() {
    return Objects.hash(executionState, isIncidentFilter);
  }

  @Override
  public String toString() {
    if (isIncidentFilter) {
      return "INCIDENT";
    }
    return executionState.name();
  }
}
