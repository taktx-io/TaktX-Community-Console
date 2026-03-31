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
import io.taktx.console.ingester.inmemory.resources.OrderByType;
import io.taktx.console.ingester.inmemory.resources.ProcessInstanceFilterCriteria;
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
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@ApplicationScoped
@RequiredArgsConstructor
public class InstanceUpdateRegistry {

  private final Map<UUID, ProcessDefinitionKey> processInstanceToDefinitionKey =
      new ConcurrentHashMap<>();

  private final Map<UUID, ProcessInstanceView> instanceViews = new ConcurrentHashMap<>();

  // Changed from SortedSet to Map for deduplication - stores only latest state per flow node
  // instance
  // Key: ProcessInstanceId -> FlowNodeInstancePath -> Latest TimedFlowNodeInstance
  private final Map<UUID, Map<String, TimedFlowNodeInstance>> flowNodeInstancesByProcessInstance =
      new ConcurrentHashMap<>();

  private final Map<UUID, ProcessInstanceUpdateDTO> processInstanceUpdates =
      new ConcurrentHashMap<>();

  private final FlowNodeEventBroadcaster broadcaster;
  private final ObjectMapper objectMapper;
  private final ProcessDefinitionCache processDefinitionCache;

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
      processInstanceToDefinitionKey.put(
          instanceUpdateRecord.getProcessInstanceId(),
          processInstanceUpdateDTO.getProcessDefinitionKey());

      // Store the full DTO for detailed view
      processInstanceUpdates.put(
          instanceUpdateRecord.getProcessInstanceId(), processInstanceUpdateDTO);

      log.debug(
          "Registered process instance {} for definition {}",
          instanceUpdateRecord.getProcessInstanceId(),
          processInstanceUpdateDTO.getProcessDefinitionKey());

      // Phase 1: create or update a lightweight view entry
      ProcessDefinitionKey key = processInstanceUpdateDTO.getProcessDefinitionKey();

      // Capture old state before update for state transition tracking
      ProcessInstanceView existing = instanceViews.get(instanceUpdateRecord.getProcessInstanceId());
      ExecutionState oldState = existing != null ? existing.getState() : null;
      boolean hadIncident = existing != null && existing.getIncidentInfo() != null;

      ProcessInstanceView updated =
          instanceViews.compute(
              instanceUpdateRecord.getProcessInstanceId(),
              (id, view) -> {
                if (view == null) {
                  view =
                      ProcessInstanceView.createNew(
                          id,
                          key,
                          processInstanceUpdateDTO.getScope().getState(),
                          processInstanceUpdateDTO.getProcessStartTime(),
                          processInstanceUpdateDTO.getProcessEndTime());
                  // Set parent process instance ID if available
                  if (processInstanceUpdateDTO.getParentProcessInstanceId() != null) {
                    view.setParentProcessInstanceId(
                        processInstanceUpdateDTO.getParentProcessInstanceId());
                  }
                }
                if (processInstanceUpdateDTO.getScope() != null
                    && processInstanceUpdateDTO.getScope().getState() != null) {
                  ExecutionState state = processInstanceUpdateDTO.getScope().getState();
                  view.setState(state);
                  // Store incident info if present
                  if (processInstanceUpdateDTO.getIncidentInfoDTO() != null) {
                    view.setIncidentInfo(processInstanceUpdateDTO.getIncidentInfoDTO());
                  }
                  if (processInstanceUpdateDTO.getProcessEndTime() != null) {
                    view.setEndTime(
                        Instant.ofEpochMilli(processInstanceUpdateDTO.getProcessEndTime()));
                  }
                }
                return view;
              });

      // Record state changes
      if (updated != null) {
        ExecutionState newState = updated.getState();
        boolean hasIncident = updated.getIncidentInfo() != null;

        // Record incident state change FIRST (if changed)
        if (hadIncident != hasIncident) {
          broadcaster.recordIncidentChange(key, newState, hadIncident, hasIncident);
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
            broadcaster.recordInstanceStateChange(key, oldState, newState);
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
          processInstanceToDefinitionKey.get(instanceUpdateRecord.getProcessInstanceId());

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

      // Retrieve existing instance to merge variables
      Map<String, TimedFlowNodeInstance> instanceMap =
          flowNodeInstancesByProcessInstance.computeIfAbsent(
              instanceUpdateRecord.getProcessInstanceId(), k -> new ConcurrentHashMap<>());

      TimedFlowNodeInstance existingInstance = instanceMap.get(flowNodeInstancePath);

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

      instanceMap.put(flowNodeInstancePath, timedInstance);

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
        ProcessInstanceUpdateDTO processInstanceUpdate = new ProcessInstanceUpdateDTO();
        instanceViews.computeIfAbsent(
            instanceUpdateRecord.getProcessInstanceId(),
            id ->
                ProcessInstanceView.createNew(
                    id,
                    processDefinitionKey,
                    ExecutionState.ACTIVE,
                    flowNodeInstanceUpdateDTO.getProcessTime(),
                    null));
      } else {
        log.warn(
            "No process definition key found for instance {}, cannot broadcast event",
            instanceUpdateRecord.getProcessInstanceId());
      }
    }
  }

  /**
   * Generic query method that supports flexible filtering. Handles current and future filter
   * criteria in a single method.
   */
  public ProcessInstancePage queryProcessInstances(
      ProcessInstanceFilterCriteria criteria,
      int start,
      int limit,
      OrderByType orderBy,
      OrderDirection orderDirection) {

    // Start with all instances
    List<ProcessInstanceView> filtered = new ArrayList<>(instanceViews.values());

    // Apply filters if criteria is provided
    if (criteria != null) {
      filtered =
          filtered.stream()
              .filter(v -> matchesFilterCriteria(v, criteria))
              .collect(Collectors.toCollection(ArrayList::new));
    }

    return sortAndPaginate(filtered, start, limit, orderBy, orderDirection);
  }

  /**
   * Check if a process instance matches the filter criteria. Extensible design - add new filter
   * types here.
   */
  private boolean matchesFilterCriteria(
      ProcessInstanceView view, ProcessInstanceFilterCriteria criteria) {
    // Filter by specific instance IDs - takes precedence over all other filters
    if (criteria.getProcessInstanceIds() != null && !criteria.getProcessInstanceIds().isEmpty()) {
      return criteria.getProcessInstanceIds().contains(view.getProcessInstanceId());
    }

    // Filter by process definition ID
    if (criteria.getProcessDefinitionId() != null) {
      if (!criteria.getProcessDefinitionId().equals(view.getProcessDefinitionId())) {
        return false;
      }
    }

    // Filter by version
    if (criteria.getVersion() != null) {
      if (criteria.getVersion() != view.getVersion()) {
        return false;
      }
    }

    // Filter by state(s) - supports both ExecutionState and INCIDENT pseudo-state
    // IMPORTANT: Instances with incidents are ONLY counted as INCIDENT, not their ExecutionState
    if (criteria.getStates() != null && !criteria.getStates().isEmpty()) {
      ExecutionState viewState = view.getState();
      boolean hasIncident = view.getIncidentInfo() != null;
      boolean matchesAnyState = false;

      for (var stateParam : criteria.getStates()) {
        if (stateParam.isIncidentFilter()) {
          // INCIDENT pseudo-state: match if instance has incident info
          if (hasIncident) {
            matchesAnyState = true;
            break;
          }
        } else if (stateParam.isExecutionState()) {
          // Regular ExecutionState: match by actual state
          // BUT: if instance has incident, it should NOT match ExecutionState filters
          if (!hasIncident && stateParam.getExecutionState().equals(viewState)) {
            matchesAnyState = true;
            break;
          }
        }
      }

      if (!matchesAnyState) {
        return false;
      }
    }

    // Filter by business key
    if (criteria.getBusinessKey() != null) {
      // Note: BusinessKey not yet stored in ProcessInstanceView
      // This is a placeholder for future implementation
      // if (!criteria.getBusinessKey().equals(view.getBusinessKey())) {
      //   return false;
      // }
    }

    // Filter by incident presence
    if (criteria.getHasIncident() != null) {
      // Note: Incident info not yet in ProcessInstanceView
      // This is a placeholder for future implementation
      // boolean hasIncident = view.getIncidentInfo() != null;
      // if (criteria.getHasIncident() != hasIncident) {
      //   return false;
      // }
    }

    // Filter by start time range
    // Note: Instances with null startTime are excluded from time range filters
    if (criteria.getStartTimeFrom() != null || criteria.getStartTimeTo() != null) {
      Instant startTime = view.getStartTime();

      // Exclude instances with null startTime
      if (startTime == null) {
        return false;
      }

      // Check startTimeFrom (inclusive)
      if (criteria.getStartTimeFrom() != null) {
        if (startTime.isBefore(criteria.getStartTimeFrom())) {
          return false;
        }
      }

      // Check startTimeTo (exclusive)
      if (criteria.getStartTimeTo() != null) {
        if (!startTime.isBefore(criteria.getStartTimeTo())) {
          return false;
        }
      }
    }

    // Filter by end time range
    // Note: Instances with null endTime are excluded from end time range filters
    if (criteria.getEndTimeFrom() != null || criteria.getEndTimeTo() != null) {
      Instant endTime = view.getEndTime();

      // Exclude instances with null endTime
      if (endTime == null) {
        return false;
      }

      // Check endTimeFrom (inclusive)
      if (criteria.getEndTimeFrom() != null) {
        if (endTime.isBefore(criteria.getEndTimeFrom())) {
          return false;
        }
      }

      // Check endTimeTo (exclusive)
      if (criteria.getEndTimeTo() != null) {
        if (!endTime.isBefore(criteria.getEndTimeTo())) {
          return false;
        }
      }
    }

    // Future filters can be added here following the same pattern

    return true;
  }

  /** Common sorting and pagination logic. */
  private ProcessInstancePage sortAndPaginate(
      List<ProcessInstanceView> instances,
      int start,
      int limit,
      OrderByType orderBy,
      OrderDirection orderDirection) {

    int total = instances.size();

    // Sort
    Comparator<ProcessInstanceView> comparator;
    switch (orderBy) {
      case PROCESS_INSTANCE_COMPLETE:
        comparator = Comparator.comparing(v -> safeInstant(v.getEndTime()));
        break;
      case PROCESS_INSTANCE_STATE:
        comparator = Comparator.comparing(v -> v.getState() == null ? "" : v.getState().name());
        break;
      case PROCESS_INSTAMCE_START:
      default:
        comparator = Comparator.comparing(v -> safeInstant(v.getStartTime()));
    }
    if (orderDirection == OrderDirection.DESC) {
      comparator = comparator.reversed();
    }
    instances.sort(comparator);

    // Pagination safety
    int from = Math.max(0, start);
    int to = Math.min(instances.size(), from + Math.max(0, limit));
    List<ProcessInstanceView> pageItems = List.of();
    if (from < to) {
      pageItems = instances.subList(from, to);
    }
    return new ProcessInstancePage(pageItems, total);
  }

  public ProcessInstanceView getProcessInstanceById(UUID processInstanceId) {
    return instanceViews.get(processInstanceId);
  }

  public List<TimedFlowNodeInstance> getFlowNodeInstancesByProcessInstance(UUID processInstanceId) {
    Map<String, TimedFlowNodeInstance> flowNodeMap =
        flowNodeInstancesByProcessInstance.getOrDefault(processInstanceId, Collections.emptyMap());

    // Return all flow node instances sorted by timestamp descending (newest first)
    return flowNodeMap.values().stream()
        .sorted(Comparator.comparing(TimedFlowNodeInstance::timestamp).reversed())
        .collect(Collectors.toList());
  }

  public int getFlowNodeInstanceCountByProcessInstance(UUID processInstanceId) {
    return flowNodeInstancesByProcessInstance
        .getOrDefault(processInstanceId, Collections.emptyMap())
        .size();
  }

  public Map<String, JsonNode> getProcessVariables(UUID processInstanceId) {
    ProcessInstanceUpdateDTO pi = processInstanceUpdates.get(processInstanceId);
    if (pi == null || pi.getVariables() == null) {
      return Map.of();
    }
    return pi.getVariables().getVariables();
  }

  private Instant safeInstant(Instant t) {
    return t == null ? Instant.EPOCH : t;
  }
}
