package io.taktx.console.ingester.inmemory.websocket;

import java.util.List;
import java.util.Map;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ProcessInstanceHeatmapMessage {
  private String type = "process-instance-heatmap";
  private String processInstanceId;
  // Map flowNodeId -> passCount (only entries > 0)
  private Map<String, Integer> activityPassCounts;
  // List of sequence flow ids to highlight (no counts)
  private List<String> sequenceFlowIds;
  private long timestamp;
}
