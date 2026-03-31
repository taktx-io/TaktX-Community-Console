/**
 * Process Instance Heatmap Data Source
 *
 * Converts process instance state updates to animation triggers
 * for the single-instance heatmap layer.
 * Accepts pre-fetched data from the single page-level useBpmnHeatmap instance.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import type { AggregatedTrigger, ProcessInstanceState, ProcessInstanceHeatmap } from './useBpmnHeatmap';
import type { HeatmapDataSource } from '@/lib/types/overlay-layers';

/**
 * Hook that provides animation triggers for a single process instance.
 * Accepts instanceState and processInstanceHeatmap produced by the single
 * page-level useBpmnHeatmap call — no separate WebSocket connection is opened.
 */
export function useProcessInstanceHeatmapDataSource(
  processInstanceId: string | null,
  instanceState: ProcessInstanceState | null,
  processInstanceHeatmap: ProcessInstanceHeatmap | null
): HeatmapDataSource {
  const [triggers, setTriggers] = useState<AggregatedTrigger[]>([]);
  const subscribersRef = useRef<Set<(triggers: AggregatedTrigger[]) => void>>(new Set());

  // Track previous state to generate animation triggers on state changes
  const prevStateRef = useRef<Record<string, { active: number; completed: number; aborted: number }>>({});

  // Track previous sequence flows to generate animation triggers
  const prevSequenceFlowsRef = useRef<Set<string>>(new Set());

  // Clear triggers when processInstanceId changes
  useEffect(() => {
    setTriggers([]);
    prevStateRef.current = {};
    prevSequenceFlowsRef.current = new Set();
    subscribersRef.current.forEach(callback => callback([]));
  }, [processInstanceId]);

  // Generate animation triggers from state changes
  useEffect(() => {
    const state = instanceState;
    const heatmap = processInstanceHeatmap;

    if (!state || !state.flowNodeStates) {
      setTriggers([]);
      subscribersRef.current.forEach(callback => callback([]));
      return;
    }

    if (state.processInstanceId !== processInstanceId) {
      return;
    }

    const newTriggers: AggregatedTrigger[] = [];
    const prevState = prevStateRef.current;
    const timestamp = Date.now();

    const isFirstStateLoad = Object.keys(prevState).length === 0;

    if (isFirstStateLoad) {
      prevStateRef.current = { ...state.flowNodeStates };
    } else {
      Object.entries(state.flowNodeStates).forEach(([elementId, counts]: any) => {
        const prev = prevState[elementId] || { active: 0, completed: 0, aborted: 0 };

        if (counts.active > prev.active) {
          const delta = counts.active - prev.active;
          newTriggers.push({ id: `instance-active-${elementId}-${timestamp}`, sequenceFlowIds: [], eventType: 'ACTIVE', intensity: delta, timestamp, elementId, kind: 'activity', activeCount: delta, completedCount: 0, abortedCount: 0 });
        }
        if (counts.completed > prev.completed) {
          const delta = counts.completed - prev.completed;
          newTriggers.push({ id: `instance-completed-${elementId}-${timestamp}`, sequenceFlowIds: [], eventType: 'COMPLETED', intensity: delta, timestamp, elementId, kind: 'activity', activeCount: 0, completedCount: delta, abortedCount: 0 });
        }
        if (counts.aborted > prev.aborted) {
          const delta = counts.aborted - prev.aborted;
          newTriggers.push({ id: `instance-aborted-${elementId}-${timestamp}`, sequenceFlowIds: [], eventType: 'ABORTED', intensity: delta, timestamp, elementId, kind: 'activity', activeCount: 0, completedCount: 0, abortedCount: delta });
        }
      });

      prevStateRef.current = { ...state.flowNodeStates };
    }

    if (heatmap && heatmap.processInstanceId === processInstanceId) {
      const currentSequenceFlows = new Set<string>();
      if (heatmap.sequenceFlowIds && Array.isArray(heatmap.sequenceFlowIds)) {
        heatmap.sequenceFlowIds.forEach(seqId => currentSequenceFlows.add(seqId));
      }
      if (heatmap.sequenceFlowPassCounts) {
        Object.keys(heatmap.sequenceFlowPassCounts).forEach(seqId => currentSequenceFlows.add(seqId));
      }

      const prevSequenceFlows = prevSequenceFlowsRef.current;
      if (prevSequenceFlows.size === 0 && currentSequenceFlows.size > 0) {
        prevSequenceFlowsRef.current = currentSequenceFlows;
      } else {
        currentSequenceFlows.forEach(seqId => {
          if (!prevSequenceFlows.has(seqId)) {
            newTriggers.push({ id: `instance-seqflow-${seqId}-${timestamp}`, sequenceFlowIds: [seqId], eventType: 'COMPLETED', intensity: 1, timestamp, kind: 'flow' });
          }
        });
        prevSequenceFlowsRef.current = currentSequenceFlows;
      }
    }

    if (newTriggers.length > 0) {
      setTriggers(newTriggers);
      subscribersRef.current.forEach(callback => callback(newTriggers));
      setTimeout(() => {
        setTriggers([]);
        subscribersRef.current.forEach(callback => callback([]));
      }, 4000);
    }
  }, [instanceState, processInstanceHeatmap, processInstanceId]);

  return {
    subscribe: (callback: (triggers: AggregatedTrigger[]) => void) => {
      subscribersRef.current.add(callback);
      callback(triggers);
      return () => { subscribersRef.current.delete(callback); };
    },
    getTriggers: () => triggers,
  };
}

