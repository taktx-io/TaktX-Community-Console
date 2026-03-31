/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 * This file is part of TaktX, licensed under the TaktX Business Source License v1.0.
 * Free use is permitted with up to 3 Kafka partitions per topic. See LICENSE file for details.
 * For commercial use or more partitions and features, contact [https://www.taktx.io/contact].
 */

package io.taktx.console.ingester.inmemory.websocket;

import java.util.Map;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Aggregated activity message for a flow node. Contains metrics about recent activity rather than
 * individual events.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class FlowNodeActivityMessage {
  private String type = "flownode-activity";
  private String flowNodeId;
  private int activeCount;
  private int completedCount;
  private int abortedCount;
  private long timestamp;
  private Map<String, Integer> sequenceFlowIds;
}
