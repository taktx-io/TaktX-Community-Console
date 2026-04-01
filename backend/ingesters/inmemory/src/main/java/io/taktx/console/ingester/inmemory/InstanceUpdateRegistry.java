/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 * This file is part of TaktX, licensed under the TaktX Business Source License v1.0.
 * Free use is permitted with up to 3 Kafka partitions per topic. See LICENSE file for details.
 * For commercial use or more partitions and features, contact [https://www.taktx.io/contact].
 */

package io.taktx.console.ingester.inmemory;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.taktx.client.InstanceUpdateRecord;
import io.taktx.console.ingester.inmemory.resources.TimedFlowNodeInstance;
import io.taktx.console.ingester.inmemory.resources.TimedFlowNodeInstance.TimedFlowNodeUpdate;
import io.taktx.console.ingester.inmemory.websocket.FlowNodeEventBroadcaster;
import io.taktx.console.ingester.inmemory.websocket.FlowNodeEventMessage;
import io.taktx.dto.ExecutionState;
import io.taktx.dto.FlowNodeInstanceUpdateDTO;
import io.taktx.dto.ProcessDefinitionKey;
import io.taktx.dto.ProcessInstanceUpdateDTO;
import jakarta.enterprise.context.ApplicationScoped;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@ApplicationScoped
@RequiredArgsConstructor
public class InstanceUpdateRegistry {
  private final FlowNodeEventBroadcaster broadcaster;
  private final ObjectMapper objectMapper;
  private final ProcessDefinitionCache processDefinitionCache;
  private final IngestionStore ingestionStore;

  public void handleInstanceUpdates(List<InstanceUpdateRecord> instanceUpdateRecords) {
    log.debug("Handling {} instance update records", instanceUpdateRecords.size());
    for (InstanceUpdateRecord instanceUpdateRecord : instanceUpdateRecords) {
      try {
        handleInstanceUpdate(instanceUpdateRecord);
      } catch (JsonProcessingException e) {
        throw new RuntimeException(e);
      }
    }
  }

  private void handleInstanceUpdate(InstanceUpdateRecord instanceUpdateRecord)
      throws JsonProcessingException {
    if (instanceUpdateRecord.getUpdate()
        instanceof ProcessInstanceUpdateDTO processInstanceUpdateDTO) {
      ingestionStore.putProcessInstanceDefinitionKey(
          instanceUpdateRecord.getProcessInstanceId(),
          processInstanceUpdateDTO.getProcessDefinitionKey());

      // Store the full DTO for detailed view
      ingestionStore.putProcessInstanceUpdate(
          instanceUpdateRecord.getProcessInstanceId(), processInstanceUpdateDTO);

      log.debug(
          "Registered process instance {} for definition {}",
          instanceUpdateRecord.getProcessInstanceId(),
          processInstanceUpdateDTO.getProcessDefinitionKey());

      // Phase 1: create or update a lightweight view entry
      ProcessDefinitionKey key = processInstanceUpdateDTO.getProcessDefinitionKey();

      // Capture old state before update for state transition tracking
      ProcessInstanceView existing =
          ingestionStore.getProcessInstanceById(instanceUpdateRecord.getProcessInstanceId());
      ExecutionState oldState = existing != null ? existing.getState() : null;
      boolean hadIncident = existing != null && existing.getIncidentInfo() != null;

      ProcessInstanceView updated = existing;
      if (updated == null) {
        updated =
            ProcessInstanceView.createNew(
                instanceUpdateRecord.getProcessInstanceId(),
                key,
                processInstanceUpdateDTO.getScope().getState(),
                processInstanceUpdateDTO.getProcessStartTime(),
                processInstanceUpdateDTO.getProcessEndTime());
        if (processInstanceUpdateDTO.getParentProcessInstanceId() != null) {
          updated.setParentProcessInstanceId(processInstanceUpdateDTO.getParentProcessInstanceId());
        }
      }
      if (processInstanceUpdateDTO.getScope() != null
          && processInstanceUpdateDTO.getScope().getState() != null) {
        ExecutionState state = processInstanceUpdateDTO.getScope().getState();
        updated.setState(state);
        if (processInstanceUpdateDTO.getIncidentInfoDTO() != null) {
          updated.setIncidentInfo(processInstanceUpdateDTO.getIncidentInfoDTO());
        }
        if (processInstanceUpdateDTO.getProcessEndTime() != null) {
          updated.setEndTime(Instant.ofEpochMilli(processInstanceUpdateDTO.getProcessEndTime()));
        }
      }
      ingestionStore.saveProcessInstanceView(updated);

      // Record state changes
      if (updated != null) {
        ExecutionState newState = updated.getState();
        boolean hasIncident = updated.getIncidentInfo() != null;

        // Record incident state change FIRST (if changed)
        if (hadIncident != hasIncident) {
          broadcaster.recordIncidentChange(
              instanceUpdateRecord.getProcessInstanceId(), key, newState, hadIncident, hasIncident);
          log.debug(
              "Instance {} incident change: {} -> {} (state: {})",
              instanceUpdateRecord.getProcessInstanceId(),
              hadIncident,
              hasIncident,
              newState);
        }

        // Record state transition if state changed
        // BUT: If instance currently has an incident, DON'T record the state transition
        // (it's counted in INCIDENT, not in ExecutionState)
        if (!java.util.Objects.equals(oldState, newState)) {
          if (!hasIncident) {
            // Normal case: no incident, record state transition
            broadcaster.recordInstanceStateChange(
                instanceUpdateRecord.getProcessInstanceId(), key, oldState, newState);
            log.debug(
                "Instance {} state transition: {} -> {}",
                instanceUpdateRecord.getProcessInstanceId(),
                oldState,
                newState);
          } else {
            // Instance has incident - was it newly created with incident?
            if (oldState == null && !hadIncident) {
              // New instance created directly with incident
              // State transition recorded by incident change handler (no-op for ExecutionState)
              log.debug(
                  "Instance {} created with incident (state: {}), not counted in ExecutionState",
                  instanceUpdateRecord.getProcessInstanceId(),
                  newState);
            } else if (hadIncident) {
              // Instance already had incident and state changed
              // Don't adjust counts - still in INCIDENT
              log.debug(
                  "Instance {} state changed while in incident: {} -> {} (still counted as INCIDENT)",
                  instanceUpdateRecord.getProcessInstanceId(),
                  oldState,
                  newState);
            }
          }
        }

        // Broadcast process instance state change (delta) for table row updates
        Long endTimeMillis =
            updated.getEndTime() != null ? updated.getEndTime().toEpochMilli() : null;
        broadcaster.recordInstanceDeltaChange(
            instanceUpdateRecord.getProcessInstanceId(), key, newState, endTimeMillis);
      }
    }

    if (instanceUpdateRecord.getUpdate()
        instanceof FlowNodeInstanceUpdateDTO flowNodeInstanceUpdateDTO) {

      // Get process definition key to look up element metadata
      ProcessDefinitionKey processDefinitionKey =
          ingestionStore.getProcessInstanceDefinitionKey(
              instanceUpdateRecord.getProcessInstanceId());

      // Get flow node instance path for unique identification (used as map key)
      String flowNodeInstancePath =
          flowNodeInstanceUpdateDTO.getFlowNodeInstancePath() != null
              ? flowNodeInstanceUpdateDTO.getFlowNodeInstancePath().toString()
              : String.valueOf(
                  flowNodeInstanceUpdateDTO.getFlowNodeInstance().getElementInstanceId());

      // Enrich with element name and type from process definition
      String elementId = flowNodeInstanceUpdateDTO.getFlowNodeInstance().getElementId();
      String elementName = null;
      String elementType = null;

      if (processDefinitionKey != null) {
        elementName = processDefinitionCache.getElementName(processDefinitionKey, elementId);
        elementType = processDefinitionCache.getElementType(processDefinitionKey, elementId);
      }

      TimedFlowNodeInstance existingInstance =
          ingestionStore.getFlowNodeInstance(
              instanceUpdateRecord.getProcessInstanceId(), flowNodeInstancePath);

      List<TimedFlowNodeUpdate> updateHistory = new ArrayList<>();
      if (existingInstance != null && existingInstance.updateHistory() != null) {
        updateHistory.addAll(existingInstance.updateHistory());
      }
      updateHistory.add(
          new TimedFlowNodeUpdate(instanceUpdateRecord.getTimestamp(), flowNodeInstanceUpdateDTO));

      // Merge variables from existing instance with new update
      Map<String, JsonNode> mergedVariables = new java.util.HashMap<>();

      // Start with existing merged variables if present
      if (existingInstance != null && existingInstance.mergedVariables() != null) {
        mergedVariables.putAll(existingInstance.mergedVariables());
      }

      // Add variables from new update (will override if same key exists)
      if (flowNodeInstanceUpdateDTO.getVariables() != null
          && flowNodeInstanceUpdateDTO.getVariables().getVariables() != null) {
        Map<String, JsonNode> newVars = flowNodeInstanceUpdateDTO.getVariables().getVariables();
        mergedVariables.putAll(newVars);

        if (existingInstance != null) {
          log.debug(
              "Merging variables for PI {} path {}: previous={} new={} merged={}",
              instanceUpdateRecord.getProcessInstanceId(),
              flowNodeInstancePath,
              existingInstance.mergedVariables() != null
                  ? existingInstance.mergedVariables().size()
                  : 0,
              newVars.size(),
              mergedVariables.size());
        }
      }

      // Store flow node instance update with enriched metadata and merged variables
      TimedFlowNodeInstance timedInstance =
          new TimedFlowNodeInstance(
              instanceUpdateRecord.getTimestamp(),
              flowNodeInstanceUpdateDTO,
              elementId,
              elementName,
              elementType,
              mergedVariables.isEmpty() ? null : mergedVariables,
              List.copyOf(updateHistory));

      ingestionStore.saveFlowNodeInstance(
          instanceUpdateRecord.getProcessInstanceId(), flowNodeInstancePath, timedInstance);

      log.debug(
          "Stored flow node instance update for PI {} path {} elementName={} elementType={} {}",
          instanceUpdateRecord.getProcessInstanceId(),
          flowNodeInstancePath,
          elementName,
          elementType,
          objectMapper.writeValueAsString(flowNodeInstanceUpdateDTO));

      FlowNodeEventMessage event =
          new FlowNodeEventMessage(
              "flownode-event",
              instanceUpdateRecord.getProcessInstanceId().toString(),
              flowNodeInstanceUpdateDTO.getFlowNodeInstance().getElementId(),
              flowNodeInstanceUpdateDTO.getFlowNodeInstance().getState(),
              System.currentTimeMillis(),
              // sequenceFlowIds (if DTO provides them) - guarded reflection-free access
              flowNodeInstanceUpdateDTO.getOutputSequenceFlowIds() == null
                  ? null
                  : flowNodeInstanceUpdateDTO.getOutputSequenceFlowIds(),
              flowNodeInstancePath);

      if (processDefinitionKey != null) {
        broadcaster.queueEvent(processDefinitionKey, event);
        // Also ensure we have a view entry even if PI update hasn't arrived yet
        ProcessInstanceView existingView =
            ingestionStore.getProcessInstanceById(instanceUpdateRecord.getProcessInstanceId());
        if (existingView == null) {
          ingestionStore.saveProcessInstanceView(
              ProcessInstanceView.createNew(
                  instanceUpdateRecord.getProcessInstanceId(),
                  processDefinitionKey,
                  ExecutionState.ACTIVE,
                  flowNodeInstanceUpdateDTO.getProcessTime(),
                  null));
        }
      } else {
        log.warn(
            "No process definition key found for instance {}, cannot broadcast event",
            instanceUpdateRecord.getProcessInstanceId());
      }
    }
  }
}
