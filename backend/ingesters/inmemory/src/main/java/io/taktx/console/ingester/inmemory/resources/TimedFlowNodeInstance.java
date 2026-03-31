package io.taktx.console.ingester.inmemory.resources;

import com.fasterxml.jackson.databind.JsonNode;
import io.taktx.dto.FlowNodeInstanceUpdateDTO;
import java.util.List;
import java.util.Map;

public record TimedFlowNodeInstance(
    long timestamp,
    FlowNodeInstanceUpdateDTO flowNodeInstanceUpdate,
    String elementId,
    String elementName,
    String elementType,
    Map<String, JsonNode> mergedVariables,
    List<TimedFlowNodeUpdate> updateHistory) {
  /** Constructor for backward compatibility - creates instance without element metadata */
  public TimedFlowNodeInstance(
      long timestamp, FlowNodeInstanceUpdateDTO flowNodeInstanceUpdateDTO) {
    this(timestamp, flowNodeInstanceUpdateDTO, null, null, null, null, null);
  }

  /** Constructor without merged variables */
  public TimedFlowNodeInstance(
      long timestamp,
      FlowNodeInstanceUpdateDTO flowNodeInstanceUpdate,
      String elementId,
      String elementName,
      String elementType) {
    this(timestamp, flowNodeInstanceUpdate, elementId, elementName, elementType, null, null);
  }

  public record TimedFlowNodeUpdate(
      long timestamp, FlowNodeInstanceUpdateDTO flowNodeInstanceUpdate) {}
}
