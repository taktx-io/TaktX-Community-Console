/**
 * BPMN Element Click Layer
 *
 * Attaches click handlers to flow node elements in the BPMN diagram.
 * Only handles flow nodes (tasks, events, gateways, subprocesses) - ignores sequence flows.
 *
 * Z-index: 5 (above base diagram, below badges/heatmap)
 */

'use client';

import { useEffect, useRef } from 'react';
import { isFlowNodeType } from '@/lib/utils/flowNodeInstanceUtils';

interface BpmnElementClickLayerProps {
  viewer: any;
  enabled?: boolean;
  onElementClick?: (elementId: string) => void;
}

export default function BpmnElementClickLayer({
  viewer,
  enabled = true,
  onElementClick,
}: Readonly<BpmnElementClickLayerProps>) {
  const clickHandlerRef = useRef<((event: any) => void) | null>(null);
  const dragStartHandlerRef = useRef<((event: any) => void) | null>(null);
  const dragEndHandlerRef = useRef<((event: any) => void) | null>(null);
  const isDraggingRef = useRef<boolean>(false);

  useEffect(() => {
    if (!viewer || !enabled || !onElementClick) {
      // Clean up existing handlers
      if (clickHandlerRef.current) {
        const eventBus = viewer?.get?.('eventBus');
        if (eventBus) {
          eventBus.off('element.click', clickHandlerRef.current);
          if (dragStartHandlerRef.current) {
            eventBus.off('canvas.drag.start', dragStartHandlerRef.current);
          }
          if (dragEndHandlerRef.current) {
            eventBus.off('canvas.drag.end', dragEndHandlerRef.current);
          }
        }
        clickHandlerRef.current = null;
        dragStartHandlerRef.current = null;
        dragEndHandlerRef.current = null;
      }
      return;
    }

    const eventBus = viewer.get?.('eventBus');
    if (!eventBus) {
      console.warn('[BpmnElementClickLayer] EventBus not available');
      return;
    }

    // Track when user starts dragging (panning)
    const handleDragStart = () => {
      console.log('[BpmnElementClickLayer] Drag started');
      isDraggingRef.current = true;
    };

    // Track when user stops dragging
    const handleDragEnd = () => {
      console.log('[BpmnElementClickLayer] Drag ended');
      // Small delay to ensure drag is fully complete before allowing clicks
      setTimeout(() => {
        isDraggingRef.current = false;
        console.log('[BpmnElementClickLayer] Drag state reset');
      }, 50);
    };

    // Create click handler
    const handleElementClick = (event: any) => {
      const element = event.element;
      console.log('[BpmnElementClickLayer] Element clicked:', {
        elementId: element?.id,
        elementType: element?.type,
        isDragging: isDraggingRef.current
      });

      // Ignore clicks during/immediately after drag operations (panning)
      if (isDraggingRef.current) {
        console.log('[BpmnElementClickLayer] Click ignored - dragging');
        return;
      }

      // Only handle flow nodes (tasks, events, gateways, subprocesses)
      // Ignore sequence flows, associations, and other non-flow-node elements
      if (!element || !element.type || !element.id) {
        console.log('[BpmnElementClickLayer] Click ignored - no element/type/id');
        return;
      }

      // Ignore canvas/root elements (bpmn:Process, bpmn:Collaboration, etc.)
      if (element.type === 'bpmn:Process' ||
          element.type === 'bpmn:Collaboration' ||
          element.type === 'bpmn:Participant' ||
          element.type === 'label' ||
          !isFlowNodeType(element.type)) {
        console.log('[BpmnElementClickLayer] Click ignored - not a flow node type');
        return;
      }

      console.log('[BpmnElementClickLayer] Triggering onElementClick for:', element.id);
      // Invoke callback with element ID
      onElementClick(element.id);
    };

    // Register handlers
    eventBus.on('canvas.drag.start', handleDragStart);
    eventBus.on('canvas.drag.end', handleDragEnd);
    eventBus.on('element.click', handleElementClick);

    clickHandlerRef.current = handleElementClick;
    dragStartHandlerRef.current = handleDragStart;
    dragEndHandlerRef.current = handleDragEnd;

    // Cleanup on unmount or when dependencies change
    return () => {
      if (clickHandlerRef.current) {
        eventBus.off('element.click', clickHandlerRef.current);
        clickHandlerRef.current = null;
      }
      if (dragStartHandlerRef.current) {
        eventBus.off('canvas.drag.start', dragStartHandlerRef.current);
        dragStartHandlerRef.current = null;
      }
      if (dragEndHandlerRef.current) {
        eventBus.off('canvas.drag.end', dragEndHandlerRef.current);
        dragEndHandlerRef.current = null;
      }
    };
  }, [viewer, enabled, onElementClick]);

  // This is a logical layer - no visual rendering
  return null;
}

