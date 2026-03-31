package io.taktx.console.ingester.inmemory;

import io.taktx.dto.ExecutionState;
import io.taktx.dto.IncidentInfoDTO;
import io.taktx.dto.ProcessDefinitionKey;
import java.time.Instant;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ProcessInstanceView {
  private UUID processInstanceId;
  private String processDefinitionId;
  private int version;
  private Instant startTime;
  private Instant endTime; // may be null when running
  private ExecutionState state; // Uses ExecutionState enum for type safety
  private IncidentInfoDTO incidentInfo;
  private UUID parentProcessInstanceId; // For call activities - parent process instance

  public static ProcessInstanceView createNew(
      UUID id,
      ProcessDefinitionKey key,
      ExecutionState state,
      Long processInstanceStartTime,
      Long processInstanceEndTime) {
    ProcessInstanceViewBuilder pivBuilder =
        ProcessInstanceView.builder()
            .processInstanceId(id)
            .processDefinitionId(key.getProcessDefinitionId())
            .version(key.getVersion())
            .state(state);
    if (processInstanceStartTime != null) {
      pivBuilder.startTime(Instant.ofEpochMilli(processInstanceStartTime));
    }
    if (processInstanceEndTime != null) {
      pivBuilder.endTime(Instant.ofEpochMilli(processInstanceEndTime));
    }
    return pivBuilder.build();
  }
}
