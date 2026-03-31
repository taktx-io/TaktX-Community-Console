package io.taktx.console.ingester.inmemory;

import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ProcessInstancePage {
  private List<ProcessInstanceView> items;
  private int total; // total number of items for the definition/version
}
