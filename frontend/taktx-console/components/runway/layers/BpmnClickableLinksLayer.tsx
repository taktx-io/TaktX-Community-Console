/**
 * BPMN Clickable Links Layer
 *
 * Provides interactive click handlers for BPMN elements:
 * - Call Activities: Navigate to parent/child process instances
 * - Subprocesses: Expand/collapse or drill-down navigation
 * - Custom navigation behaviors for process execution flow
 */

'use client';

import { useCallback, useEffect, useRef } from 'react';

export interface ClickableLink {
  elementId: string;
  linkType: 'parent-instance' | 'child-instance' | 'subprocess-expand' | 'call-activity';
  targetInstanceId?: string;
  label?: string;
  icon?: string;
}

interface BpmnClickableLinksLayerProps {
  viewer: any;
  links: ClickableLink[];
  enabled?: boolean;
  onLinkClick?: (link: ClickableLink) => void;
}

const LINK_LAYER_ID = 'taktx-clickable-links-layer';

export default function BpmnClickableLinksLayer({
  viewer,
  links,
  enabled = true,
  onLinkClick,
}: Readonly<BpmnClickableLinksLayerProps>) {
  const linkElementsRef = useRef<Map<string, SVGGElement>>(new Map());
  const clickHandlersRef = useRef<Map<string, (e: MouseEvent) => void>>(new Map());

  // Ensure link layer exists
  const ensureLinkLayer = useCallback(() => {
    if (!viewer) return null;

    const canvas = viewer.get?.('canvas');
    const container = canvas?.getContainer?.();
    if (!container) return null;

    const svg = container.querySelector('svg');
    if (!svg) return null;

    const viewport = svg.querySelector('g.viewport') as SVGGElement | null;
    const parent = viewport ?? svg;

    let layer = parent.querySelector(`#${LINK_LAYER_ID}`) as SVGGElement | null;
    if (!layer) {
      layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      layer.id = LINK_LAYER_ID;
      layer.style.pointerEvents = 'auto';

      // Position layer on top of everything for click handling
      parent.appendChild(layer);
    }

    return layer;
  }, [viewer]);

  const clearAllLinks = useCallback(() => {
    linkElementsRef.current.forEach((overlay, elementId) => {
      const handler = clickHandlersRef.current.get(elementId);
      if (handler) {
        overlay.removeEventListener('click', handler);
        clickHandlersRef.current.delete(elementId);
      }
      overlay.remove();
    });
    linkElementsRef.current.clear();
  }, []);

  // Create clickable overlay for an element
  const createClickableOverlay = useCallback((link: ClickableLink) => {
    if (!viewer || !onLinkClick) return;

    const elementRegistry = viewer.get?.('elementRegistry');
    const canvas = viewer.get?.('canvas');
    if (!elementRegistry || !canvas) return;

    const element = elementRegistry.get(link.elementId);
    if (!element) return;

    const layer = ensureLinkLayer();
    if (!layer) return;

    // Remove existing overlay if present
    const existing = linkElementsRef.current.get(link.elementId);
    if (existing) {
      existing.remove();
      // Remove old click handler
      const oldHandler = clickHandlersRef.current.get(link.elementId);
      if (oldHandler) {
        existing.removeEventListener('click', oldHandler);
        clickHandlersRef.current.delete(link.elementId);
      }
    }

    // Create transparent overlay rect that covers the element
    const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    overlay.setAttribute('class', 'taktx-clickable-link');
    overlay.dataset.elementId = link.elementId;
    overlay.dataset.linkType = link.linkType;

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(element.x));
    rect.setAttribute('y', String(element.y));
    rect.setAttribute('width', String(element.width));
    rect.setAttribute('height', String(element.height));
    rect.setAttribute('fill', 'transparent');
    rect.setAttribute('stroke', '#1677ff');
    rect.setAttribute('stroke-width', '0');
    rect.setAttribute('stroke-dasharray', '5,5');
    rect.style.cursor = 'pointer';
    rect.style.transition = 'stroke-width 0.2s';

    // Add hover effect
    overlay.addEventListener('mouseenter', () => {
      rect.setAttribute('stroke-width', '2');
    });

    overlay.addEventListener('mouseleave', () => {
      rect.setAttribute('stroke-width', '0');
    });

    // Add click handler
    const clickHandler = (e: MouseEvent) => {
      e.stopPropagation();
      console.log('[BpmnClickableLinksLayer] Link clicked:', link);
      if (onLinkClick) {
        onLinkClick(link);
      }
    };

    overlay.addEventListener('click', clickHandler);
    clickHandlersRef.current.set(link.elementId, clickHandler);

    // Add tooltip
    if (link.label) {
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = link.label;
      overlay.appendChild(title);
    }

    overlay.appendChild(rect);

    // Add icon/badge to indicate it's clickable (top-right corner)
    if (link.linkType === 'parent-instance') {
      const icon = createLinkIcon(element.x + element.width - 20, element.y + 5);
      overlay.appendChild(icon);
    }

    layer.appendChild(overlay);
    linkElementsRef.current.set(link.elementId, overlay);
  }, [ensureLinkLayer, onLinkClick, viewer]);

  // Create link icon (arrow or chain link)
  const createLinkIcon = (x: number, y: number): SVGGElement => {
    const iconGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    iconGroup.setAttribute('transform', `translate(${x}, ${y})`);

    // Background circle
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '8');
    circle.setAttribute('cy', '8');
    circle.setAttribute('r', '8');
    circle.setAttribute('fill', '#1677ff');
    circle.setAttribute('opacity', '0.9');

    // Arrow icon (↑ for parent)
    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    arrow.setAttribute('d', 'M8 4 L8 12 M8 4 L5 7 M8 4 L11 7');
    arrow.setAttribute('stroke', 'white');
    arrow.setAttribute('stroke-width', '1.5');
    arrow.setAttribute('stroke-linecap', 'round');
    arrow.setAttribute('fill', 'none');

    iconGroup.appendChild(circle);
    iconGroup.appendChild(arrow);

    return iconGroup;
  };

  // Update overlays when links change
  useEffect(() => {
    if (!enabled || !viewer) {
      clearAllLinks();
      return;
    }

    // Remove overlays for elements no longer in links
    const currentElementIds = new Set(links.map(l => l.elementId));
    linkElementsRef.current.forEach((overlay, elementId) => {
      if (!currentElementIds.has(elementId)) {
        const handler = clickHandlersRef.current.get(elementId);
        if (handler) {
          overlay.removeEventListener('click', handler);
          clickHandlersRef.current.delete(elementId);
        }
        overlay.remove();
        linkElementsRef.current.delete(elementId);
      }
    });

    // Create/update overlays for current links
    links.forEach(link => {
      createClickableOverlay(link);
    });
  }, [links, enabled, viewer, createClickableOverlay, clearAllLinks]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearAllLinks();
    };
  }, [clearAllLinks]);

  return null;
}

