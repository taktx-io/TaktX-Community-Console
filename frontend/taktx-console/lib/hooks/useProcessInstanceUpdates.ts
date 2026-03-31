/**
 * Hook to subscribe to real-time process instance state updates via WebSocket.
 * Connects to the ingester WebSocket endpoint (/ws/process-events) and sends a
 * subscribe-all message on open so the ingester starts pushing
 * process-instance-delta events for this session.
 */

'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useWebSocket } from './useWebSocket';
import { fetchWsConnection } from '@/lib/config/ingesterResolver';

export interface ProcessInstanceMetadata {
  type: 'process-instance-delta';
  processInstanceId: string;
  processDefinitionId: string;
  version: number;
  state: 'ACTIVE' | 'COMPLETED' | 'ABORTED' | 'INITIALIZED';
  endTimeMillis?: number | null;
}

interface UseProcessInstanceUpdatesOptions {
  onInstanceUpdate?: (metadata: ProcessInstanceMetadata) => void;
  enabled?: boolean;
}

/**
 * Subscribe to process instance state updates via WebSocket.
 *
 * The ingester WebSocket endpoint (/ws/process-events) requires clients to
 * send a subscribe-* message after connecting before it will push any events.
 * This hook sends subscribe-all on open so all process-instance-delta messages
 * are received and then filtered client-side by handleInstanceUpdate.
 */
export function useProcessInstanceUpdates({
  onInstanceUpdate,
  enabled = true,
}: UseProcessInstanceUpdatesOptions) {
  const identity = enabled ? 'process-events:community' : null;

  // URL factory: called on every connect/reconnect — always fetches a fresh token
  const urlFactoryRef = useRef<(() => Promise<string | null>) | null>(null);
  urlFactoryRef.current = identity ? () => fetchWsConnection().then(conn => conn?.wsUrl ?? null) : null;

  const urlFactory = identity
    ? () => urlFactoryRef.current?.() ?? Promise.resolve(null)
    : null;

  const handleMessage = useCallback((msg: any) => {
    if (msg?.type === 'process-instance-delta' && onInstanceUpdate) {
      onInstanceUpdate(msg as ProcessInstanceMetadata);
    }
  }, [onInstanceUpdate]);

  const { status, send } = useWebSocket<any>(urlFactory, identity, handleMessage);

  useEffect(() => {
    if (status === 'open') {
      console.log('[useProcessInstanceUpdates] connected — sending subscribe-all');
      try { send({ type: 'subscribe-all' }); }
      catch (e) { console.warn('[useProcessInstanceUpdates] Failed to send subscribe-all', e); }
    }
  }, [status, send]);

  return { status };
}
