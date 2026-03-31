/**
 * Aggregate Heatmap Data Source
 *
 * Accepts pre-fetched animation triggers from the single page-level useBpmnHeatmap
 * instance instead of opening its own WebSocket connection.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import type { HeatmapDataSource } from '@/lib/types/overlay-layers';
import type { AggregatedTrigger } from '@/lib/hooks/useBpmnHeatmap';

/**
 * Hook that provides aggregate heatmap data source.
 * Accepts animationTriggers produced by the single page-level useBpmnHeatmap call —
 * no separate WebSocket connection is opened.
 */
export function useAggregateHeatmapDataSource(
  animationTriggers: AggregatedTrigger[]
): HeatmapDataSource {
  const [triggers, setTriggers] = useState<AggregatedTrigger[]>([]);
  const subscribersRef = useRef<Set<(triggers: AggregatedTrigger[]) => void>>(new Set());

  // Update triggers when animationTriggers changes
  useEffect(() => {
    const newTriggers = animationTriggers || [];
    setTriggers(newTriggers);
    subscribersRef.current.forEach(callback => callback(newTriggers));
  }, [animationTriggers]);

  return {
    subscribe: (callback: (triggers: AggregatedTrigger[]) => void) => {
      subscribersRef.current.add(callback);
      callback(triggers);
      return () => {
        subscribersRef.current.delete(callback);
      };
    },
    getTriggers: () => triggers,
  };
}

