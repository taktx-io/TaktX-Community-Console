'use client';

import { useEffect, useRef } from 'react';
import type { ProcessInstanceState, ProcessInstanceHeatmap } from '@/lib/hooks/useBpmnHeatmap';

interface ProcessInstancePathHighlightProps {
  viewer: any;
  processInstanceId: string | null;
  instanceState: ProcessInstanceState | null;
  processInstanceHeatmap: ProcessInstanceHeatmap | null;
  highlightColor?: string;
  enabled?: boolean;
}

export default function ProcessInstancePathHighlight({
  viewer,
  processInstanceId,
  instanceState,
  processInstanceHeatmap,
  highlightColor = '#00ff88',
  enabled = true,
}: Readonly<ProcessInstancePathHighlightProps>) {
  const highlightedElementsRef = useRef<Set<string>>(new Set());

  // Apply or remove highlighting
  useEffect(() => {
    if (!viewer || !enabled || !processInstanceId) {
      clearHighlights();
      return;
    }

    const heatmap = processInstanceHeatmap;

    // Use instanceState as fallback if heatmap not available
    const hasData = heatmap || instanceState;
    if (!hasData) {
      return;
    }

    // Validate instance ID match
    const dataInstanceId = heatmap?.processInstanceId || instanceState?.processInstanceId;
    if (dataInstanceId !== processInstanceId) {
      return;
    }

    // Clear previous highlights
    clearHighlights();

    const canvas = viewer.get?.('canvas');
    const elementRegistry = viewer.get?.('elementRegistry');
    if (!canvas || !elementRegistry) {
      return;
    }

    const elementsToHighlight = new Set<string>();

    // Collect from heatmap if available
    if (heatmap) {
      // Collect activity elements that have been passed
      if (heatmap.activityPassCounts) {
        Object.keys(heatmap.activityPassCounts).forEach(elementId => {
          elementsToHighlight.add(elementId);
        });
      }

      // Collect sequence flows that have been traversed
      if (heatmap.sequenceFlowIds && Array.isArray(heatmap.sequenceFlowIds)) {
        heatmap.sequenceFlowIds.forEach(flowId => {
          elementsToHighlight.add(flowId);
        });
      }

      if (heatmap.sequenceFlowPassCounts) {
        Object.keys(heatmap.sequenceFlowPassCounts).forEach(flowId => {
          elementsToHighlight.add(flowId);
        });
      }
    }

    // Also collect from instanceState (elements that have counts > 0)
    if (instanceState && instanceState.flowNodeStates) {
      Object.entries(instanceState.flowNodeStates).forEach(([elementId, counts]: any) => {
        // If element has any activity (completed or active), it's part of the path
        if (counts.completed > 0 || counts.active > 0 || counts.aborted > 0) {
          elementsToHighlight.add(elementId);
        }
      });
    }

    if (elementsToHighlight.size === 0) {
      return;
    }

    // Apply highlighting to each element
    elementsToHighlight.forEach(elementId => {
      const element = elementRegistry.get(elementId);
      if (!element) return;

      const gfx = canvas.getGraphics(element);
      if (!gfx) return;

      // Find the visual shape - it's inside the djs-visual group
      const visualGroup = gfx.querySelector('.djs-visual');
      if (!visualGroup) return;

      // Check if this is a connection (sequence flow) or a shape (task, event, etc.)
      const isConnection = element.waypoints !== undefined;

      if (isConnection) {
        // For sequence flows, highlight stroke color only (keep original width and fill)
        const paths = visualGroup.querySelectorAll('path');
        paths.forEach((path: SVGPathElement) => {
          // Store original stroke for restoration
          if (!path.hasAttribute('data-original-stroke')) {
            const originalStroke = path.getAttribute('stroke') || 'black';
            path.setAttribute('data-original-stroke', originalStroke);
          }

          // Apply highlight color to stroke only
          path.setAttribute('stroke', highlightColor);
          path.style.stroke = highlightColor;
        });

        highlightedElementsRef.current.add(elementId);
      } else {
        // For shapes (tasks, events, gateways), highlight stroke color only
        const shape = visualGroup.querySelector('rect.djs-outline, path, rect, circle, polygon, polyline');
        if (shape) {
          // Store original stroke for restoration
          if (!shape.hasAttribute('data-original-stroke')) {
            const originalStroke = shape.getAttribute('stroke') || 'black';
            shape.setAttribute('data-original-stroke', originalStroke);
          }

          // Apply highlight color to stroke only
          shape.setAttribute('stroke', highlightColor);
          shape.style.stroke = highlightColor;

          highlightedElementsRef.current.add(elementId);
        }
      }
    });

  }, [viewer, processInstanceHeatmap, instanceState, processInstanceId, highlightColor, enabled]);

  // Clear highlights function
  const clearHighlights = () => {
    if (!viewer) return;

    const canvas = viewer.get?.('canvas');
    const elementRegistry = viewer.get?.('elementRegistry');
    if (!canvas || !elementRegistry) return;

    highlightedElementsRef.current.forEach(elementId => {
      const element = elementRegistry.get(elementId);
      if (!element) return;

      const gfx = canvas.getGraphics(element);
      if (!gfx) return;

      const visualGroup = gfx.querySelector('.djs-visual');
      if (!visualGroup) return;

      const isConnection = element.waypoints !== undefined;

      if (isConnection) {
        // For sequence flows, restore stroke color only
        const paths = visualGroup.querySelectorAll('path');
        paths.forEach((path: SVGPathElement) => {
          if (path.hasAttribute('data-original-stroke')) {
            const originalStroke = path.getAttribute('data-original-stroke');

            path.setAttribute('stroke', originalStroke || 'black');
            path.style.stroke = originalStroke || 'black';

            path.removeAttribute('data-original-stroke');
          }
        });
      } else {
        // For shapes, restore stroke color only
        const shape = visualGroup.querySelector('rect.djs-outline, path, rect, circle, polygon, polyline');
        if (shape && shape.hasAttribute('data-original-stroke')) {
          const originalStroke = shape.getAttribute('data-original-stroke');

          shape.setAttribute('stroke', originalStroke || 'black');
          shape.style.stroke = originalStroke || 'black';

          shape.removeAttribute('data-original-stroke');
        }
      }
    });

    highlightedElementsRef.current.clear();
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearHighlights();
    };
  }, []);

  return null; // This component doesn't render anything
}

