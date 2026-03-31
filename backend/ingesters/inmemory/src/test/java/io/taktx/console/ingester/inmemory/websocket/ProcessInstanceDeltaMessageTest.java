package io.taktx.console.ingester.inmemory.websocket;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.taktx.dto.ExecutionState;
import org.junit.jupiter.api.Test;

/**
 * Test that ProcessInstanceDeltaMessage serializes ExecutionState enum values as their full name
 * (e.g., "COMPLETED") instead of their short code (e.g., "C").
 */
class ProcessInstanceDeltaMessageTest {

  private final ObjectMapper objectMapper = new ObjectMapper();

  @Test
  void testSerializesExecutionStateAsFullName() throws Exception {
    // Test COMPLETED state
    ProcessInstanceDeltaMessage completedMsg =
        new ProcessInstanceDeltaMessage(
            "process-instance-delta",
            "test-instance-id",
            "test-process",
            1,
            ExecutionState.COMPLETED,
            System.currentTimeMillis());

    String json = objectMapper.writeValueAsString(completedMsg);
    System.out.println("Serialized COMPLETED: " + json);

    // Assert that the JSON contains "COMPLETED" not "C"
    assertTrue(
        json.contains("\"state\":\"COMPLETED\""),
        "Expected state to be serialized as 'COMPLETED', but got: " + json);
    assertFalse(
        json.contains("\"state\":\"C\""), "State should not be serialized as short code 'C'");
    assertTrue(
        json.contains("\"processDefinitionId\":\"test-process\""),
        "Expected processDefinitionId to be present");
    assertTrue(json.contains("\"version\":1"), "Expected version to be present");

    // Test ACTIVE state
    ProcessInstanceDeltaMessage activeMsg =
        new ProcessInstanceDeltaMessage(
            "process-instance-delta",
            "test-instance-id-2",
            "order-process",
            2,
            ExecutionState.ACTIVE,
            null);

    json = objectMapper.writeValueAsString(activeMsg);
    System.out.println("Serialized ACTIVE: " + json);

    assertTrue(
        json.contains("\"state\":\"ACTIVE\""),
        "Expected state to be serialized as 'ACTIVE', but got: " + json);

    // Test ABORTED state
    ProcessInstanceDeltaMessage abortedMsg =
        new ProcessInstanceDeltaMessage(
            "process-instance-delta",
            "test-instance-id-3",
            "service-task",
            3,
            ExecutionState.ABORTED,
            System.currentTimeMillis());

    json = objectMapper.writeValueAsString(abortedMsg);
    System.out.println("Serialized ABORTED: " + json);

    assertTrue(
        json.contains("\"state\":\"ABORTED\""),
        "Expected state to be serialized as 'ABORTED', but got: " + json);
  }
}
