/*
 * TaktX - A high-performance BPMN engine
 * Copyright (c) 2025 Eric Hendriks All rights reserved.
 */

package io.taktx.console.ingester.inmemory;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.taktx.console.ingester.inmemory.resources.ExecutionStateQueryParam;
import io.taktx.console.ingester.inmemory.resources.OrderByType;
import io.taktx.console.ingester.inmemory.resources.ProcessInstanceFilterCriteria;
import io.taktx.console.ingester.inmemory.resources.TimedFlowNodeInstance;
import io.taktx.console.ingester.inmemory.resources.TimedFlowNodeInstance.TimedFlowNodeUpdate;
import io.taktx.dto.ExecutionState;
import io.taktx.dto.FlowNodeInstanceDTO;
import io.taktx.dto.FlowNodeInstanceUpdateDTO;
import io.taktx.dto.ProcessDefinitionKey;
import io.taktx.dto.ProcessInstanceUpdateDTO;
import io.taktx.dto.ScopeDTO;
import io.taktx.dto.VariablesDTO;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class InMemoryIngestionStoreTest {

  private final ObjectMapper objectMapper = new ObjectMapper();

  private InMemoryIngestionStore store;

  @BeforeEach
  void setUp() {
    store = new InMemoryIngestionStore();
  }

  @Test
  void shouldQueryProcessInstancesUsingCurrentFilterSemantics() {
    UUID activeId = UUID.randomUUID();
    UUID completedId = UUID.randomUUID();

    store.saveProcessInstanceView(
        ProcessInstanceView.builder()
            .processInstanceId(activeId)
            .processDefinitionId("orders")
            .version(1)
            .state(ExecutionState.ACTIVE)
            .startTime(Instant.parse("2026-04-01T10:00:00Z"))
            .build());
    store.saveProcessInstanceView(
        ProcessInstanceView.builder()
            .processInstanceId(completedId)
            .processDefinitionId("orders")
            .version(1)
            .state(ExecutionState.COMPLETED)
            .startTime(Instant.parse("2026-04-01T09:00:00Z"))
            .endTime(Instant.parse("2026-04-01T09:30:00Z"))
            .build());

    ProcessInstanceFilterCriteria criteria = new ProcessInstanceFilterCriteria();
    criteria.setProcessDefinitionId("orders");
    criteria.setStates(List.of(ExecutionStateQueryParam.fromString("ACTIVE")));

    ProcessInstancePage page =
        store.queryProcessInstances(
            criteria, 0, 10, OrderByType.PROCESS_INSTAMCE_START, OrderDirection.DESC);

    assertEquals(1, page.getTotal());
    assertEquals(activeId, page.getItems().getFirst().getProcessInstanceId());
  }

  @Test
  void shouldReturnFlowNodeInstancesNewestFirst() {
    UUID processInstanceId = UUID.randomUUID();

    store.saveFlowNodeInstance(
        processInstanceId,
        "task-1",
        new TimedFlowNodeInstance(100L, null, "task-1", "Task 1", "Task", null, List.of()));
    store.saveFlowNodeInstance(
        processInstanceId,
        "task-2",
        new TimedFlowNodeInstance(200L, null, "task-2", "Task 2", "Task", null, List.of()));

    List<TimedFlowNodeInstance> flowNodes =
        store.getFlowNodeInstancesByProcessInstance(processInstanceId);

    assertEquals(2, flowNodes.size());
    assertEquals("task-2", flowNodes.getFirst().elementId());
    assertEquals("task-1", flowNodes.getLast().elementId());
  }

  @Test
  void shouldExposeStoredProcessVariables() {
    UUID processInstanceId = UUID.randomUUID();
    ProcessDefinitionKey key = new ProcessDefinitionKey("orders", 1);

    ScopeDTO scope = new ScopeDTO();
    scope.setState(ExecutionState.ACTIVE);
    ProcessInstanceUpdateDTO update =
        new ProcessInstanceUpdateDTO(
            null,
            null,
            key,
            null,
            scope,
            VariablesDTO.ofJsonMap(Map.of("customerId", objectMapper.valueToTree("12345"))),
            null,
            null);

    store.putProcessInstanceDefinitionKey(processInstanceId, key);
    store.putProcessInstanceUpdate(processInstanceId, update);

    Map<String, ?> variables = store.getProcessVariables(processInstanceId);

    assertTrue(variables.containsKey("customerId"));
    assertEquals(key, store.getProcessInstanceDefinitionKey(processInstanceId));
    assertTrue(store.getRetentionStats().totalEstimatedRetainedBytes() > 0L);
  }

  @Test
  void shouldEvictOldestTerminalInstancesAndReportRetentionStats() {
    UUID olderInstanceId = UUID.randomUUID();
    UUID newerInstanceId = UUID.randomUUID();

    store.saveProcessInstanceView(
        ProcessInstanceView.builder()
            .processInstanceId(olderInstanceId)
            .processDefinitionId("orders")
            .version(1)
            .state(ExecutionState.COMPLETED)
            .endTime(Instant.ofEpochMilli(1_000L))
            .build());
    store.saveProcessInstanceView(
        ProcessInstanceView.builder()
            .processInstanceId(newerInstanceId)
            .processDefinitionId("orders")
            .version(1)
            .state(ExecutionState.COMPLETED)
            .endTime(Instant.ofEpochMilli(2_000L))
            .build());

    store.saveFlowNodeInstance(
        olderInstanceId,
        "task-1",
        new TimedFlowNodeInstance(
            1_000L,
            flowNodeUpdate("task-1", ExecutionState.COMPLETED),
            "task-1",
            "Task 1",
            "Task",
            null,
            List.of(
                new TimedFlowNodeUpdate(900L, flowNodeUpdate("task-1", ExecutionState.ACTIVE)),
                new TimedFlowNodeUpdate(
                    1_000L, flowNodeUpdate("task-1", ExecutionState.COMPLETED)))));

    RetentionStats beforeEviction = store.getRetentionStats();
    List<EvictedProcessInstance> evictedInstances =
        store.evictOldestTerminalInstances(1, 0L, 10_000L);

    assertEquals(2, beforeEviction.totalProcessInstances());
    assertEquals(2, beforeEviction.terminalProcessInstances());
    assertEquals(2L, beforeEviction.totalFlowNodeUpdates());
    assertTrue(beforeEviction.totalEstimatedRetainedBytes() > 0L);
    assertEquals(1, evictedInstances.size());
    assertEquals(olderInstanceId, evictedInstances.getFirst().processInstanceId());
    assertTrue(store.getProcessInstanceById(olderInstanceId) == null);
    assertEquals(1, store.getRetentionStats().totalProcessInstances());
    assertTrue(
        store.getRetentionStats().totalEstimatedRetainedBytes()
            < beforeEviction.totalEstimatedRetainedBytes());
  }

  @Test
  void shouldIncreaseEstimatedRetainedBytesWhenFlowNodeHistoryGrows() {
    UUID processInstanceId = UUID.randomUUID();

    store.saveFlowNodeInstance(
        processInstanceId,
        "task-1",
        new TimedFlowNodeInstance(
            100L,
            flowNodeUpdate("task-1", ExecutionState.ACTIVE),
            "task-1",
            "Task 1",
            "Task",
            null,
            List.of(
                new TimedFlowNodeUpdate(100L, flowNodeUpdate("task-1", ExecutionState.ACTIVE)))));
    long initialEstimatedBytes = store.getRetentionStats().totalEstimatedRetainedBytes();

    store.saveFlowNodeInstance(
        processInstanceId,
        "task-1",
        new TimedFlowNodeInstance(
            200L,
            flowNodeUpdate("task-1", ExecutionState.COMPLETED),
            "task-1",
            "Task 1",
            "Task",
            Map.of("status", objectMapper.valueToTree("done")),
            List.of(
                new TimedFlowNodeUpdate(100L, flowNodeUpdate("task-1", ExecutionState.ACTIVE)),
                new TimedFlowNodeUpdate(
                    200L, flowNodeUpdate("task-1", ExecutionState.COMPLETED)))));

    assertTrue(store.getRetentionStats().totalEstimatedRetainedBytes() > initialEstimatedBytes);
  }

  private FlowNodeInstanceUpdateDTO flowNodeUpdate(String elementId, ExecutionState state) {
    FlowNodeInstanceDTO flowNodeInstance = new FlowNodeInstanceDTO() {};
    flowNodeInstance.setElementId(elementId);
    flowNodeInstance.setState(state);
    return new FlowNodeInstanceUpdateDTO(null, flowNodeInstance, null, 0L, null, null);
  }
}
