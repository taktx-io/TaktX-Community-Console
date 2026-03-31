package io.taktx.console.ingester.inmemory.websocket;

import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import io.taktx.dto.ExecutionState;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ProcessInstanceDeltaMessage {
  private String type = "process-instance-delta";
  private String processInstanceId;
  private String processDefinitionId; // For frontend filtering
  private Integer version; // For frontend filtering

  @JsonSerialize(using = ToStringSerializer.class)
  private ExecutionState
      state; // Serialize as full enum name (e.g., "COMPLETED") instead of code (e.g., "C")

  private Long endTimeMillis; // optional, only set when ended
}
