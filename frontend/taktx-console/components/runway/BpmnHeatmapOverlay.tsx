'use client';

import BpmnHeatmapLayer from './layers/BpmnHeatmapLayer';
import type { AggregatedTrigger } from '@/lib/hooks/useBpmnHeatmap';
import type { OverlaySettingsState } from './OverlaySettings';
import { OVERLAY_LAYERS } from '@/lib/types/overlay-layers';

interface BpmnHeatmapOverlayProps {
  viewer: any;
  triggers: AggregatedTrigger[];
  enabled?: boolean;
  settings: OverlaySettingsState;
  debugTrigger?: { requestId: number; elementId?: string; eventType?: string } | null;
}

/**
 * BACKWARD COMPATIBLE WRAPPER
 *
 * This component now uses the new BpmnHeatmapLayer internally.
 * All animation logic remains exactly the same - just wrapped in the layer architecture.
 */
export default function BpmnHeatmapOverlay({
  viewer,
  triggers,
  enabled = true,
  settings,
  debugTrigger,
}: Readonly<BpmnHeatmapOverlayProps>) {
  // Use the layer with the aggregate heatmap configuration
  const config = OVERLAY_LAYERS['process-definition-aggregate-flownode-heatmap'];

  return (
    <BpmnHeatmapLayer
      viewer={viewer}
      triggers={triggers}
      enabled={enabled}
      settings={settings}
      config={config}
      debugTrigger={debugTrigger}
    />
  );
}

