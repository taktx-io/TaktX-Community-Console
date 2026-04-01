'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import BpmnViewer from 'bpmn-js/lib/NavigatedViewer';
import { Empty, Spin } from 'antd';
import BpmnHeatmapOverlay from './BpmnHeatmapOverlay';
import BpmnBadgeLayer from './layers/BpmnBadgeLayer';
import BpmnHeatmapLayer from './layers/BpmnHeatmapLayer';
import ZeebeTemplateIconLayer from './layers/ZeebeTemplateIconLayer';
import BpmnClickableLinksLayer from './layers/BpmnClickableLinksLayer';
import type { ClickableLink } from './layers/BpmnClickableLinksLayer';
import BpmnElementClickLayer from './layers/BpmnElementClickLayer';
import ProcessInstancePathHighlight from './ProcessInstancePathHighlight';
import { useAggregateFlowNodeCountDataSource, useSingleInstanceFlowNodeCountDataSource } from '@/lib/hooks/useFlowNodeCountDataSource';
import { useProcessInstanceHeatmapDataSource } from '@/lib/hooks/useProcessInstanceHeatmapDataSource';
import type { AnimationTrigger, ProcessDefinitionAggregateState, ProcessInstanceState, ProcessInstanceHeatmap } from '@/lib/hooks/useBpmnHeatmap';
import type { OverlaySettingsState } from './OverlaySettings';
import type { AggregateBadgeSettings, InstanceBadgeSettings } from './BadgeSettings';
import { DEFAULT_OVERLAY_SETTINGS } from './OverlaySettings';
import { OVERLAY_LAYERS } from '@/lib/types/overlay-layers';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';

interface BpmnViewerComponentProps {
  bpmnXml: string | null;
  loading?: boolean;
  showLiveOverlay?: boolean;
  autoFitOnResize?: boolean;
  animationTriggers?: AnimationTrigger[];
  overlaySettings?: OverlaySettingsState;
  overlayEnabled?: boolean;
  debugTrigger?: { requestId: number; elementId?: string; eventType?: string } | null;
  // Badge layer props
  selectedDefinitionId?: string | null;
  selectedVersion?: number | null;
  processInstanceId?: string | null;
  showBadges?: boolean;
  aggregateBadgeSettings?: AggregateBadgeSettings;
  instanceBadgeSettings?: InstanceBadgeSettings;
  // Heatmap data from the single page-level useBpmnHeatmap (no separate WS connections)
  aggregateState?: ProcessDefinitionAggregateState | null;
  instanceState?: ProcessInstanceState | null;
  processInstanceHeatmap?: ProcessInstanceHeatmap | null;
  // Clickable links props
  clickableLinks?: ClickableLink[];
  onLinkClick?: (link: ClickableLink) => void;
  // Element click handler (for flow node selection)
  onElementClick?: (elementId: string) => void;
  selectedElementId?: string | null;
  onViewerReady?: (viewer: any) => void;
}

export default function BpmnViewerComponent({
  bpmnXml,
  loading,
  showLiveOverlay = true,
  autoFitOnResize = true,
  animationTriggers = [],
  overlaySettings,
  overlayEnabled = true,
  debugTrigger,
  selectedDefinitionId = null,
  selectedVersion = null,
  processInstanceId = null,
  showBadges = true,
  aggregateBadgeSettings,
  instanceBadgeSettings,
  aggregateState = null,
  instanceState = null,
  processInstanceHeatmap = null,
  clickableLinks = [],
  onLinkClick,
  onElementClick,
  onViewerReady,
}: Readonly<BpmnViewerComponentProps>) {
   const containerRef = useRef<HTMLDivElement>(null);
   const viewerRef = useRef<BpmnViewer | null>(null);
  // Track whether we already did an initial fit-to-viewport so we don't reset user zoom/pan on resizes
   const initialFitRef = useRef<boolean>(false);
   // track readiness in state so render updates when viewer becomes available
   const [viewerReady, setViewerReady] = useState(false);
   const onViewerReadyRef = useRef(onViewerReady);
   onViewerReadyRef.current = onViewerReady;

   // Badge data source - use single instance if processInstanceId provided, otherwise aggregate
   // Memoize badgeColors to prevent infinite re-renders
   const badgeColors = useMemo(() => {
     if (!overlaySettings) return undefined;
     return {
       incomingColor: overlaySettings.incomingColor,
       outgoingColor: overlaySettings.outgoingColor,
       abortedColor: overlaySettings.abortedColor,
     };
   }, [overlaySettings]);

   const aggregateDataSource = useAggregateFlowNodeCountDataSource(
     selectedDefinitionId,
     selectedVersion,
     aggregateState ?? null,
     badgeColors
   );

   const singleInstanceDataSource = useSingleInstanceFlowNodeCountDataSource(
     processInstanceId,
     instanceState ?? null,
     processInstanceHeatmap ?? null,
     badgeColors
   );

   // Process instance heatmap data source for animations
   const processInstanceHeatmapDataSource = useProcessInstanceHeatmapDataSource(
     processInstanceId,
     instanceState ?? null,
     processInstanceHeatmap ?? null
   );

   // Choose data source based on context
   const badgeDataSource = processInstanceId ? singleInstanceDataSource : aggregateDataSource;

   const badgeConfig = {
     id: processInstanceId ? 'single-instance-counts' : 'aggregate-counts',
     name: processInstanceId ? 'Process Instance Counts' : 'Aggregate Counts',
     enabled: true,
     zIndex: 100,
   };


   // Initialize / import XML
   useEffect(() => {
     if (!containerRef.current) return;

     // Destroy existing viewer when bpmnXml changes to ensure clean state
     if (viewerRef.current) {
       try {
         viewerRef.current.destroy();
       } catch {}
       viewerRef.current = null;
       setViewerReady(false);
      // reset initial fit flag when viewer is recreated
      initialFitRef.current = false;
     }

     // Create new viewer instance
     const viewer = new BpmnViewer({
       container: containerRef.current,
       height: '100%'
     });
     viewerRef.current = viewer;

     if (bpmnXml) {
       viewer.importXML(bpmnXml)
         .then(() => {
           // mark ready after successful import so overlays can find elements
           setViewerReady(true);

           // Notify parent that viewer is ready
            if (onViewerReadyRef.current && viewerRef.current) {
              onViewerReadyRef.current(viewerRef.current);
           }

            // Ensure viewer is still valid (not destroyed during async operation)
            if (!viewerRef.current) {
              console.warn('[BpmnViewer] Viewer destroyed before zoom could be applied');
              return;
            }

            const canvas = viewer.get('canvas') as any;
           // Small timeout to ensure DOM is ready before zooming
           setTimeout(() => {
             try {
               // Double-check viewer is still valid after timeout
               if (!viewerRef.current) {
                 console.warn('[BpmnViewer] Viewer destroyed during zoom timeout');
                 return;
               }

               // Validate canvas state before zooming
               // Some bpmn-js internals access canvas._container (private) and may throw
               // if the viewer/canvas hasn't fully initialized or has been torn down.
               if (!canvas || !canvas._container) {
                 console.warn('[BpmnViewer] Canvas or canvas._container not available, skipping zoom');
                 return;
               }

               const canvasContainer = canvas._container;
               const viewbox: any | null = (() => {
                 try {
                   return canvas.viewbox();
                 } catch (err) {
                   console.warn('[BpmnViewer] canvas.viewbox() threw, skipping zoom', err);
                   return null;
                 }
               })();

               // Only zoom if we have valid viewbox, container dimensions, and proper state
               if (viewbox &&
                   canvasContainer &&
                   typeof canvasContainer.clientWidth === 'number' &&
                   typeof canvasContainer.clientHeight === 'number' &&
                   canvasContainer.clientWidth > 0 &&
                   canvasContainer.clientHeight > 0 &&
                   Number.isFinite(viewbox.scale) &&
                   viewbox.scale > 0 &&
                   Number.isFinite(viewbox.x) &&
                   Number.isFinite(viewbox.y) &&
                   Number.isFinite(viewbox.width) &&
                   Number.isFinite(viewbox.height)) {
                 canvas.zoom('fit-viewport');
                 // mark that initial fit has been applied; subsequent resizes should not re-fit
                 initialFitRef.current = true;
               } else {
                 console.warn('[BpmnViewer] Invalid viewbox or canvas state, skipping zoom');
               }
             } catch (err) {
               console.error('Error zooming canvas:', err);
             }
           }, 100);
         })
         .catch((err: Error) => console.error('Error rendering BPMN diagram:', err));
     }

     return () => {
       try {
         viewer.destroy();
       } catch {}
       viewerRef.current = null;
       setViewerReady(false);
      initialFitRef.current = false;
     };
   }, [bpmnXml]);

   // Resize observer to keep diagram sized (attach after viewer is created/imported)
   useEffect(() => {
     if (!containerRef.current) return;
     const ro = new ResizeObserver(() => {
       if (!viewerRef.current) return;
       try {
         const canvas = viewerRef.current.get('canvas') as any;
         canvas.resized();
        // Only auto-fit when we haven't already applied the initial fit; avoid resetting
        // user zoom/pan when resizing or moving splits.
        if (autoFitOnResize && !initialFitRef.current) {
          // Slight delay to let layout settle
          setTimeout(() => {
            try {
              if (!viewerRef.current) return;
              const c = viewerRef.current.get('canvas') as any;
              c.zoom('fit-viewport');
              initialFitRef.current = true;
            } catch {}
          }, 20);
        }
       } catch {
         // noop
       }
     });
     ro.observe(containerRef.current);
     return () => ro.disconnect();
   }, [bpmnXml, autoFitOnResize]);

   // Cleanup on unmount
   useEffect(() => {
     return () => {
       try { viewerRef.current?.destroy(); } catch {}
       viewerRef.current = null;
       setViewerReady(false);
     };
   }, []);

   if (loading) {
     return (
       <div style={{
         display: 'flex',
         flexDirection: 'column',
         justifyContent: 'center',
         alignItems: 'center',
         height: '100%',
         minHeight: '400px',
         gap: '12px'
       }}>
         <Spin size="large" />
         <span style={{ fontSize: 12, color: '#999' }}>Loading BPMN diagram…</span>
       </div>
     );
   }

   if (!bpmnXml) {
     return (
       <div style={{
         display: 'flex',
         justifyContent: 'center',
         alignItems: 'center',
         height: '100%',
         minHeight: '400px',
         // remove visual border and rounding to maximize usable diagram area
         border: 'none',
         borderRadius: 0,
         padding: 0
       }}>
         <Empty description="Select a process definition and version to view its BPMN diagram" />
       </div>
     );
   }

   return (
     <div
       ref={containerRef}
       data-testid="bpmn-viewer"
       style={{
         width: '100%',
         height: '100%',
         flex: 1,
         // remove surrounding border/padding to use full card area for the diagram
         border: 'none',
         borderRadius: 0,
         backgroundColor: 'transparent',
         overflow: 'hidden',
         position: 'relative',
         padding: 0,
         // Prevent text selection when dragging/panning the diagram
         userSelect: 'none',
         WebkitUserSelect: 'none',
         MozUserSelect: 'none',
         msUserSelect: 'none',
       }}
     >

       {/* Zeebe Template Icon Layer - shows custom template icons on tasks */}
       {viewerReady && bpmnXml && (
         <ZeebeTemplateIconLayer
           viewer={viewerRef.current}
           enabled={true}
         />
       )}

       {/* Clickable Links Layer - interactive elements for navigation */}
       {viewerReady && bpmnXml && clickableLinks && clickableLinks.length > 0 && (
         <BpmnClickableLinksLayer
           viewer={viewerRef.current}
           links={clickableLinks}
           enabled={true}
           onLinkClick={onLinkClick}
         />
       )}

       {/* Element Click Layer - handles flow node selection in instance view */}
       {viewerReady && bpmnXml && processInstanceId && onElementClick && (
         <BpmnElementClickLayer
           viewer={viewerRef.current}
           enabled={true}
           onElementClick={onElementClick}
         />
       )}

       {/* Animation overlay - starts automatically when viewer is ready */}
       {/* Aggregate view: use BpmnHeatmapOverlay with triggers */}
       {showLiveOverlay && viewerReady && bpmnXml && !processInstanceId && (
         <BpmnHeatmapOverlay
           viewer={viewerRef.current}
           triggers={animationTriggers}
           enabled={overlayEnabled}
           settings={overlaySettings || DEFAULT_OVERLAY_SETTINGS}
           debugTrigger={debugTrigger ?? null}
         />
       )}

       {/* Process Instance view: use BpmnHeatmapLayer with data source */}
       {showLiveOverlay && viewerReady && bpmnXml && processInstanceId && (
         <BpmnHeatmapLayer
           viewer={viewerRef.current}
           dataSource={processInstanceHeatmapDataSource}
           enabled={overlayEnabled}
           settings={overlaySettings || DEFAULT_OVERLAY_SETTINGS}
           config={OVERLAY_LAYERS['process-instance-single-flownode-heatmap']}
           debugTrigger={debugTrigger ?? null}
         />
       )}

       {/* Process Instance Path Highlight - colors the path taken in activated color */}
       {viewerReady && bpmnXml && processInstanceId && (
         <ProcessInstancePathHighlight
           viewer={viewerRef.current}
           processInstanceId={processInstanceId}
           instanceState={instanceState ?? null}
           processInstanceHeatmap={processInstanceHeatmap ?? null}
           highlightColor={overlaySettings?.incomingColor || '#00ff88'}
           enabled={true}
         />
       )}

       {/* Badge layer - shows execution counts */}
       {showBadges && viewerReady && bpmnXml && selectedDefinitionId && (
         <BpmnBadgeLayer
           viewer={viewerRef.current}
           dataSource={badgeDataSource}
           enabled={true}
           config={badgeConfig}
           colors={badgeColors}
           aggregateBadgeSettings={aggregateBadgeSettings}
           instanceBadgeSettings={instanceBadgeSettings}
           processInstanceId={processInstanceId}
         />
       )}
     </div>
   );
}
