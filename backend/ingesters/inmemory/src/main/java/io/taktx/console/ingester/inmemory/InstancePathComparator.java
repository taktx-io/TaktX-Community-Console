package io.taktx.console.ingester.inmemory;

import io.taktx.console.ingester.inmemory.resources.TimedFlowNodeInstance;
import jakarta.enterprise.context.ApplicationScoped;
import java.util.Comparator;

@ApplicationScoped
public class InstancePathComparator implements Comparator<TimedFlowNodeInstance> {

  @Override
  public int compare(TimedFlowNodeInstance o1, TimedFlowNodeInstance o2) {
    var path1 = o1.flowNodeInstanceUpdate().getFlowNodeInstancePath();
    var path2 = o2.flowNodeInstanceUpdate().getFlowNodeInstancePath();

    int minLength = Math.min(path1.size(), path2.size());
    for (int i = 0; i < minLength; i++) {
      int cmp = Long.compare(path1.get(i), path2.get(i));
      if (cmp != 0) {
        return cmp;
      }
    }
    int compare = Integer.compare(path1.size(), path2.size());
    if (compare == 0) {
      // If paths are identical, compare by timestamp to ensure consistent ordering
      compare = Long.compare(o1.timestamp(), o2.timestamp());
    }
    return compare;
  }
}
