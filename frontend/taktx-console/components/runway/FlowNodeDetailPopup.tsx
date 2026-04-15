/**
 * Flow Node Detail Popup
 *
 * Compact popup positioned in BPMN viewer area (bottom-right).
 * Shows connection line to selected element with visual highlight.
 * Includes JSON detail view link.
 */

'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Select, Button, Tooltip, Modal } from 'antd';
import { CloseOutlined, FileTextOutlined, ApartmentOutlined } from '@ant-design/icons';
import type { TimedFlowNodeInstance } from '@/lib/api/processInstanceApi';
import { filterFlowNodeInstancesByElementId, formatTimestampWithMs, findInstanceByKey, generateFlowNodeInstanceKey } from '@/lib/utils/flowNodeInstanceUtils';
import { getStateColor } from '@/lib/utils/stateColors';
import type { OverlaySettingsState } from './OverlaySettings';

interface FlowNodeDetailPopupProps {
  elementId: string;
  flowNodeInstances: TimedFlowNodeInstance[];
  overlaySettings?: OverlaySettingsState;
  onClose: () => void;
  onInstanceSelect?: (instanceKey: string) => void;
  selectedFlowNodeInstanceKey?: string | null; // Current selection key from parent
  viewer: any; // bpmn-js viewer instance for positioning and highlighting
  /** When set, the selected element is a businessRuleTask referencing this decision. */
  calledDecisionId?: string | null;
  /** Called when the user clicks "View Decision" for a businessRuleTask. */
  onViewDecision?: (decisionId: string) => void;
}

export default function FlowNodeDetailPopup({
  elementId,
  flowNodeInstances,
  overlaySettings,
  onClose,
  onInstanceSelect,
  selectedFlowNodeInstanceKey,
  viewer,
  calledDecisionId,
  onViewDecision,
}: Readonly<FlowNodeDetailPopupProps>) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [showJsonModal, setShowJsonModal] = useState(false);
  const [elementPosition, setElementPosition] = useState<{ x: number; y: number } | null>(null);

  // Filter instances for this element (memoized to prevent infinite loop)
  const instances = useMemo(() =>
    filterFlowNodeInstancesByElementId(flowNodeInstances, elementId),
    [flowNodeInstances, elementId]
  );

  // Compute selected instance from key (no local state!)
  const selectedInstance = useMemo(() => {
    const fullInstance = findInstanceByKey(selectedFlowNodeInstanceKey || null, flowNodeInstances);
    // Return the instance if it matches this element, otherwise default to first
    if (fullInstance && instances.includes(fullInstance)) {
      return fullInstance;
    }
    return instances[0] || null;
  }, [selectedFlowNodeInstanceKey, flowNodeInstances, instances]);

  // Derive selected index from the selected instance
  const selectedIndex = useMemo(() => {
    if (!selectedInstance || instances.length === 0) return 0;
    const index = instances.indexOf(selectedInstance);
    return index !== -1 ? index : 0;
  }, [selectedInstance, instances]);

  // Generate keys for each instance in the dropdown
  const instanceKeys = useMemo(() => {
    return instances.map((inst) => {
      return generateFlowNodeInstanceKey(inst);
    });
  }, [instances]);

  // Handle dropdown change - notify parent with the instance key
  const handleDropdownChange = useCallback((index: number) => {
    if (onInstanceSelect && instanceKeys[index]) {
      onInstanceSelect(instanceKeys[index]);
    }
  }, [onInstanceSelect, instanceKeys]);

  // Get element position in diagram for line drawing and update on viewport changes
  useEffect(() => {
    if (!viewer || !elementId) return;

    const updatePosition = () => {
      try {
        const elementRegistry = viewer.get?.('elementRegistry');
        const canvas = viewer.get?.('canvas');

        if (!elementRegistry || !canvas) return;

        const element = elementRegistry.get(elementId);
        if (!element) return;

        // Get the canvas container to find its screen position
        const container = canvas.getContainer?.();
        if (!container) return;

        const containerRect = container.getBoundingClientRect();

        // Get element center in viewport coordinates
        const viewbox = canvas.viewbox();
        const zoom = viewbox.scale || 1;

        // Element coordinates (center)
        const centerX = element.x + element.width / 2;
        const centerY = element.y + element.height / 2;

        // Transform to viewport coordinates (relative to canvas SVG)
        const viewportX = (centerX - viewbox.x) * zoom;
        const viewportY = (centerY - viewbox.y) * zoom;

        // Add canvas container offset to get actual screen coordinates
        const screenX = containerRect.left + viewportX;
        const screenY = containerRect.top + viewportY;

        setElementPosition({ x: screenX, y: screenY });
      } catch (error) {
        console.error('[FlowNodeDetailPopup] Error getting element position:', error);
      }
    };

    // Initial position
    updatePosition();

    // Listen for viewport changes (zoom, pan)
    const eventBus = viewer.get?.('eventBus');
    if (eventBus) {
      eventBus.on('canvas.viewbox.changed', updatePosition);
    }

    // Listen for window resize
    window.addEventListener('resize', updatePosition);

    return () => {
      if (eventBus) {
        eventBus.off('canvas.viewbox.changed', updatePosition);
      }
      window.removeEventListener('resize', updatePosition);
    };
  }, [viewer, elementId]);

  // Highlight selected element in diagram
  useEffect(() => {
    if (!viewer || !elementId) return;

    try {
      const canvas = viewer.get?.('canvas');
      if (!canvas) return;

      // Check if element exists in the diagram before adding marker
      // Synthetic subprocess nodes won't have a corresponding element
      const elementRegistry = viewer.get?.('elementRegistry');
      const element = elementRegistry?.get?.(elementId);
      if (!element) {
        // Element doesn't exist in diagram (e.g., synthetic subprocess node)
        return;
      }

      // Add marker to element
      canvas.addMarker(elementId, 'taktx-selected-element');

      return () => {
        try {
          canvas.removeMarker(elementId, 'taktx-selected-element');
        } catch {}
      };
    } catch (error) {
      console.error('[FlowNodeDetailPopup] Error highlighting element:', error);
    }
  }, [viewer, elementId]);

  // Note: No click-outside handler - selection should only be cleared by explicit toggle
  // The popup will remain visible as long as there's a selection

  if (instances.length === 0) {
    return null;
  }

  // Extract instance details
  const getInstanceDetails = (instance: TimedFlowNodeInstance) => {
    const update = instance.flowNodeInstanceUpdate || {};
    const flowNode = update.flowNodeInstance || {};

    const rawState = flowNode.state;
    const stateName = typeof rawState === 'object' && rawState !== null && 'name' in rawState
      ? (rawState as any).name
      : rawState;

    return {
      elementInstanceId: flowNode.elementInstanceId,
      state: String(stateName || 'UNKNOWN'),
      elementName: instance.elementName,
      elementId: instance.elementId,
      startTime: instance.timestamp,
      endTime: update.endTime,
    };
  };

  const details = getInstanceDetails(selectedInstance);
  const stateColor = getStateColor(details.state, overlaySettings);

  // Format JSON for modal
  const jsonData = JSON.stringify(selectedInstance.flowNodeInstanceUpdate, null, 2);

  return (
    <>
      {/* CSS for element highlight marker */}
      <style>{`
        .taktx-selected-element .djs-visual > :nth-child(1) {
          stroke: #1677ff !important;
          stroke-width: 4px !important;
          filter: drop-shadow(0 0 8px rgba(22, 119, 255, 0.8));
        }
      `}</style>

      {/* Connection line - simple HTML overlay */}
      {elementPosition && popupRef.current && (() => {
        const popupRect = popupRef.current.getBoundingClientRect();
        const parentRect = popupRef.current.offsetParent?.getBoundingClientRect();

        if (!parentRect) return null;

        // Get element dimensions from viewer
        const elementRegistry = viewer?.get?.('elementRegistry');
        const element = elementRegistry?.get?.(elementId);
        const elementWidth = element?.width || 40;
        const elementHeight = element?.height || 40;

        // Calculate element position relative to parent container (center point)
        const elementX = elementPosition.x - parentRect.left;
        const elementY = elementPosition.y - parentRect.top;

        // Calculate popup position relative to parent container
        const popupX = popupRect.left - parentRect.left;
        const popupY = popupRect.top - parentRect.top;
        const popupCenterX = popupX + popupRect.width / 2;
        const popupCenterY = popupY + popupRect.height / 2;

        // Calculate direction vector from element center to popup center
        const dx = popupCenterX - elementX;
        const dy = popupCenterY - elementY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance === 0) return null;

        // Normalize direction
        const dirX = dx / distance;
        const dirY = dy / distance;

        // Calculate intersection with element rectangle bounds
        // Element bounds (center is at elementX, elementY)
        const elementLeft = elementX - elementWidth / 2;
        const elementRight = elementX + elementWidth / 2;
        const elementTop = elementY - elementHeight / 2;
        const elementBottom = elementY + elementHeight / 2;

        // Find intersection point with element rectangle
        let startX, startY;

        // Calculate intersection with each edge and find the closest one in the direction
        const intersections = [];

        // Right edge
        if (dirX > 0) {
          const t = (elementRight - elementX) / dirX;
          const y = elementY + dirY * t;
          if (y >= elementTop && y <= elementBottom) {
            intersections.push({ x: elementRight, y, distance: t });
          }
        }

        // Left edge
        if (dirX < 0) {
          const t = (elementLeft - elementX) / dirX;
          const y = elementY + dirY * t;
          if (y >= elementTop && y <= elementBottom) {
            intersections.push({ x: elementLeft, y, distance: t });
          }
        }

        // Bottom edge
        if (dirY > 0) {
          const t = (elementBottom - elementY) / dirY;
          const x = elementX + dirX * t;
          if (x >= elementLeft && x <= elementRight) {
            intersections.push({ x, y: elementBottom, distance: t });
          }
        }

        // Top edge
        if (dirY < 0) {
          const t = (elementTop - elementY) / dirY;
          const x = elementX + dirX * t;
          if (x >= elementLeft && x <= elementRight) {
            intersections.push({ x, y: elementTop, distance: t });
          }
        }

        // Use the closest intersection (smallest positive t)
        if (intersections.length > 0) {
          intersections.sort((a, b) => a.distance - b.distance);
          startX = intersections[0].x;
          startY = intersections[0].y;
        } else {
          // Fallback: use element center
          startX = elementX;
          startY = elementY;
        }

        // Find edge point on popup (end of line)
        let endX, endY;

        // Determine which edge of the popup to connect to based on angle
        const angle = Math.atan2(dy, dx);
        const absAngle = Math.abs(angle);

        if (absAngle < Math.PI / 4) {
          // Connect to left edge
          endX = popupX;
          endY = popupCenterY;
        } else if (absAngle > 3 * Math.PI / 4) {
          // Connect to right edge
          endX = popupX + popupRect.width;
          endY = popupCenterY;
        } else if (angle > 0) {
          // Connect to bottom edge
          endX = popupCenterX;
          endY = popupY + popupRect.height;
        } else {
          // Connect to top edge
          endX = popupCenterX;
          endY = popupY;
        }

        // Calculate line length and angle from start to end
        const lineDx = endX - startX;
        const lineDy = endY - startY;
        const lineLength = Math.sqrt(lineDx * lineDx + lineDy * lineDy);
        const lineAngle = Math.atan2(lineDy, lineDx) * 180 / Math.PI;

        return (
          <div style={{
            position: 'absolute',
            left: `${startX}px`,
            top: `${startY}px`,
            width: `${lineLength}px`,
            height: '2px',
            background: 'linear-gradient(to right, #1677ff 50%, transparent 50%)',
            backgroundSize: '8px 2px',
            transform: `rotate(${lineAngle}deg)`,
            transformOrigin: '0 50%',
            pointerEvents: 'none',
            zIndex: 999,
            opacity: 0.7,
            willChange: 'transform, left, top, width',
            backfaceVisibility: 'hidden',
          }} />
        );
      })()}

      {/* Popup container */}
      <div
        ref={popupRef}
        style={{
          position: 'absolute',
          bottom: '16px',
          right: '16px',
          zIndex: 1000,
          width: '280px',
          backgroundColor: '#fff',
          border: '1px solid #d9d9d9',
          borderRadius: '6px',
          boxShadow: '0 2px 12px rgba(0, 0, 0, 0.15)',
          fontSize: '12px',
          animation: 'popupSlideIn 0.2s ease-out',
        }}
      >
        <style>{`
          @keyframes popupSlideIn {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>

        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          borderBottom: '1px solid #f0f0f0',
          backgroundColor: '#fafafa',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: stateColor,
            }} />
            <span style={{ fontWeight: 600, fontSize: '12px' }}>
              {details.elementName || details.elementId}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '2px' }}>
            {calledDecisionId && onViewDecision && (
              <Tooltip title={`View DMN decision: ${calledDecisionId}`}>
                <Button
                  type="text"
                  size="small"
                  icon={<ApartmentOutlined style={{ fontSize: '12px', color: '#eb2f96' }} />}
                  onClick={() => onViewDecision(calledDecisionId)}
                  style={{ padding: '2px 4px', height: 'auto' }}
                />
              </Tooltip>
            )}
            <Tooltip title="View JSON Details">
              <Button
                type="text"
                size="small"
                icon={<FileTextOutlined style={{ fontSize: '12px' }} />}
                onClick={() => setShowJsonModal(true)}
                style={{ padding: '2px 4px', height: 'auto' }}
              />
            </Tooltip>
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined style={{ fontSize: '12px' }} />}
              onClick={onClose}
              style={{ padding: '2px 4px', height: 'auto' }}
            />
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '8px 10px' }}>
          {/* Instance selector (compact) */}
          {instances.length > 1 && (
            <div style={{ marginBottom: '6px' }}>
              <Select
                value={selectedIndex}
                onChange={handleDropdownChange}
                style={{ width: '100%' }}
                size="small"
                placeholder={`${instances.length} instances`}
                options={instances.map((inst, idx) => {
                  const instDetails = getInstanceDetails(inst);
                  const instStateColor = getStateColor(instDetails.state, overlaySettings);
                  return {
                    value: idx,
                    label: (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                        <div style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          backgroundColor: instStateColor,
                        }} />
                        <span>{instDetails.state}</span>
                      </div>
                    ),
                  };
                })}
              />
            </div>
          )}

          {/* Compact details grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: '4px', fontSize: '11px' }}>
            <span style={{ color: '#8c8c8c' }}>ID:</span>
            <span style={{ fontFamily: 'monospace', fontSize: '10px' }}>{details.elementInstanceId ?? '—'}</span>

            <span style={{ color: '#8c8c8c' }}>Element:</span>
            <span style={{ fontFamily: 'monospace', fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {details.elementId}
            </span>

            <span style={{ color: '#8c8c8c' }}>Started:</span>
            <span style={{ fontSize: '10px' }}>{formatTimestampWithMs(details.startTime)}</span>

            {details.endTime && (
              <>
                <span style={{ color: '#8c8c8c' }}>Ended:</span>
                <span style={{ fontSize: '10px' }}>{formatTimestampWithMs(details.endTime)}</span>
              </>
            )}
          </div>

          {/* View Decision footer — shown for businessRuleTask elements */}
          {calledDecisionId && onViewDecision && (
            <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px solid #f0f0f0' }}>
              <Button
                type="link"
                size="small"
                icon={<ApartmentOutlined style={{ fontSize: '11px' }} />}
                onClick={() => onViewDecision(calledDecisionId)}
                style={{ padding: 0, height: 'auto', fontSize: '11px', color: '#eb2f96' }}
              >
                View Decision: {calledDecisionId}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* JSON Detail Modal */}
      <Modal
        title="Flow Node Instance Details (JSON)"
        open={showJsonModal}
        onCancel={() => setShowJsonModal(false)}
        footer={[
          <Button key="copy" onClick={() => {
            navigator.clipboard.writeText(jsonData);
          }}>
            Copy JSON
          </Button>,
          <Button key="close" type="primary" onClick={() => setShowJsonModal(false)}>
            Close
          </Button>,
        ]}
        width={800}
      >
        <pre style={{
          maxHeight: '600px',
          overflow: 'auto',
          backgroundColor: '#f5f5f5',
          padding: '12px',
          borderRadius: '4px',
          fontSize: '12px',
          margin: 0,
        }}>
          {jsonData}
        </pre>
      </Modal>
    </>
  );
}

