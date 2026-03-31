/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 * This file is part of TaktX, licensed under the TaktX Business Source License v1.0.
 * Free use is permitted with up to 3 Kafka partitions per topic. See LICENSE file for details.
 * For commercial use or more partitions and features, contact [https://www.taktx.io/contact].
 */

package io.taktx.console.ingester.inmemory.websocket;

import io.taktx.dto.ProcessDefinitionKey;
import java.util.UUID;

/** Context tracking what a WebSocket session is subscribed to. */
public record SubscriptionContext(
    SubscriptionType type, String processDefinitionId, Integer version, UUID processInstanceId) {

  /** Create context for global subscription */
  public static SubscriptionContext forAll() {
    return new SubscriptionContext(SubscriptionType.ALL, null, null, null);
  }

  /** Create context for definition subscription */
  public static SubscriptionContext forDefinition(String processDefinitionId) {
    return new SubscriptionContext(SubscriptionType.DEFINITION, processDefinitionId, null, null);
  }

  /** Create context for definition-version subscription */
  public static SubscriptionContext forDefinitionVersion(ProcessDefinitionKey key) {
    return new SubscriptionContext(
        SubscriptionType.DEFINITION_VERSION, key.getProcessDefinitionId(), key.getVersion(), null);
  }

  /** Create context for instance subscription */
  public static SubscriptionContext forInstance(UUID instanceId) {
    return new SubscriptionContext(SubscriptionType.INSTANCE, null, null, instanceId);
  }

  /** Get ProcessDefinitionKey if this is a definition-version subscription */
  public ProcessDefinitionKey getProcessDefinitionKey() {
    if (type == SubscriptionType.DEFINITION_VERSION
        && processDefinitionId != null
        && version != null) {
      return new ProcessDefinitionKey(processDefinitionId, version);
    }
    return null;
  }
}
