// Aggregation hook for BPMN heatmap triggers
// - Batches incoming triggers in a short window (default 100ms)
// - Aggregates triggers by sequenceFlowId and computes intensity
// - Exposes a stable array of aggregated triggers for the overlay to consume

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';

export type RawTrigger = {
  id?: string;
  sequenceFlowIds?: string[];
  eventType?: 'ACTIVE' | 'COMPLETED' | 'ABORTED' | 'INITIALIZED' | string;
  intensity?: number; // optional raw intensity
  timestamp?: number; // optional
  elementId?: string; // for activity triggers
  kind?: string; // 'activity' or 'flow'

  // Actual counts from backend (for aggregate messages)
  activeCount?: number;
  completedCount?: number;
  abortedCount?: number;
};

export type AggregatedTrigger = {
  id: string;
  sequenceFlowIds: string[];
  eventType: string;
  intensity: number; // aggregated intensity (1..N)
  timestamp: number;
  elementId?: string;
  kind?: string;
  // Actual counts from backend (for aggregate messages)
  activeCount?: number;
  completedCount?: number;
  abortedCount?: number;
};

// Incoming process-instance heatmap message shape
export type ProcessInstanceHeatmapMessage = {
  type: 'process-instance-heatmap';
  processInstanceId: string;
  activityPassCounts?: Record<string, number> | null;
  // backend may send either a map of sequenceFlowId->count, or an explicit list of ids
  sequenceFlowPassCounts?: Record<string, number> | null;
  sequenceFlowIds?: string[] | null;
  timestamp: number;
};

export type ProcessInstanceHeatmap = Omit<ProcessInstanceHeatmapMessage, 'type'>;

// NEW: Aggregate state message from backend
export type ProcessDefinitionAggregateStateMessage = {
  type: 'process-definition-aggregate-state';
  processDefinitionId: string;
  version: number;
  flowNodeStates: Record<string, {
    active: number;
    completed: number;
    aborted: number;
  }>;
  timestamp: number;
};

export type ProcessDefinitionAggregateState = Omit<ProcessDefinitionAggregateStateMessage, 'type'>;

// NEW: Process instance state message from backend
export type ProcessInstanceStateMessage = {
  type: 'process-instance-state';
  processInstanceId: string;
  flowNodeStates: Record<string, {
    active: number;
    completed: number;
    aborted: number;
  }>;
  timestamp: number;
};

export type ProcessInstanceState = Omit<ProcessInstanceStateMessage, 'type'>;

// Global definitions with versions summary message
export type ProcessDefinitionsWithVersionsSummaryMessage = {
  type: 'process-definitions-with-versions-summary';
  definitions: Record<string, Record<number, Record<string, number>>>;  // processDefinitionId -> version -> ExecutionState -> count
  timestamp: number;
};

export type ProcessDefinitionsWithVersionsSummary = Omit<ProcessDefinitionsWithVersionsSummaryMessage, 'type'>;

// Global counter for generating unique trigger IDs across all hook instances
// This ensures IDs are unique even when timestamps collide under high load
let globalTriggerCounter = 0;

// Internal aggregator hook (kept name small)
function useBpmnHeatmapAggregator(batchMs = 100) {
  const [triggers, setTriggers] = useState<AggregatedTrigger[]>([]);
  const triggersRef = useRef<Map<string, AggregatedTrigger>>(new Map());
  const cleanupIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup old triggers periodically instead of individual setTimeout per trigger
  useEffect(() => {
    cleanupIntervalRef.current = setInterval(() => {
      const now = Date.now();
      const cutoff = now - 4000; // Remove triggers older than 4 seconds

      let hasChanges = false;
      for (const [id, trigger] of triggersRef.current.entries()) {
        if (trigger.timestamp < cutoff) {
          triggersRef.current.delete(id);
          hasChanges = true;
        }
      }

      if (hasChanges) {
        setTriggers(Array.from(triggersRef.current.values()));
      }
    }, 500); // Cleanup every 500ms instead of per-trigger

    return () => {
      if (cleanupIntervalRef.current) {
        clearInterval(cleanupIntervalRef.current);
      }
    };
  }, []);

  const push = useCallback((raw: RawTrigger) => {
    const ts = raw.timestamp || Date.now();
    const ids = raw.sequenceFlowIds || [];
    // Always use the global counter to ensure unique IDs
    const uniqueId = globalTriggerCounter++;
    
    // If this is an activity trigger (no sequenceFlowIds, but has elementId and kind)
    if ((!ids.length) && raw.elementId && raw.kind === 'activity') {
      const out: AggregatedTrigger = {
        id: `agg-${uniqueId}-${ts}-${raw.elementId}`,
        sequenceFlowIds: [],
        eventType: raw.eventType || 'ACTIVE',
        intensity: Math.max(1, raw.intensity || 1),
        timestamp: ts,
        elementId: raw.elementId,
        kind: 'activity',
      };
      // Add to ref map and update state once (no setTimeout!)
      triggersRef.current.set(out.id, out);
      setTriggers(Array.from(triggersRef.current.values()));
      return;
    }
    // Sequence flow triggers (default)
    if (!ids.length) return;

    const newTriggers: AggregatedTrigger[] = ids.map(seqId => ({
      id: `agg-${uniqueId}-${globalTriggerCounter++}-${ts}-${seqId}`,
      sequenceFlowIds: [seqId],
      eventType: raw.eventType || 'ACTIVE',
      intensity: Math.max(1, raw.intensity || 1),
      timestamp: ts,
    }));

    // Add all to ref map in batch
    for (const trigger of newTriggers) {
      triggersRef.current.set(trigger.id, trigger);
    }

    // Single state update for all new triggers (no setTimeout!)
    setTriggers(Array.from(triggersRef.current.values()));
  }, []);

  return { push, triggers } as const;
}

// Wrapper hook: manage websocket and feed aggregator
export function useBpmnHeatmap(
  selectedDefinitionId: string | null,
  selectedVersion: number | null,
  selectedInstanceId: string | null | undefined = null,
  enableAnimations: boolean = true
) {

  // Community mode uses a single shared process-events stream.
  const wsIdentity = 'process-events:community';

  // URL factory: called on every connect/reconnect to get a fresh signed token.
  const urlFactoryRef = useRef<(() => Promise<string | null>) | null>(null);
  urlFactoryRef.current = () => import('../config/ingesterResolver')
    .then(({ fetchWsConnection }) => fetchWsConnection())
    .then(conn => conn?.wsUrl ?? null)
    .catch(() => null);

  const wsUrlFactory = () => urlFactoryRef.current?.() ?? Promise.resolve(null);

  const computeFallbackWsUrl = (): string => {
    try {
      if (typeof globalThis.window === 'undefined') return 'ws://localhost:8084/ws/process-events';
      const proto = globalThis.window.location.protocol === 'https:' ? 'wss' : 'ws';
      const host = globalThis.window.location.host || `${globalThis.window.location.hostname}:${globalThis.window.location.port}`;
      return `${proto}://${host}/ws/process-events`;
    } catch (e) {
      return 'ws://localhost:8084/ws/process-events';
    }
  };

  const fallbackWsUrl = computeFallbackWsUrl();

  const effectiveFactory = wsUrlFactory ?? (() => Promise.resolve(fallbackWsUrl));
  const effectiveIdentity = wsIdentity;

  const { push, triggers } = useBpmnHeatmapAggregator(100);
  const [processInstanceHeatmap, setProcessInstanceHeatmap] = useState<ProcessInstanceHeatmap | null>(null);
  const [aggregateState, setAggregateState] = useState<ProcessDefinitionAggregateState | null>(null);
  const [instanceState, setInstanceState] = useState<ProcessInstanceState | null>(null);
  const [globalSummary, setGlobalSummary] = useState<ProcessDefinitionsWithVersionsSummary | null>(null);
  const { status, lastMessage, send } = useWebSocket(effectiveFactory, effectiveIdentity, (msg: any) => {
    try {
      // For flownode-activity messages, push to aggregator for animation when enabled
      if (enableAnimations && (msg?.type === 'flownode-activity' || msg?.type === 'flownode-activity-heartbeat')) {
        const flowNodeId = msg.flowNodeId;
        
        // Handle heartbeat messages - these keep connection alive but don't trigger animations
        if (flowNodeId === '_heartbeat_') {
          // Heartbeat received - connection is healthy, no visual action needed
          return;
        }

        // Handle the special "_sequenceflows_" marker message which contains
        // aggregated sequence flows for the entire batch (already deduplicated by backend)
        if (flowNodeId === '_sequenceflows_') {
          const seqs = msg.sequenceFlowIds;
          if (seqs && !Array.isArray(seqs) && typeof seqs === 'object') {
            for (const [id, cnt] of Object.entries(seqs)) {
              const count = Number(cnt) || 1;
              push({ 
                sequenceFlowIds: [id], 
                eventType: 'ACTIVE', 
                intensity: count, 
                timestamp: msg.timestamp,
                id: `seqflow-${id}-${msg.timestamp}`,
              });
            }
          }
          // Don't process as a regular flow node activity
          return;
        }
        
        // Push activity trigger for the flow node itself (skip if empty marker)
        if (flowNodeId) {
          const totalCount = (msg.activeCount || 0) + (msg.completedCount || 0) + (msg.abortedCount || 0);
          // Only push if there's actual activity
          if (totalCount > 0) {
            push({
              sequenceFlowIds: [], // not a sequence flow
              eventType: msg.activeCount > 0 ? 'ACTIVE' : (msg.completedCount > 0 ? 'COMPLETED' : (msg.abortedCount > 0 ? 'ABORTED' : 'ACTIVE')),
              intensity: totalCount,
              timestamp: msg.timestamp,
              id: `activity-${flowNodeId}-${msg.timestamp}`,
              elementId: flowNodeId,
              kind: 'activity',
              // IMPORTANT: Preserve actual counts from backend
              activeCount: msg.activeCount || 0,
              completedCount: msg.completedCount || 0,
              abortedCount: msg.abortedCount || 0,
            });
          }
        }
        
        // Note: Sequence flows are handled separately via the "_sequenceflows_" message
        // to avoid duplicates when multiple flow nodes share the same sequence flow.
      }

      // New: process-instance-heatmap messages (cumulative counts for a specific instance)
      if (msg?.type === 'process-instance-heatmap') {
        try {
          const hm = msg as ProcessInstanceHeatmapMessage;
          setProcessInstanceHeatmap({
            processInstanceId: hm.processInstanceId,
            activityPassCounts: hm.activityPassCounts ?? null,
            sequenceFlowPassCounts: hm.sequenceFlowPassCounts ?? null,
            sequenceFlowIds: hm.sequenceFlowIds ?? null,
            timestamp: hm.timestamp || Date.now(),
          });
        } catch (e) {
          // ignore parse errors
        }
      }

      // NEW: process-definition-aggregate-state messages (current state for all flow nodes)
      if (msg?.type === 'process-definition-aggregate-state') {
        try {
          const stateMsg = msg as ProcessDefinitionAggregateStateMessage;
          setAggregateState({
            processDefinitionId: stateMsg.processDefinitionId,
            version: stateMsg.version,
            flowNodeStates: stateMsg.flowNodeStates || {},
            timestamp: stateMsg.timestamp || Date.now(),
          });
        } catch (e) {
          // ignore parse errors
        }
      }

      // NEW: process-instance-state messages (current state for specific instance)
      if (msg?.type === 'process-instance-state') {
        try {
          const stateMsg = msg as ProcessInstanceStateMessage;
          setInstanceState({
            processInstanceId: stateMsg.processInstanceId,
            flowNodeStates: stateMsg.flowNodeStates || {},
            timestamp: stateMsg.timestamp || Date.now(),
          });
        } catch (e) {
          // ignore parse errors
        }
      }

      // Process definitions with versions summary (replaces old separate messages)
      if (msg?.type === 'process-definitions-with-versions-summary') {
        try {
          const summaryMsg = msg as ProcessDefinitionsWithVersionsSummaryMessage;
          setGlobalSummary({
            definitions: summaryMsg.definitions || {},
            timestamp: summaryMsg.timestamp || Date.now(),
          });
        } catch (e) {
          // ignore parse errors
        }
      }
    } catch (e) {
      // ignore
    }
  });


  // Manage subscription messages: when WS is open, subscribe to the currently selected definition+version + optional instance
  const currentSubRef = useRef<{ def?: string | null; ver?: number | null; instance?: string | null } | null>(null);
  useEffect(() => {
    try {
      if (!send) {
        // If there's no send function (socket not connected yet), we still need to handle local deselects by
        // clearing the current processInstanceHeatmap and resetting our tracked subscription so the overlay
        // can clear highlights immediately. We'll only actually send subscribe/unsubscribe when the socket
        // is in 'open' state.
      }

      const shouldSubscribe = !!selectedDefinitionId && selectedVersion !== null;
      const shouldSubscribeGlobal = !selectedDefinitionId && !selectedVersion && !selectedInstanceId;
      const prev = currentSubRef.current || { def: null, ver: null, instance: null };
      const changed = prev.def !== selectedDefinitionId || prev.ver !== selectedVersion || prev.instance !== selectedInstanceId;

      // Check if this is initial subscription (never subscribed before)
      const isInitialSubscription = currentSubRef.current === null;

      // When socket is open we can send subscribe/unsubscribe messages to the server.
      if (status === 'open') {
        if (shouldSubscribeGlobal && (changed || isInitialSubscription)) {
          // Level 1: Subscribe to global overview (all definitions)
          try {
            send({ type: 'subscribe-all' });
            currentSubRef.current = { def: null, ver: null, instance: null };
          } catch (e) { console.warn('[useBpmnHeatmap] failed to send subscribe-all', e); }
        } else if (shouldSubscribe && (changed || isInitialSubscription)) {
          try {
            // NEW: Use specific subscription types based on what's selected
            let payload: any;
            if (selectedInstanceId) {
              // Level 4: Subscribe to specific instance
              payload = {
                type: 'subscribe-instance',
                processInstanceId: selectedInstanceId
              };
            } else {
              // Level 3: Subscribe to definition + version
              payload = {
                type: 'subscribe-definition-version',
                processDefinitionId: selectedDefinitionId,
                version: selectedVersion
              };
            }
            send(payload);
            // update tracked subscription
            currentSubRef.current = { def: selectedDefinitionId, ver: selectedVersion, instance: selectedInstanceId ?? null };

            // If the change represents a deselect (previously we had an instance, now we don't),
            // clear the local heatmap immediately so the overlay can remove badges/highlights.
            // The server subscription will be updated above (no processInstanceId means definition-level subscription),
            // but we still need to clear the client-side state on deselect.
            if (!selectedInstanceId && prev.instance) {
              try { setProcessInstanceHeatmap(null); } catch (e) { console.warn('[useBpmnHeatmap] failed to clear local heatmap after deselect', e); }
            }
          } catch (e) { console.warn('[useBpmnHeatmap] failed to send subscribe', e); }
        } else if (!shouldSubscribe && !shouldSubscribeGlobal && (prev.def || prev.ver != null || prev.instance)) {
          try {
            // attempt to inform server we no longer want specific updates
            send({ type: 'unsubscribe' });
          } catch (e) { console.warn('[useBpmnHeatmap] failed to send unsubscribe', e); }

          // Regardless of send success, clear local tracked subscription and heatmap so the UI can immediately
          // remove any persistent highlights associated with the previously selected instance.
          currentSubRef.current = { def: null, ver: null, instance: null };
          try { setProcessInstanceHeatmap(null); } catch (e) { console.warn('[useBpmnHeatmap] failed to clear local heatmap', e); }
        }
      } else {
        // Socket is not open. We cannot send unsubscribe, but we should still clear local tracked subscription
        // and the processInstanceHeatmap when a deselect occurred so the overlay can clear highlights.
        if (!shouldSubscribe && !shouldSubscribeGlobal && (prev.def || prev.ver != null || prev.instance)) {
          currentSubRef.current = { def: null, ver: null, instance: null };
          try { setProcessInstanceHeatmap(null); } catch (e) { console.warn('[useBpmnHeatmap] failed to clear local heatmap (socket closed)', e); }
        }
        // If a new subscription is desired but the socket isn't open yet, we don't update currentSubRef here; when
        // the socket opens the 'status' change handler will pick up that we need to subscribe because currentSubRef
        // won't match the desired values.
      }
    } catch (e) {}
  }, [status, send, selectedDefinitionId, selectedVersion, selectedInstanceId]);

  // Ensure we unsubscribe on unmount or when WSUrl changes
  useEffect(() => {
    return () => {
      try {
        if (send) {
          try { send({ type: 'unsubscribe' }); } catch {}
        }
      } catch {}
    };
  }, [send]);

  // Allow consumer to manually force a reconnect (re-fetches a fresh token)
  const forceFallback = () => {
    console.warn('[useBpmnHeatmap] forceFallback: triggering reconnect');
    // Close the current socket — SharedWebSocket will reconnect with a fresh token automatically
    try { send({ type: 'unsubscribe' }); } catch {}
  };

  return {
    animationTriggers: triggers,
    aggregateState,
    instanceState,
    globalSummary,
    wsStatus: status,
    lastMessage,
    forceFallback,
    processInstanceHeatmap,
  } as const;
}

// Also export types for compatibility
export type AnimationTrigger = AggregatedTrigger;
