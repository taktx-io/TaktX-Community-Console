/**
 * Generic Badge Layer for BPMN Elements
 *
 * Displays colored pill-shaped badges on element corners showing counts/metrics.
 * Supports multiple badge positions and dynamic sizing based on content.
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { AggregateBadgeSettings, InstanceBadgeSettings } from '../BadgeSettings';

export type BadgePosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface ElementBadge {
  elementId: string;
  position: BadgePosition;
  // Optional semantic type — if present we will force the badge to a fixed corner
  // allowed values: 'started' | 'completed' | 'aborted' | 'active' | 'incident' | 'count'
  type?: 'started' | 'completed' | 'aborted' | 'active' | 'incident' | 'count';
  text: string;
  color: string;
  backgroundColor: string;
  tooltip?: string; // Optional tooltip text
}

export interface BadgeLayerConfig {
  id: string;
  name: string;
  enabled: boolean;
  zIndex: number;
}

export interface BadgeDataSource {
  subscribe: (callback: (badges: ElementBadge[]) => void) => () => void;
  getBadges: () => ElementBadge[];
}

export interface BadgeColors {
  incomingColor: string;
  outgoingColor: string;
  abortedColor: string;
}

interface BpmnBadgeLayerProps {
  viewer: any;
  dataSource: BadgeDataSource;
  enabled: boolean;
  config: BadgeLayerConfig;
  colors?: BadgeColors;
  aggregateBadgeSettings?: AggregateBadgeSettings;
  instanceBadgeSettings?: InstanceBadgeSettings;
  processInstanceId?: string | null; // To determine which view mode
}

const BADGE_LAYER_ID_PREFIX = 'taktx-badge-layer';

export default function BpmnBadgeLayer({
  viewer,
  dataSource,
  enabled,
  config,
  aggregateBadgeSettings,
  instanceBadgeSettings,
  processInstanceId,
}: Readonly<BpmnBadgeLayerProps>) {
  const badgeLayerRef = useRef<SVGGElement | null>(null);
  const badgeElementsRef = useRef<Map<string, SVGGElement>>(new Map());
  const viewportWarningShownRef = useRef<boolean>(false);
  const [badges, setBadges] = useState<ElementBadge[]>([]);

  const BADGE_LAYER_ID = `${BADGE_LAYER_ID_PREFIX}-${config.id}`;

  // Check if element is in the current visible plane (subprocess or parent)
  const isElementInCurrentPlane = useCallback((elementId: string): boolean => {
    if (!viewer) return false;

    const canvas = viewer.get?.('canvas');
    const registry = viewer.get?.('elementRegistry');
    if (!canvas || !registry) return false;

    const element = registry.get(elementId);
    if (!element) return false;

    // Get current root element (the currently visible plane)
    const rootElement = canvas.getRootElement();
    if (!rootElement) return false;

    // Check if element has graphics - this is the primary check
    // Elements not in the current plane won't have graphics rendered
    const gfx = canvas.getGraphics?.(element);
    if (!gfx) return false;

    // Additional check: verify element is a descendant of current root
    // Walk up the parent chain to see if we reach the current root
    let currentElement = element;
    while (currentElement) {
      if (currentElement === rootElement) {
        return true; // Element is in current plane
      }
      currentElement = currentElement.parent;
    }

    return false; // Element is not in current plane
  }, [viewer]);

  // Determine if a badge should be visible based on settings
  const shouldShowBadge = useCallback((badge: ElementBadge): boolean => {
    // First check if element is in the current plane
    if (!isElementInCurrentPlane(badge.elementId)) {
      return false;
    }

    // Determine view mode based on whether a process instance is selected
    const isInstanceView = !!processInstanceId;
    const settings = isInstanceView ? instanceBadgeSettings : aggregateBadgeSettings;

    if (!settings) return true; // No settings = show all

    // Parse the count from badge text
    const count = parseInt(badge.text, 10);
    const isValidCount = !isNaN(count);

    // Check "only show when > 1" for instance view
    if (isInstanceView && instanceBadgeSettings?.onlyShowWhenGreaterThanOne) {
      if (isValidCount && count <= 1) return false;
    }

    // Check type-specific visibility
    if (isInstanceView && instanceBadgeSettings) {
      switch (badge.type) {
        case 'active':
          return instanceBadgeSettings.showActive;
        case 'started':
          return instanceBadgeSettings.showStarted;
        case 'completed':
          return instanceBadgeSettings.showCompleted;
        case 'aborted':
          return instanceBadgeSettings.showAborted;
        default:
          return true;
      }
    } else if (aggregateBadgeSettings) {
      const result = (() => {
        switch (badge.type) {
          case 'started':
            return aggregateBadgeSettings.showStarted;
          case 'completed':
            return aggregateBadgeSettings.showCompleted;
          case 'aborted':
            return aggregateBadgeSettings.showAborted;
          case 'active':
            return aggregateBadgeSettings.showActive;
          default:
            return true;
        }
      })();
      return result;
    }

    return true;
  }, [aggregateBadgeSettings, instanceBadgeSettings, processInstanceId, isElementInCurrentPlane]);

  // Subscribe to badge data source
  useEffect(() => {
    if (!enabled || !dataSource) return;

    const unsubscribe = dataSource.subscribe((newBadges) => {
      // Only update if badges actually changed (deep equality check)
      setBadges(prev => {
        if (prev.length !== newBadges.length) return newBadges;

        // Check if any badge changed
        const hasChanged = newBadges.some((newBadge, idx) => {
          const prevBadge = prev[idx];
          return !prevBadge ||
            prevBadge.elementId !== newBadge.elementId ||
            prevBadge.text !== newBadge.text ||
            prevBadge.color !== newBadge.color ||
            prevBadge.backgroundColor !== newBadge.backgroundColor ||
            prevBadge.position !== newBadge.position ||
            prevBadge.type !== newBadge.type;
        });

        return hasChanged ? newBadges : prev;
      });
    });

    return () => {
      unsubscribe();
    };
  }, [dataSource, enabled]);

  // Ensure badge layer exists
  const ensureBadgeLayer = useCallback(() => {
    if (!viewer) return null;
    const canvas = viewer.get?.('canvas');
    const container = canvas?.getContainer?.();
    if (!container) return null;

    // CRITICAL: Get the main canvas SVG, not overlay SVGs
    // The canvas container (.djs-container) should have the main SVG as a direct child
    // Overlays are typically in separate containers or nested within buttons

    // First, try to get SVG that's a direct child of the container
    const directSvg = Array.from(container.children).find(
      (child): child is SVGSVGElement => (child as Element).tagName.toLowerCase() === 'svg'
    );

    if (!directSvg) {
      console.error('[BpmnBadgeLayer] Could not find main canvas SVG as direct child of container');
      return null;
    }

    const svg = directSvg;

    // CRITICAL: Always attach to viewport group for proper coordinate transformation
    // Find the viewport - it should be a direct child of the SVG with class "viewport"
    let viewport = svg.querySelector(':scope > g.viewport') as SVGGElement | null;

    if (!viewport) {
      // Try alternative: any direct child g element with viewport in class name
      const directChildren = Array.from(svg.children) as Element[];
      viewport = directChildren.find(child => {
        return child.tagName.toLowerCase() === 'g' &&
               child.classList.contains('viewport');
      }) as SVGGElement | null;
    }

    if (!viewport) {
      // Last resort: find the first direct child g element
      const directChildren = Array.from(svg.children) as Element[];
      viewport = directChildren.find(child =>
        child.tagName.toLowerCase() === 'g'
      ) as SVGGElement | null;

      if (viewport) {
        console.warn('[BpmnBadgeLayer] Using first direct <g> child as viewport');
      }
    }

    if (!viewport) {
      // No viewport found - this should not happen in normal bpmn-js usage
      if (!viewportWarningShownRef.current) {
        console.error('[BpmnBadgeLayer] No viewport group found! SVG structure:',
          Array.from(svg.children).map(c => `<${c.tagName} class="${c.className}">`));
        viewportWarningShownRef.current = true;
      }
      return null;
    }

    // Search for existing layer ANYWHERE in the SVG (it might have been misplaced)
    let layer = svg.querySelector(`#${BADGE_LAYER_ID}`) as SVGGElement | null;

    // If layer exists but is not a direct child of viewport, remove it and recreate
    if (layer && viewport) {
      if ((layer.parentElement as Element | null) !== viewport) {
        console.warn('[BpmnBadgeLayer] Badge layer found attached to wrong parent:',
          layer.parentElement?.tagName,
          'class:', layer.parentElement?.getAttribute('class'),
          'id:', layer.parentElement?.getAttribute('id'));
        console.log('[BpmnBadgeLayer] Removing misplaced layer and recreating under viewport');
        layer.remove();
        layer = null;
      }
    }

    // Create layer if it doesn't exist
    if (!layer) {
      layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      layer.id = BADGE_LAYER_ID;
      // Allow pointer events for tooltips
      layer.style.pointerEvents = 'auto';

      // IMPORTANT: Append as last child of viewport so badges appear on top
      // but make sure we're appending to the viewport, not any other element
      viewport.appendChild(layer);

      console.log('[BpmnBadgeLayer] Created badge layer as direct child of viewport');
      console.log('[BpmnBadgeLayer] Viewport:', viewport.tagName, 'class:', viewport.className?.baseVal);
    }

    badgeLayerRef.current = layer;
    return layer;
  }, [BADGE_LAYER_ID, viewer]);

  // Fade out all badges (used on cleanup)
  const clearAllBadges = useCallback(() => {
    badgeElementsRef.current.forEach(badge => {
      badge.style.opacity = '0';
    });
  }, []);

  // Get badge position offset based on corner
  const getBadgeOffset = (position: BadgePosition, elementBounds: any): { x: number; y: number } => {
    const offsetX = 8; // Horizontal offset from corner
    const offsetY = 8; // Vertical offset from corner

    switch (position) {
      case 'top-left':
        return { x: elementBounds.x - offsetX, y: elementBounds.y - offsetY };
      case 'top-right':
        return { x: elementBounds.x + elementBounds.width + offsetX, y: elementBounds.y - offsetY };
      case 'bottom-left':
        return { x: elementBounds.x - offsetX, y: elementBounds.y + elementBounds.height + offsetY };
      case 'bottom-right':
        return { x: elementBounds.x + elementBounds.width + offsetX, y: elementBounds.y + elementBounds.height + offsetY };
    }
  };

  // Update badge content in-place (text, tooltip, and colors) without recreating
  const updateBadgeContent = (badgeGroup: SVGGElement, badge: ElementBadge) => {
    // Update text element
    const textElement = badgeGroup.querySelector('text');
    if (textElement) {
      if (textElement.textContent !== badge.text) {
        textElement.textContent = badge.text;
      }
      // Update text color
      if (textElement.getAttribute('fill') !== badge.color) {
        textElement.setAttribute('fill', badge.color);
      }
    }

    // Update background element (rect)
    const rectElement = badgeGroup.querySelector('rect');
    if (rectElement) {
      // Update background color
      if (rectElement.getAttribute('fill') !== badge.backgroundColor) {
        rectElement.setAttribute('fill', badge.backgroundColor);
      }
      // Update stroke color
      if (rectElement.getAttribute('stroke') !== badge.color) {
        rectElement.setAttribute('stroke', badge.color);
      }
    }

    // Update tooltip
    const titleElement = badgeGroup.querySelector('title');
    if (badge.tooltip) {
      if (titleElement) {
        titleElement.textContent = badge.tooltip;
      } else {
        const newTitle = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        newTitle.textContent = badge.tooltip;
        badgeGroup.insertBefore(newTitle, badgeGroup.firstChild);
      }
    } else if (titleElement) {
      titleElement.remove();
    }
  };

  // Create or update a badge for an element
  const createBadge = useCallback((badge: ElementBadge, shouldBeVisible: boolean = true) => {
    if (!viewer) return;

    const registry = viewer.get?.('elementRegistry');
    const canvas = viewer.get?.('canvas');
    if (!registry || !canvas) return;

    const element = registry.get(badge.elementId);
    if (!element) return;

    // CRITICAL: Check if element is in the current plane
    // This prevents badges from showing for collapsed subprocess contents
    // or parent elements when viewing a subprocess
    const rootElement = canvas.getRootElement();
    if (!rootElement) return;

    // Verify element is a descendant of current root
    let currentElement = element;
    let isInCurrentPlane = false;
    while (currentElement) {
      if (currentElement === rootElement) {
        isInCurrentPlane = true;
        break;
      }
      currentElement = currentElement.parent;
    }

    if (!isInCurrentPlane) {
      // Element is not in current plane - skip badge creation silently
      // (This is normal when viewing a subprocess - parent elements won't be in the plane)
      return;
    }

    // Check if element has graphics in the current view (plane)
    // If not, the element is not visible (e.g., it's in a different subprocess)
    const gfx = canvas.getGraphics?.(element);
    if (!gfx) {
      // Element not visible in current plane - skip badge creation
      return;
    }

    // Always ensure badge layer - this will detect and fix any misplacement
    const layer = ensureBadgeLayer();
    if (!layer) return;

    // Double-check that the layer is still attached to the correct parent
    if (!layer.parentElement) {
      console.error('[BpmnBadgeLayer] Layer has no parent! Re-ensuring layer.');
      badgeLayerRef.current = null;
      const newLayer = ensureBadgeLayer();
      if (!newLayer) return;
    }

    // Verify layer is attached to viewport of the MAIN canvas SVG
    const container = canvas.getContainer?.();
    if (container) {
      // Get the main SVG (direct child of container)
      const directSvg = Array.from(container.children).find(
        (child): child is SVGSVGElement => (child as Element).tagName.toLowerCase() === 'svg'
      );

      if (directSvg) {
        const viewport = directSvg.querySelector(':scope > g.viewport');
        if (viewport && (layer.parentElement as Element | null) !== viewport) {
          console.warn('[BpmnBadgeLayer] Layer parent mismatch detected during badge creation!');
          console.log('[BpmnBadgeLayer] Expected parent:', viewport.tagName, viewport.className);
          console.log('[BpmnBadgeLayer] Actual parent:', layer.parentElement?.tagName, layer.parentElement?.getAttribute('class'));
          // Force recreation
          badgeLayerRef.current = null;
          const newLayer = ensureBadgeLayer();
          if (!newLayer) return;
        }
      }
    }

    // Use element's actual coordinates from BPMN.js element model
    // Elements in BPMN.js have x, y, width, height properties
    const elementBounds = {
      x: element.x || 0,
      y: element.y || 0,
      width: element.width || 0,
      height: element.height || 0,
    };

    // Determine corner position — if badge.type is set, force a fixed corner mapping
    const mapTypeToPosition = (t?: ElementBadge['type']): BadgePosition | null => {
      switch (t) {
        case 'started':
          return 'top-left';
        case 'completed':
          return 'top-right';
        case 'aborted':
        case 'incident':
          return 'bottom-left';
        case 'active':
          return 'bottom-right';
        default:
          return 'top-left';
      }
    };

    const forcedPos = mapTypeToPosition(badge.type);
    const effectivePos: BadgePosition = forcedPos ?? badge.position;

    // Create unique key for this badge (use effectivePos so multiple types can occupy separate corners)
    const badgeKey = `${badge.elementId}-${effectivePos}`;

    // Remove existing badge if present
    const existingBadge = badgeElementsRef.current.get(badgeKey);
    if (existingBadge) {
      existingBadge.remove();
    }

    // Create badge group
    const badgeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    badgeGroup.setAttribute('class', 'taktx-badge');
    // Enable pointer events for this badge to show tooltip
    badgeGroup.style.pointerEvents = 'auto';
    badgeGroup.style.cursor = 'default';

    // Add smooth fade transition (250ms for smooth, noticeable animation)
    // The ease-in-out timing function ensures smooth reversals if toggling rapidly
    badgeGroup.style.transition = 'opacity 250ms ease-in-out';

    // Set initial visibility based on settings
    if (shouldBeVisible) {
      badgeGroup.style.opacity = '0'; // Start invisible for fade in
      badgeGroup.style.display = '';
    } else {
      badgeGroup.style.opacity = '0';
      badgeGroup.style.display = 'none';
    }

    // Add tooltip if provided
    if (badge.tooltip) {
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = badge.tooltip;
      badgeGroup.appendChild(title);
    }

    // Calculate badge position
    const offset = getBadgeOffset(effectivePos, elementBounds);

    // Measure text to calculate badge size
    const tempText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    tempText.textContent = badge.text;
    tempText.setAttribute('font-size', '11');
    tempText.setAttribute('font-family', 'Arial, sans-serif');
    tempText.setAttribute('font-weight', 'bold');
    tempText.style.visibility = 'hidden';
    layer.appendChild(tempText);
    const textBBox = tempText.getBBox();
    tempText.remove();

    // Badge dimensions
    const paddingX = 6;
    const paddingY = 3;
    const badgeWidth = textBBox.width + (paddingX * 2);
    const badgeHeight = textBBox.height + (paddingY * 2);
    const borderRadius = badgeHeight / 2; // Pill shape

    // Adjust position based on corner (anchor point)
    let badgeX = offset.x;
    let badgeY = offset.y;

    if (effectivePos.includes('right')) {
      badgeX -= badgeWidth; // Right-aligned badges
    }
    if (effectivePos.includes('bottom')) {
      badgeY -= badgeHeight; // Bottom-aligned badges
    }

    // Create pill-shaped background
    const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    background.setAttribute('x', String(badgeX));
    background.setAttribute('y', String(badgeY));
    background.setAttribute('width', String(badgeWidth));
    background.setAttribute('height', String(badgeHeight));
    background.setAttribute('rx', String(borderRadius));
    background.setAttribute('ry', String(borderRadius));
    background.setAttribute('fill', badge.backgroundColor);
    background.setAttribute('stroke', badge.color);
    background.setAttribute('stroke-width', '1');

    // Add drop shadow for depth
    background.style.filter = 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))';

    // Create text
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', String(badgeX + badgeWidth / 2));
    text.setAttribute('y', String(badgeY + badgeHeight / 2));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    text.setAttribute('font-size', '11');
    text.setAttribute('font-family', 'Arial, sans-serif');
    text.setAttribute('font-weight', 'bold');
    text.setAttribute('fill', badge.color);
    text.textContent = badge.text;

    // Add elements to group
    badgeGroup.appendChild(background);
    badgeGroup.appendChild(text);

    // Add to layer
    layer.appendChild(badgeGroup);

    // Store reference
    badgeElementsRef.current.set(badgeKey, badgeGroup);

    // Trigger fade-in animation only if badge should be visible
    if (shouldBeVisible) {
      // Use requestAnimationFrame to ensure the transition is applied
      requestAnimationFrame(() => {
        badgeGroup.style.opacity = '1';
      });
    }
  }, [ensureBadgeLayer, viewer]);

  // Update badges when data changes - just update opacity and text
  useEffect(() => {
    if (!enabled || !viewer) {
      // Fade out all badges when disabled
      badgeElementsRef.current.forEach(badge => {
        badge.style.opacity = '0';
      });
      return;
    }

    // Build map of current badge data
    const badgeDataMap = new Map<string, ElementBadge>();

    badges.forEach(badge => {
      const mapTypeToPosition = (t?: ElementBadge['type']): BadgePosition | null => {
        switch (t) {
          case 'started': return 'top-left';
          case 'completed': return 'top-right';
          case 'aborted':
          case 'incident': return 'bottom-left';
          case 'active': return 'bottom-right';
          default: return 'top-left';
        }
      };
      const forcedPos = mapTypeToPosition(badge.type);
      const effectivePos: BadgePosition = forcedPos ?? badge.position;
      const badgeKey = `${badge.elementId}-${effectivePos}`;

      badgeDataMap.set(badgeKey, badge);
    });

    // Update all existing badges
    badgeElementsRef.current.forEach((badgeElement, key) => {
      const badgeData = badgeDataMap.get(key);

      if (badgeData) {
        // Check if badge should be shown based on settings
        const isVisible = shouldShowBadge(badgeData);

        if (isVisible) {
          // Badge should be visible - update content and fade in
          updateBadgeContent(badgeElement, badgeData);
          badgeElement.style.opacity = '1';
          badgeElement.style.display = '';
        } else {
          // Badge should be hidden by settings - hide immediately
          badgeElement.style.display = 'none';
        }
      } else {
        // Badge should be hidden (count is 0) - fade out
        badgeElement.style.opacity = '0';
      }
    });

    // Create any new badges that don't exist yet
    badgeDataMap.forEach((badge, key) => {
      if (!badgeElementsRef.current.has(key)) {
        const isVisible = shouldShowBadge(badge);
        createBadge(badge, isVisible);
      }
    });
  }, [badges, enabled, viewer, shouldShowBadge, createBadge]);

  // Initialize and cleanup
  useEffect(() => {
    if (!viewer) return;
    ensureBadgeLayer();

    return () => {
      clearAllBadges();
    };
  }, [viewer, ensureBadgeLayer, clearAllBadges]);

  // Clear on disable
  useEffect(() => {
    if (!enabled) {
      clearAllBadges();
    }
  }, [enabled, clearAllBadges]);

  // Listen for subprocess navigation (root.set) and force badge recreation
  useEffect(() => {
    if (!viewer || !enabled) return;

    const eventBus = viewer.get?.('eventBus');
    if (!eventBus) return;

    const handleRootChange = () => {
      const canvas = viewer.get?.('canvas');
      const rootElement = canvas?.getRootElement?.();
      console.log('[BpmnBadgeLayer] Root changed to:', rootElement?.id, rootElement?.$type);
      console.log('[BpmnBadgeLayer] Recreating badges for new plane');

      // Clear all existing badges
      badgeElementsRef.current.forEach(badge => {
        badge.remove();
      });
      badgeElementsRef.current.clear();

      // Recreate the badge layer (it needs to be in the new viewport)
      badgeLayerRef.current = null;
      ensureBadgeLayer();

      // Trigger badge recreation by requesting fresh data
      if (dataSource) {
        const currentBadges = dataSource.getBadges();
        console.log('[BpmnBadgeLayer] Badge data has', currentBadges.length, 'total badges');
        setBadges(currentBadges);
      }
    };

    eventBus.on('root.set', handleRootChange);

    return () => {
      eventBus.off('root.set', handleRootChange);
    };
  }, [viewer, enabled, dataSource, ensureBadgeLayer]);

  // Periodic check to ensure badge layer stays properly attached
  useEffect(() => {
    if (!viewer || !enabled) return;

    const checkLayerAttachment = () => {
      if (!badgeLayerRef.current) return;

      const canvas = viewer.get?.('canvas');
      const container = canvas?.getContainer?.();
      if (!container) return;

      // Get the main canvas SVG (direct child of container)
      const directSvg = Array.from(container.children).find(
        (child): child is SVGSVGElement => (child as Element).tagName.toLowerCase() === 'svg'
      );

      if (!directSvg) return;

      const viewport = directSvg.querySelector(':scope > g.viewport');

      if (!viewport) return;

      // Check if layer is still properly attached
      if (badgeLayerRef.current.parentElement !== viewport) {
        console.warn('[BpmnBadgeLayer] Layer became detached! Current parent:',
          badgeLayerRef.current.parentElement?.tagName,
          'class:', badgeLayerRef.current.parentElement?.getAttribute('class'),
          'id:', badgeLayerRef.current.parentElement?.getAttribute('id'));

        // Force recreation
        badgeLayerRef.current = null;
        ensureBadgeLayer();
      }
    };

    // Check every 2 seconds
    const interval = setInterval(checkLayerAttachment, 2000);

    return () => {
      clearInterval(interval);
    };
  }, [viewer, enabled, ensureBadgeLayer]);

  return null;
}
