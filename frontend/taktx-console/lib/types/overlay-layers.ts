/**
 * Overlay Layer System Types
 */

import type { AggregatedTrigger } from '@/lib/hooks/useBpmnHeatmap';

export type OverlayLayerType =
  | 'process-definition-aggregate-flownode-heatmap'
  | 'process-instance-single-flownode-heatmap'
  | 'process-definition-flownode-count'
  | 'process-instance-flownode-count';

export interface OverlayLayerConfig {
  id: OverlayLayerType;
  name: string;
  description: string;
  enabled: boolean;
  zIndex: number;
  group: 'heatmap' | 'count' | 'custom';
}

/**
 * Data Source Interface
 *
 * Provides triggers to heatmap layers from various sources
 * (WebSocket, API, mock data, etc.)
 */
export interface HeatmapDataSource {
  /**
   * Subscribe to trigger updates
   * @returns unsubscribe function
   */
  subscribe: (callback: (triggers: AggregatedTrigger[]) => void) => () => void;

  /**
   * Get current triggers (synchronous)
   */
  getTriggers: () => AggregatedTrigger[];
}

export const OVERLAY_LAYERS: Record<OverlayLayerType, OverlayLayerConfig> = {
  'process-definition-aggregate-flownode-heatmap': {
    id: 'process-definition-aggregate-flownode-heatmap',
    name: 'Process Definition Heatmap (Aggregate)',
    description: 'Shows heat accumulation across all process instances',
    enabled: true,
    zIndex: 10,
    group: 'heatmap',
  },
  'process-instance-single-flownode-heatmap': {
    id: 'process-instance-single-flownode-heatmap',
    name: 'Process Instance Heatmap (Single)',
    description: 'Shows heat accumulation for a single process instance',
    enabled: true,
    zIndex: 20,
    group: 'heatmap',
  },
  'process-definition-flownode-count': {
    id: 'process-definition-flownode-count',
    name: 'Flow Node Counts (Aggregate)',
    description: 'Shows activity counts across all process instances',
    enabled: false,
    zIndex: 30,
    group: 'count',
  },
  'process-instance-flownode-count': {
    id: 'process-instance-flownode-count',
    name: 'Flow Node Counts (Single Instance)',
    description: 'Shows activity counts for a single process instance',
    enabled: false,
    zIndex: 40,
    group: 'count',
  },
};

