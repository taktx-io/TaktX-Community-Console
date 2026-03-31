/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 * This file is part of TaktX, licensed under the TaktX Business Source License v1.0.
 * Free use is permitted with up to 3 Kafka partitions per topic. See LICENSE file for details.
 * For commercial use or more partitions and features, contact [https://www.taktx.io/contact].
 */

package io.taktx.console.ingester.inmemory.websocket;

/** Subscription types for the 4-level subscription model. */
public enum SubscriptionType {
  /** Subscribe to all process definitions (global overview) */
  ALL,

  /** Subscribe to all versions of a specific process definition */
  DEFINITION,

  /** Subscribe to a specific process definition version */
  DEFINITION_VERSION,

  /** Subscribe to a specific process instance */
  INSTANCE
}
