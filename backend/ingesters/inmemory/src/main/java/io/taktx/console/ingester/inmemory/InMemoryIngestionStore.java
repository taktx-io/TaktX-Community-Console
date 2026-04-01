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
import io.taktx.dto.ExecutionState;
import io.taktx.dto.IncidentInfoDTO;
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

@ApplicationScoped
public class InMemoryIngestionStore implements IngestionStore {

  private static final List<ExecutionState> TERMINAL_STATES =
      List.of(ExecutionState.COMPLETED, ExecutionState.ABORTED);

  private final Map<UUID, ProcessDefinitionKey> processInstanceToDefinitionKey =
      new ConcurrentHashMap<>();

  private final Map<UUID, ProcessInstanceView> instanceViews = new ConcurrentHashMap<>();

  // Key: ProcessInstanceId -> FlowNodeInstancePath -> Latest TimedFlowNodeInstance
  private final Map<UUID, Map<String, TimedFlowNodeInstance>> flowNodeInstancesByProcessInstance =
      new ConcurrentHashMap<>();

  private final Map<UUID, ProcessInstanceUpdateDTO> processInstanceUpdates =
      new ConcurrentHashMap<>();

  private final Map<UUID, RetentionMetadata> retentionMetadata = new ConcurrentHashMap<>();
  private final RetainedByteEstimator retainedByteEstimator = new RetainedByteEstimator();

  @Override
  public void clear() {
    processInstanceToDefinitionKey.clear();
    instanceViews.clear();
    flowNodeInstancesByProcessInstance.clear();
    processInstanceUpdates.clear();
    retentionMetadata.clear();
  }

  @Override
  public void putProcessInstanceDefinitionKey(
      UUID processInstanceId, ProcessDefinitionKey definitionKey) {
    processInstanceToDefinitionKey.put(processInstanceId, definitionKey);
    recomputeRetentionMetadata(processInstanceId, System.currentTimeMillis());
  }

  @Override
  public ProcessDefinitionKey getProcessInstanceDefinitionKey(UUID processInstanceId) {
    return processInstanceToDefinitionKey.get(processInstanceId);
  }

  @Override
  public void putProcessInstanceUpdate(UUID processInstanceId, ProcessInstanceUpdateDTO update) {
    processInstanceUpdates.put(processInstanceId, update);
    recomputeRetentionMetadata(processInstanceId, System.currentTimeMillis());
  }

  @Override
  public ProcessInstanceView getProcessInstanceById(UUID processInstanceId) {
    return instanceViews.get(processInstanceId);
  }

  @Override
  public void saveProcessInstanceView(ProcessInstanceView view) {
    instanceViews.put(view.getProcessInstanceId(), view);
    recomputeRetentionMetadata(view.getProcessInstanceId(), System.currentTimeMillis());
  }

  @Override
  public TimedFlowNodeInstance getFlowNodeInstance(
      UUID processInstanceId, String flowNodeInstancePath) {
    return flowNodeInstancesByProcessInstance
        .getOrDefault(processInstanceId, Collections.emptyMap())
        .get(flowNodeInstancePath);
  }

  @Override
  public void saveFlowNodeInstance(
      UUID processInstanceId, String flowNodeInstancePath, TimedFlowNodeInstance flowNodeInstance) {
    flowNodeInstancesByProcessInstance
        .computeIfAbsent(processInstanceId, ignored -> new ConcurrentHashMap<>())
        .put(flowNodeInstancePath, flowNodeInstance);
    recomputeRetentionMetadata(processInstanceId, System.currentTimeMillis());
  }

  @Override
  public ProcessInstancePage queryProcessInstances(
      ProcessInstanceFilterCriteria criteria,
      int start,
      int limit,
      OrderByType orderBy,
      OrderDirection orderDirection) {

    List<ProcessInstanceView> filtered = new ArrayList<>(instanceViews.values());

    if (criteria != null) {
      filtered =
          filtered.stream()
              .filter(view -> matchesFilterCriteria(view, criteria))
              .collect(Collectors.toCollection(ArrayList::new));
    }

    return sortAndPaginate(filtered, start, limit, orderBy, orderDirection);
  }

  private boolean matchesFilterCriteria(
      ProcessInstanceView view, ProcessInstanceFilterCriteria criteria) {
    if (criteria.getProcessInstanceIds() != null && !criteria.getProcessInstanceIds().isEmpty()) {
      return criteria.getProcessInstanceIds().contains(view.getProcessInstanceId());
    }

    if (criteria.getProcessDefinitionId() != null
        && !criteria.getProcessDefinitionId().equals(view.getProcessDefinitionId())) {
      return false;
    }

    if (criteria.getVersion() != null && criteria.getVersion() != view.getVersion()) {
      return false;
    }

    if (criteria.getStates() != null && !criteria.getStates().isEmpty()) {
      ExecutionState viewState = view.getState();
      boolean hasIncident = view.getIncidentInfo() != null;
      boolean matchesAnyState = false;

      for (var stateParam : criteria.getStates()) {
        if (stateParam.isIncidentFilter()) {
          if (hasIncident) {
            matchesAnyState = true;
            break;
          }
        } else if (stateParam.isExecutionState()) {
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

    if (criteria.getStartTimeFrom() != null || criteria.getStartTimeTo() != null) {
      Instant startTime = view.getStartTime();
      if (startTime == null) {
        return false;
      }
      if (criteria.getStartTimeFrom() != null && startTime.isBefore(criteria.getStartTimeFrom())) {
        return false;
      }
      if (criteria.getStartTimeTo() != null && !startTime.isBefore(criteria.getStartTimeTo())) {
        return false;
      }
    }

    if (criteria.getEndTimeFrom() != null || criteria.getEndTimeTo() != null) {
      Instant endTime = view.getEndTime();
      if (endTime == null) {
        return false;
      }
      if (criteria.getEndTimeFrom() != null && endTime.isBefore(criteria.getEndTimeFrom())) {
        return false;
      }
      if (criteria.getEndTimeTo() != null && !endTime.isBefore(criteria.getEndTimeTo())) {
        return false;
      }
    }

    return true;
  }

  private ProcessInstancePage sortAndPaginate(
      List<ProcessInstanceView> instances,
      int start,
      int limit,
      OrderByType orderBy,
      OrderDirection orderDirection) {

    int total = instances.size();

    Comparator<ProcessInstanceView> comparator;
    switch (orderBy) {
      case PROCESS_INSTANCE_COMPLETE:
        comparator = Comparator.comparing(view -> safeInstant(view.getEndTime()));
        break;
      case PROCESS_INSTANCE_STATE:
        comparator =
            Comparator.comparing(view -> view.getState() == null ? "" : view.getState().name());
        break;
      case PROCESS_INSTAMCE_START:
      default:
        comparator = Comparator.comparing(view -> safeInstant(view.getStartTime()));
    }
    if (orderDirection == OrderDirection.DESC) {
      comparator = comparator.reversed();
    }
    instances.sort(comparator);

    int from = Math.max(0, start);
    int to = Math.min(instances.size(), from + Math.max(0, limit));
    List<ProcessInstanceView> pageItems = List.of();
    if (from < to) {
      pageItems = instances.subList(from, to);
    }
    return new ProcessInstancePage(pageItems, total);
  }

  @Override
  public List<TimedFlowNodeInstance> getFlowNodeInstancesByProcessInstance(UUID processInstanceId) {
    Map<String, TimedFlowNodeInstance> flowNodeMap =
        flowNodeInstancesByProcessInstance.getOrDefault(processInstanceId, Collections.emptyMap());

    return flowNodeMap.values().stream()
        .sorted(Comparator.comparing(TimedFlowNodeInstance::timestamp).reversed())
        .collect(Collectors.toList());
  }

  @Override
  public int getFlowNodeInstanceCountByProcessInstance(UUID processInstanceId) {
    return flowNodeInstancesByProcessInstance
        .getOrDefault(processInstanceId, Collections.emptyMap())
        .size();
  }

  @Override
  public Map<String, JsonNode> getProcessVariables(UUID processInstanceId) {
    ProcessInstanceUpdateDTO processInstanceUpdate = processInstanceUpdates.get(processInstanceId);
    if (processInstanceUpdate == null || processInstanceUpdate.getVariables() == null) {
      return Map.of();
    }
    return processInstanceUpdate.getVariables().getVariables();
  }

  @Override
  public RetentionStats getRetentionStats() {
    int terminalInstances = 0;
    long totalFlowNodeUpdates = 0L;
    long totalEstimatedRetainedBytes = 0L;

    for (RetentionMetadata metadata : retentionMetadata.values()) {
      if (metadata.terminalAt() != null) {
        terminalInstances++;
      }
      totalFlowNodeUpdates += metadata.flowNodeUpdateCount();
      totalEstimatedRetainedBytes += metadata.estimatedRetainedBytes();
    }

    return new RetentionStats(
        instanceViews.size(), terminalInstances, totalFlowNodeUpdates, totalEstimatedRetainedBytes);
  }

  @Override
  public List<EvictedProcessInstance> evictOldestTerminalInstances(
      int limit, long minTerminalAgeMillis, long nowMillis) {
    if (limit <= 0) {
      return List.of();
    }

    List<UUID> candidateIds =
        retentionMetadata.entrySet().stream()
            .filter(
                entry ->
                    isEvictionCandidate(
                        entry.getKey(), entry.getValue(), nowMillis, minTerminalAgeMillis))
            .sorted(Comparator.comparingLong(entry -> entry.getValue().terminalAt()))
            .limit(limit)
            .map(Map.Entry::getKey)
            .toList();

    if (candidateIds.isEmpty()) {
      return List.of();
    }

    List<EvictedProcessInstance> evictedInstances = new ArrayList<>(candidateIds.size());
    for (UUID processInstanceId : candidateIds) {
      ProcessInstanceView view = instanceViews.get(processInstanceId);
      if (!isEvictionCandidate(
              processInstanceId,
              retentionMetadata.get(processInstanceId),
              nowMillis,
              minTerminalAgeMillis)
          || view == null) {
        continue;
      }

      Map<String, TimedFlowNodeInstance> removedFlowNodes =
          flowNodeInstancesByProcessInstance.remove(processInstanceId);
      ProcessDefinitionKey definitionKey = processInstanceToDefinitionKey.remove(processInstanceId);
      instanceViews.remove(processInstanceId);
      processInstanceUpdates.remove(processInstanceId);
      retentionMetadata.remove(processInstanceId);

      evictedInstances.add(
          new EvictedProcessInstance(
              processInstanceId,
              definitionKey,
              view,
              removedFlowNodes == null ? List.of() : new ArrayList<>(removedFlowNodes.values())));
    }

    return evictedInstances;
  }

  private Instant safeInstant(Instant timestamp) {
    return timestamp == null ? Instant.EPOCH : timestamp;
  }

  private void recomputeRetentionMetadata(UUID processInstanceId, long touchedAt) {
    ProcessInstanceView processInstanceView = instanceViews.get(processInstanceId);
    ProcessDefinitionKey processDefinitionKey =
        processInstanceToDefinitionKey.get(processInstanceId);
    ProcessInstanceUpdateDTO processInstanceUpdate = processInstanceUpdates.get(processInstanceId);
    Map<String, TimedFlowNodeInstance> flowNodeInstances =
        flowNodeInstancesByProcessInstance.get(processInstanceId);

    int flowNodeUpdateCount = retainedByteEstimator.countRetainedFlowNodeUpdates(flowNodeInstances);
    long estimatedRetainedBytes =
        retainedByteEstimator.estimateProcessDefinitionKey(processDefinitionKey)
            + retainedByteEstimator.estimateProcessInstanceView(processInstanceView)
            + retainedByteEstimator.estimateProcessInstanceUpdate(processInstanceUpdate)
            + retainedByteEstimator.estimateFlowNodeUpdates(flowNodeInstances);

    retentionMetadata.put(
        processInstanceId,
        new RetentionMetadata(
            touchedAt,
            resolveTerminalAt(processInstanceView, touchedAt),
            flowNodeUpdateCount,
            estimatedRetainedBytes));
  }

  private boolean isEvictionCandidate(
      UUID processInstanceId,
      RetentionMetadata metadata,
      long nowMillis,
      long minTerminalAgeMillis) {
    if (metadata == null || metadata.terminalAt() == null) {
      return false;
    }

    ProcessInstanceView view = instanceViews.get(processInstanceId);
    if (!isTerminalWithoutIncident(view)) {
      return false;
    }

    return nowMillis - metadata.terminalAt() >= minTerminalAgeMillis;
  }

  private boolean isTerminalWithoutIncident(ProcessInstanceView view) {
    return view != null && isTerminalState(view.getState()) && !hasIncident(view.getIncidentInfo());
  }

  private boolean isTerminalState(ExecutionState state) {
    return state != null && TERMINAL_STATES.contains(state);
  }

  private boolean hasIncident(IncidentInfoDTO incidentInfo) {
    return incidentInfo != null;
  }

  private static Long resolveTerminalAt(ProcessInstanceView view, long touchedAt) {
    if (view == null || !isTerminalWithoutIncidentStatic(view)) {
      return null;
    }
    return view.getEndTime() != null ? view.getEndTime().toEpochMilli() : touchedAt;
  }

  private static boolean isTerminalWithoutIncidentStatic(ProcessInstanceView view) {
    return view.getState() != null
        && TERMINAL_STATES.contains(view.getState())
        && view.getIncidentInfo() == null;
  }

  private record RetentionMetadata(
      long lastTouchedAt, Long terminalAt, int flowNodeUpdateCount, long estimatedRetainedBytes) {}
}
