/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 * This file is part of TaktX, licensed under the TaktX Business Source License v1.0.
 * Free use is permitted with up to 3 Kafka partitions per topic. See LICENSE file for details.
 * For commercial use or more partitions and features, contact [https://www.taktx.io/contact].
 */

package io.taktx.console.ingester.inmemory;

import io.taktx.console.ingester.inmemory.resources.TimedFlowNodeInstance;
import io.taktx.dto.ProcessDefinitionKey;
import java.util.List;
import java.util.UUID;

public record EvictedProcessInstance(
    UUID processInstanceId,
    ProcessDefinitionKey definitionKey,
    ProcessInstanceView processInstanceView,
    List<TimedFlowNodeInstance> flowNodeInstances) {}
