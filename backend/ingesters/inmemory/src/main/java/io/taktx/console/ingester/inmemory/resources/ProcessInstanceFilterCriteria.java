/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 * This file is part of TaktX, licensed under the TaktX Business Source License v1.0.
 * Free use is permitted with up to 3 Kafka partitions per topic. See LICENSE file for details.
 * For commercial use or more partitions and features, contact [https://www.taktx.io/contact].
 */

package io.taktx.console.ingester.inmemory.resources;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import lombok.Data;

/**
 * Generic filter criteria for querying process instances. Supports multiple filter types with
 * extensible design for future additions.
 */
@Data
public class ProcessInstanceFilterCriteria {

  /** Filter by process definition ID (optional) */
  @Pattern(
      regexp = "^[a-zA-Z0-9_-]+$",
      message =
          "Process definition ID can only contain alphanumeric characters, hyphens, and underscores")
  @Size(max = 128, message = "Process definition ID cannot exceed 128 characters")
  private String processDefinitionId;

  /** Filter by specific version (optional, requires processDefinitionId) */
  @Min(value = 1, message = "Version must be at least 1")
  @Max(value = 99999, message = "Version cannot exceed 99999")
  private Integer version;

  /**
   * Filter by state(s) - can be multiple states (optional). Supports both ExecutionState enum
   * values (INITIALIZED, ACTIVE, COMPLETED, ABORTED) and the special pseudo-state INCIDENT (filters
   * instances with active incidents).
   */
  @Size(max = 10, message = "Cannot filter by more than 10 states")
  private List<@NotNull(message = "State value cannot be null") ExecutionStateQueryParam> states;

  /** Filter by business key (optional) */
  @Size(max = 256, message = "Business key cannot exceed 256 characters")
  private String businessKey;

  /**
   * Filter by a single tag (optional, exact match). Premium supports multi-tag; community supports
   * one tag at a time.
   */
  @Size(max = 256, message = "Tag cannot exceed 256 characters")
  private String tag;

  /** Filter instances that have incidents (optional) */
  private Boolean hasIncident;

  /** Filter by specific process instance IDs (optional, takes precedence over other filters) */
  @Size(max = 10000, message = "Cannot filter by more than 10000 instance IDs")
  private List<UUID> processInstanceIds;

  /**
   * Filter by start time range (optional). Filters instances where startTime >= startTimeFrom
   * (inclusive).
   */
  private Instant startTimeFrom;

  /**
   * Filter by start time range (optional). Filters instances where startTime < startTimeTo
   * (exclusive).
   */
  private Instant startTimeTo;

  /**
   * Filter by end time range (optional). Filters instances where endTime >= endTimeFrom
   * (inclusive).
   */
  private Instant endTimeFrom;

  /**
   * Filter by end time range (optional). Filters instances where endTime < endTimeTo (exclusive).
   */
  private Instant endTimeTo;

  // Future filter fields can be added here:
  // private String variableName;
  // private String variableValue;

  /** Check if any filters are applied. */
  public boolean hasFilters() {
    return processDefinitionId != null
        || version != null
        || (states != null && !states.isEmpty())
        || businessKey != null
        || tag != null
        || hasIncident != null
        || (processInstanceIds != null && !processInstanceIds.isEmpty())
        || startTimeFrom != null
        || startTimeTo != null
        || endTimeFrom != null
        || endTimeTo != null;
  }

  /** Check if filtering by specific definition and version. */
  public boolean hasDefinitionAndVersion() {
    return processDefinitionId != null && version != null;
  }

  /** Check if filtering by definition only. */
  public boolean hasDefinitionOnly() {
    return processDefinitionId != null && version == null;
  }
}
