/**
 * BPMN Heatmap Manager with Data Source
 *
 * This component manages the heatmap using a data source abstraction.
 * It provides the same functionality as BpmnHeatmapOverlay but with
 * a cleaner architecture that supports different data sources.
 */

'use client';

import BpmnHeatmapLayer from './layers/BpmnHeatmapLayer';
import type { OverlaySettingsState } from './OverlaySettings';
import type { OverlayLayerConfig } from '@/lib/types/overlay-layers';
import { useAggregateHeatmapDataSource } from '@/lib/hooks/useAggregateHeatmapDataSource';
import type { AggregatedTrigger } from '@/lib/hooks/useBpmnHeatmap';

interface BpmnHeatmapManagerProps {
  viewer: any;
  enabled: boolean;
  settings: OverlaySettingsState;
  config: OverlayLayerConfig;
  animationTriggers: AggregatedTrigger[];
  debugTrigger?: { requestId: number; elementId?: string; eventType?: string } | null;
}

export default function BpmnHeatmapManager({
  viewer,
  enabled,
  settings,
  config,
  animationTriggers,
  debugTrigger,
}: Readonly<BpmnHeatmapManagerProps>) {
  const dataSource = useAggregateHeatmapDataSource(animationTriggers);

  return (
    <BpmnHeatmapLayer
      viewer={viewer}
      dataSource={dataSource}
      enabled={enabled}
      settings={settings}
      config={config}
      debugTrigger={debugTrigger}
    />
  );
}

