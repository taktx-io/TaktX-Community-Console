/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 * This file is part of TaktX, licensed under the TaktX Business Source License v1.0.
 * Free use is permitted with up to 3 Kafka partitions per topic. See LICENSE file for details.
 * For commercial use or more partitions and features, contact [https://www.taktx.io/contact].
 */

package io.taktx.console.ingester.inmemory;

import com.fasterxml.jackson.databind.JsonNode;
import io.taktx.console.ingester.inmemory.resources.TimedFlowNodeInstance;
import io.taktx.console.ingester.inmemory.resources.TimedFlowNodeInstance.TimedFlowNodeUpdate;
import io.taktx.dto.FlowNodeInstanceUpdateDTO;
import io.taktx.dto.ProcessDefinitionKey;
import io.taktx.dto.ProcessInstanceUpdateDTO;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

final class RetainedByteEstimator {

  private static final long OBJECT_OVERHEAD = 32L;
  private static final long MAP_OVERHEAD = 96L;
  private static final long LIST_OVERHEAD = 48L;
  private static final long MAP_ENTRY_OVERHEAD = 48L;
  private static final long STRING_OVERHEAD = 40L;
  private static final long UUID_OVERHEAD = 24L;
  private static final long INSTANT_OVERHEAD = 24L;
  private static final long ENUM_OVERHEAD = 8L;
  private static final long LONG_OVERHEAD = 8L;
  private static final long INT_OVERHEAD = 4L;

  long estimateProcessDefinitionKey(ProcessDefinitionKey key) {
    if (key == null) {
      return 0L;
    }
    return OBJECT_OVERHEAD + estimateString(key.getProcessDefinitionId()) + INT_OVERHEAD;
  }

  long estimateProcessInstanceView(ProcessInstanceView view) {
    if (view == null) {
      return 0L;
    }
    return OBJECT_OVERHEAD
        + estimateUuid(view.getProcessInstanceId())
        + estimateString(view.getProcessDefinitionId())
        + INT_OVERHEAD
        + estimateInstant(view.getStartTime())
        + estimateInstant(view.getEndTime())
        + estimateEnum(view.getState())
        + estimateObjectAsString(view.getIncidentInfo())
        + estimateUuid(view.getParentProcessInstanceId());
  }

  long estimateProcessInstanceUpdate(ProcessInstanceUpdateDTO update) {
    if (update == null) {
      return 0L;
    }
    return OBJECT_OVERHEAD
        + estimateUuid(update.getParentProcessInstanceId())
        + estimateLongList(update.getParentElementInstancePath())
        + estimateProcessDefinitionKey(update.getProcessDefinitionKey())
        + estimateObjectAsString(update.getIncidentInfoDTO())
        + estimateObjectAsString(update.getScope())
        + estimateJsonNodeMap(
            update.getVariables() != null ? update.getVariables().getVariables() : null)
        + estimateNullableLong(update.getProcessStartTime())
        + estimateNullableLong(update.getProcessEndTime());
  }

  long estimateTimedFlowNodeInstance(TimedFlowNodeInstance flowNodeInstance) {
    if (flowNodeInstance == null) {
      return 0L;
    }
    return OBJECT_OVERHEAD
        + LONG_OVERHEAD
        + estimateFlowNodeInstanceUpdate(flowNodeInstance.flowNodeInstanceUpdate())
        + estimateString(flowNodeInstance.elementId())
        + estimateString(flowNodeInstance.elementName())
        + estimateString(flowNodeInstance.elementType())
        + estimateJsonNodeMap(flowNodeInstance.mergedVariables())
        + estimateTimedFlowNodeUpdates(flowNodeInstance.updateHistory());
  }

  long estimateFlowNodeUpdates(Map<String, TimedFlowNodeInstance> flowNodeInstances) {
    if (flowNodeInstances == null || flowNodeInstances.isEmpty()) {
      return 0L;
    }
    long size = MAP_OVERHEAD;
    for (Map.Entry<String, TimedFlowNodeInstance> entry : flowNodeInstances.entrySet()) {
      size += MAP_ENTRY_OVERHEAD;
      size += estimateString(entry.getKey());
      size += estimateTimedFlowNodeInstance(entry.getValue());
    }
    return size;
  }

  int countRetainedFlowNodeUpdates(Map<String, TimedFlowNodeInstance> flowNodeInstances) {
    if (flowNodeInstances == null || flowNodeInstances.isEmpty()) {
      return 0;
    }
    int count = 0;
    for (TimedFlowNodeInstance flowNodeInstance : flowNodeInstances.values()) {
      count += countRetainedFlowNodeUpdates(flowNodeInstance);
    }
    return count;
  }

  int countRetainedFlowNodeUpdates(TimedFlowNodeInstance flowNodeInstance) {
    if (flowNodeInstance == null) {
      return 0;
    }
    List<TimedFlowNodeUpdate> updateHistory = flowNodeInstance.updateHistory();
    if (updateHistory == null || updateHistory.isEmpty()) {
      return 1;
    }
    return updateHistory.size();
  }

  private long estimateFlowNodeInstanceUpdate(FlowNodeInstanceUpdateDTO update) {
    if (update == null) {
      return 0L;
    }
    return OBJECT_OVERHEAD
        + estimateLongList(update.getFlowNodeInstancePath())
        + estimateObjectAsString(update.getFlowNodeInstance())
        + estimateJsonNodeMap(
            update.getVariables() != null ? update.getVariables().getVariables() : null)
        + LONG_OVERHEAD
        + estimateString(update.getInputSequenceFlowId())
        + estimateStringList(update.getOutputSequenceFlowIds());
  }

  private long estimateTimedFlowNodeUpdates(List<TimedFlowNodeUpdate> updateHistory) {
    if (updateHistory == null || updateHistory.isEmpty()) {
      return 0L;
    }
    long size = LIST_OVERHEAD;
    for (TimedFlowNodeUpdate update : updateHistory) {
      size += OBJECT_OVERHEAD + LONG_OVERHEAD;
      size += estimateFlowNodeInstanceUpdate(update.flowNodeInstanceUpdate());
    }
    return size;
  }

  private long estimateJsonNodeMap(Map<String, JsonNode> variables) {
    if (variables == null || variables.isEmpty()) {
      return 0L;
    }
    long size = MAP_OVERHEAD;
    for (Map.Entry<String, JsonNode> entry : variables.entrySet()) {
      size += MAP_ENTRY_OVERHEAD;
      size += estimateString(entry.getKey());
      size += estimateJsonNode(entry.getValue());
    }
    return size;
  }

  private long estimateJsonNode(JsonNode jsonNode) {
    if (jsonNode == null) {
      return 0L;
    }
    return OBJECT_OVERHEAD + estimateString(jsonNode.toString());
  }

  private long estimateLongList(List<Long> values) {
    if (values == null || values.isEmpty()) {
      return 0L;
    }
    return LIST_OVERHEAD + (values.size() * LONG_OVERHEAD);
  }

  private long estimateStringList(List<String> values) {
    if (values == null || values.isEmpty()) {
      return 0L;
    }
    long size = LIST_OVERHEAD;
    for (String value : values) {
      size += estimateString(value);
    }
    return size;
  }

  private long estimateNullableLong(Long value) {
    return value == null ? 0L : LONG_OVERHEAD;
  }

  private long estimateInstant(Instant instant) {
    return instant == null ? 0L : INSTANT_OVERHEAD;
  }

  private long estimateUuid(UUID uuid) {
    return uuid == null ? 0L : UUID_OVERHEAD;
  }

  private long estimateEnum(Enum<?> value) {
    return value == null ? 0L : ENUM_OVERHEAD;
  }

  private long estimateObjectAsString(Object value) {
    if (value == null) {
      return 0L;
    }
    return OBJECT_OVERHEAD + estimateString(value.toString());
  }

  private long estimateString(String value) {
    if (value == null) {
      return 0L;
    }
    return STRING_OVERHEAD + (value.length() * 2L);
  }
}
