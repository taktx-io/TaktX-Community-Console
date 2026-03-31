/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 * This file is part of TaktX, licensed under the TaktX Business Source License v1.0.
 * Free use is permitted with up to 3 Kafka partitions per topic. See LICENSE file for details.
 * For commercial use or more partitions and features, contact [https://www.taktx.io/contact].
 */

package io.taktx.console.ingester.inmemory.websocket;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * WebSocket subscription message supporting 4 subscription types: - subscribe-all: Global overview
 * (no other fields required) - subscribe-definition: All versions of a definition (requires
 * processDefinitionId) - subscribe-definition-version: Specific version (requires
 * processDefinitionId + version) - subscribe-instance: Specific instance (requires
 * processInstanceId)
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class SubscribeMessage {
  private String type; // subscribe-all, subscribe-definition, subscribe-definition-version,
  // subscribe-instance, unsubscribe

  // Optional fields - validated based on type
  private String processDefinitionId;
  private Integer version; // Using Integer to distinguish null from 0
  private String processInstanceId;
}
