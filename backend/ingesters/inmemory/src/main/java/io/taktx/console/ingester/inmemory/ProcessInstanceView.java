package io.taktx.console.ingester.inmemory;

import io.taktx.dto.ExecutionState;
import io.taktx.dto.IncidentInfoDTO;
import io.taktx.dto.ProcessDefinitionKey;
import java.time.Instant;
import java.util.Set;
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

  /** Immutable after process start. Null if not provided by the engine. */
  private String businessKey;

  /** Immutable after process start. Null/empty if not provided by the engine. */
  private Set<String> tags;

  public static ProcessInstanceView createNew(
      UUID id,
      ProcessDefinitionKey key,
      ExecutionState state,
      Long processInstanceStartTime,
      Long processInstanceEndTime,
      String businessKey,
      Set<String> tags) {
    ProcessInstanceViewBuilder pivBuilder =
        ProcessInstanceView.builder()
            .processInstanceId(id)
            .processDefinitionId(key.getProcessDefinitionId())
            .version(key.getVersion())
            .state(state)
            .businessKey(businessKey)
            .tags(tags);
    if (processInstanceStartTime != null) {
      pivBuilder.startTime(Instant.ofEpochMilli(processInstanceStartTime));
    }
    if (processInstanceEndTime != null) {
      pivBuilder.endTime(Instant.ofEpochMilli(processInstanceEndTime));
    }
    return pivBuilder.build();
  }

  /**
   * Backward-compatible factory used when businessKey/tags are not yet known (flow node events that
   * arrive before the process-start update).
   */
  public static ProcessInstanceView createNew(
      UUID id,
      ProcessDefinitionKey key,
      ExecutionState state,
      Long processInstanceStartTime,
      Long processInstanceEndTime) {
    return createNew(id, key, state, processInstanceStartTime, processInstanceEndTime, null, null);
  }
}
