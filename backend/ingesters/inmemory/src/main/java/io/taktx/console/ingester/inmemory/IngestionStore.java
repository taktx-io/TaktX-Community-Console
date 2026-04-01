/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 * This file is part of TaktX, licensed under the TaktX Business Source License v1.0.
 * Free use is permitted with up to 3 Kafka partitions per topic. See LICENSE file for details.
 * For commercial use or more partitions and features, contact [https://www.taktx.io/contact].
 */

package io.taktx.console.ingester.inmemory;

import com.fasterxml.jackson.databind.JsonNode;
import io.taktx.console.ingester.inmemory.resources.OrderByType;
import io.taktx.console.ingester.inmemory.resources.ProcessInstanceFilterCriteria;
import io.taktx.console.ingester.inmemory.resources.TimedFlowNodeInstance;
import io.taktx.dto.ProcessDefinitionKey;
import io.taktx.dto.ProcessInstanceUpdateDTO;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Persistence port for ingested process-instance state. */
public interface IngestionStore {

  void clear();

  void putProcessInstanceDefinitionKey(UUID processInstanceId, ProcessDefinitionKey definitionKey);

  ProcessDefinitionKey getProcessInstanceDefinitionKey(UUID processInstanceId);

  void putProcessInstanceUpdate(UUID processInstanceId, ProcessInstanceUpdateDTO update);

  ProcessInstanceView getProcessInstanceById(UUID processInstanceId);

  void saveProcessInstanceView(ProcessInstanceView view);

  TimedFlowNodeInstance getFlowNodeInstance(UUID processInstanceId, String flowNodeInstancePath);

  void saveFlowNodeInstance(
      UUID processInstanceId, String flowNodeInstancePath, TimedFlowNodeInstance flowNodeInstance);

  ProcessInstancePage queryProcessInstances(
      ProcessInstanceFilterCriteria criteria,
      int start,
      int limit,
      OrderByType orderBy,
      OrderDirection orderDirection);

  List<TimedFlowNodeInstance> getFlowNodeInstancesByProcessInstance(UUID processInstanceId);

  int getFlowNodeInstanceCountByProcessInstance(UUID processInstanceId);

  Map<String, JsonNode> getProcessVariables(UUID processInstanceId);

  RetentionStats getRetentionStats();

  List<EvictedProcessInstance> evictOldestTerminalInstances(
      int limit, long minTerminalAgeMillis, long nowMillis);
}
