/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 * This file is part of TaktX, licensed under the TaktX Business Source License v1.0.
 * Free use is permitted with up to 3 Kafka partitions per topic. See LICENSE file for details.
 * For commercial use or more partitions and features, contact [https://www.taktx.io/contact].
 */

package io.taktx.console.ingester.inmemory.websocket;

import io.taktx.dto.ExecutionState;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Single flow node event message (fine-grained). */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class FlowNodeEventMessage {
  private String type = "flownode-event";
  private String processInstanceId;
  private String flowNodeId;
  private ExecutionState eventType; // ACTIVE, COMPLETED, ABORTED
  private long timestamp;

  // Optional: sequence flow ids that were taken as part of this flow node event
  private List<String> sequenceFlowIds;

  // Flow node instance path to uniquely identify the instance (for multi-instance scenarios)
  private String flowNodeInstancePath;
}
