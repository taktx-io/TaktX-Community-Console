/**
 * Zeebe Template Icon Layer
 *
 * Renders custom template icons from zeebe:modelerTemplateIcon attributes
 * on BPMN elements (service tasks, user tasks, etc.) that have Zeebe templates.
 *
 * Icons are positioned in the top-left corner of elements at 18x18px size,
 * with tooltips showing template metadata.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { getTemplateIcon, hasZeebeTemplate, getTemplateMetadata } from '@/lib/utils/zeebeTemplateIcons';

interface TemplateIcon {
  elementId: string;
  svg: string;
  isDefault: boolean;
  tooltip: string;
  x: number;
  y: number;
}

interface ZeebeTemplateIconLayerProps {
  viewer: any;
  enabled?: boolean;
  iconSize?: number; // Size in pixels at 100% zoom
}

const ICON_LAYER_ID = 'taktx-zeebe-template-icon-layer';
const ICON_OFFSET = 4; // Offset from top-left corner in pixels
const DEFAULT_ICON_SIZE = 18; // Default icon size in pixels

export default function ZeebeTemplateIconLayer({
  viewer,
  enabled = true,
  iconSize = DEFAULT_ICON_SIZE,
}: Readonly<ZeebeTemplateIconLayerProps>) {
  const iconLayerRef = useRef<SVGGElement | null>(null);
  const iconElementsRef = useRef<Map<string, SVGGElement>>(new Map());
  const [viewerReady, setViewerReady] = useState(false);

  // Ensure icon layer exists in the SVG
  const ensureIconLayer = () => {
    if (!viewer) return null;

    const canvas = viewer.get?.('canvas');
    const container = canvas?.getContainer?.();
    if (!container) return null;

    const svg = container.querySelector('svg');
    if (!svg) return null;

    const viewport = svg.querySelector('g.viewport') as SVGGElement | null;
    const parent = viewport ?? svg;

    let layer = parent.querySelector(`#${ICON_LAYER_ID}`) as SVGGElement | null;
    if (!layer) {
      layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      layer.id = ICON_LAYER_ID;
      layer.style.pointerEvents = 'auto'; // Allow tooltips

      // Insert layer before badges/overlays but after the diagram
      // Find the first overlay layer and insert before it, or append if none
      const firstOverlay = parent.querySelector('[id*="badge-layer"], [id*="heatmap-layer"]');
      if (firstOverlay) {
        firstOverlay.before(layer);
      } else {
        parent.appendChild(layer);
      }
    }

    iconLayerRef.current = layer;
    return layer;
  };

  // Extract template icons from all BPMN elements
  const extractTemplateIcons = (): TemplateIcon[] => {
    if (!viewer) return [];

    const elementRegistry = viewer.get?.('elementRegistry');
    if (!elementRegistry) return [];

    const icons: TemplateIcon[] = [];
    const elements = elementRegistry.getAll();

    elements.forEach((element: any) => {
      // Check if element has a business object with Zeebe template
      const businessObject = element.businessObject;
      if (!businessObject || !hasZeebeTemplate(businessObject)) {
        return;
      }

      // Only process shape elements (not connections/flows)
      if (!element.width || !element.height) {
        return;
      }

      // Support multiple element types with templates
      const elementType = businessObject.$type;
      const supportedTypes = [
        'bpmn:ServiceTask',
        'bpmn:UserTask',
        'bpmn:ScriptTask',
        'bpmn:BusinessRuleTask',
        'bpmn:SendTask',
        'bpmn:ReceiveTask',
        'bpmn:ManualTask',
      ];

      if (!supportedTypes.includes(elementType)) {
        return;
      }

      // Get template icon (cached or decoded)
      const iconData = getTemplateIcon(businessObject, true);
      const metadata = getTemplateMetadata(businessObject);

      // Build tooltip
      let tooltip = '';
      if (metadata.templateName) {
        tooltip = `Template: ${metadata.templateName}`;
        if (metadata.templateVersion) {
          tooltip += `\nVersion: ${metadata.templateVersion}`;
        }
      } else if (metadata.templateId) {
        tooltip = `Template ID: ${metadata.templateId}`;
      }

      // Calculate icon position (top-left corner with offset)
      const x = element.x + ICON_OFFSET;
      const y = element.y + ICON_OFFSET;

      icons.push({
        elementId: element.id,
        svg: iconData.svg,
        isDefault: iconData.isDefault,
        tooltip,
        x,
        y,
      });
    });

    return icons;
  };

  // Hide default bpmn-js task marker (small icon in top-left)
  const hideDefaultTaskMarker = (elementId: string) => {
    if (!viewer) return;

    const canvas = viewer.get?.('canvas');
    const elementRegistry = viewer.get?.('elementRegistry');
    if (!canvas || !elementRegistry) return;

    const element = elementRegistry.get(elementId);
    if (!element) return;

    // Get the graphics node for this element
    const gfx = canvas.getGraphics(element);
    if (!gfx) return;

    // Find the .djs-visual group which contains all the visual elements
    const visualGroup = gfx.querySelector('.djs-visual');
    if (!visualGroup) return;

    // In bpmn-js, task shapes are rendered as:
    // - rect: the main task box (we want to keep this)
    // - text: the task label (we want to keep this)
    // - path/circle/use: task type markers (we want to hide these!)

    // Simple approach: hide ALL non-rect, non-text elements in the visual group
    // These are the task type markers (gear for service task, user icon for user task, etc.)
    const markerElements = visualGroup.querySelectorAll('path, circle, use, image, polygon');

    markerElements.forEach((el: Element) => {
      const svgEl = el as SVGElement;

      // Skip if already hidden
      if (svgEl.getAttribute('data-hidden-by-template') === 'true') return;

      // Hide this marker element
      svgEl.style.display = 'none';
      svgEl.setAttribute('data-hidden-by-template', 'true');
    });
  };

  // Show default bpmn-js task marker (restore when template icon is removed)
  const showDefaultTaskMarker = (elementId: string) => {
    if (!viewer) return;

    const canvas = viewer.get?.('canvas');
    const elementRegistry = viewer.get?.('elementRegistry');
    if (!canvas || !elementRegistry) return;

    const element = elementRegistry.get(elementId);
    if (!element) return;

    const gfx = canvas.getGraphics(element);
    if (!gfx) return;

    const visualGroup = gfx.querySelector('.djs-visual');
    if (!visualGroup) return;

    // Restore hidden markers
    const hiddenMarkers = visualGroup.querySelectorAll('[data-hidden-by-template="true"]');
    hiddenMarkers.forEach((marker: Element) => {
      const markerElement = marker as SVGElement;
      markerElement.style.display = '';
      markerElement.removeAttribute('data-hidden-by-template');
    });
  };

  // Create or update an icon element
  const createIcon = (icon: TemplateIcon) => {
    if (!viewer) return;

    const layer = ensureIconLayer();
    if (!layer) return;

    // Remove existing icon if present
    const existingIcon = iconElementsRef.current.get(icon.elementId);
    if (existingIcon) {
      existingIcon.remove();
    }

    // Hide the default bpmn-js task marker for this element
    hideDefaultTaskMarker(icon.elementId);

    // Create icon group
    const iconGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    iconGroup.setAttribute('class', 'taktx-template-icon');
    iconGroup.dataset.elementId = icon.elementId;
    iconGroup.style.pointerEvents = 'auto';
    iconGroup.style.cursor = 'default';

    // Position the group
    iconGroup.setAttribute('transform', `translate(${icon.x}, ${icon.y})`);

    // Add tooltip
    if (icon.tooltip) {
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = icon.tooltip;
      iconGroup.appendChild(title);

      // Add aria-label for accessibility
      iconGroup.setAttribute('aria-label', icon.tooltip);
      iconGroup.setAttribute('role', 'img');
    }

    // Create a container for the SVG icon
    const iconContainer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    iconContainer.setAttribute('class', 'icon-content');

    // Parse and inject the SVG content
    try {
      // Create a temporary div to parse the SVG
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = icon.svg;
      const svgElement = tempDiv.querySelector('svg');

      if (svgElement) {
        // Copy SVG attributes
        const viewBox = svgElement.getAttribute('viewBox');
        if (viewBox) {
          iconContainer.setAttribute('viewBox', viewBox);
        }

        // Set fixed size
        iconContainer.setAttribute('width', String(iconSize));
        iconContainer.setAttribute('height', String(iconSize));

        // Copy all child elements from parsed SVG
        Array.from(svgElement.children).forEach((child) => {
          const clonedChild = child.cloneNode(true);
          iconContainer.appendChild(clonedChild);
        });

        // Add subtle drop shadow for visual consistency with badges
        iconContainer.style.filter = 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))';

        iconGroup.appendChild(iconContainer);
      } else {
        console.warn('[ZeebeTemplateIconLayer] Failed to parse SVG for element:', icon.elementId);
        return;
      }
    } catch (error) {
      console.error('[ZeebeTemplateIconLayer] Error creating icon:', error);
      return;
    }

    // Add to layer
    layer.appendChild(iconGroup);

    // Store reference
    iconElementsRef.current.set(icon.elementId, iconGroup);
  };

  // Render all template icons
  const renderIcons = () => {
    if (!enabled || !viewer) {
      clearAllIcons();
      return;
    }

    const icons = extractTemplateIcons();

    // Remove icons for elements that no longer have templates
    const currentElementIds = new Set(icons.map(i => i.elementId));
    iconElementsRef.current.forEach((iconElement, elementId) => {
      if (!currentElementIds.has(elementId)) {
        // Restore default marker before removing custom icon
        showDefaultTaskMarker(elementId);
        iconElement.remove();
        iconElementsRef.current.delete(elementId);
      }
    });

    // Create or update icons
    icons.forEach(icon => {
      createIcon(icon);
    });
  };

  // Clear all icons
  const clearAllIcons = () => {
    iconElementsRef.current.forEach((iconElement, elementId) => {
      // Restore default marker for each element
      showDefaultTaskMarker(elementId);
      iconElement.remove();
    });
    iconElementsRef.current.clear();
  };

  // Update icon positions on zoom/pan (sync with BPMN elements)
  const updateIconPositions = () => {
    if (!viewer || !enabled) return;

    const elementRegistry = viewer.get?.('elementRegistry');
    if (!elementRegistry) return;

    iconElementsRef.current.forEach((iconElement, elementId) => {
      const element = elementRegistry.get(elementId);
      if (!element) {
        // Element removed, remove icon
        iconElement.remove();
        iconElementsRef.current.delete(elementId);
        return;
      }

      // Update position
      const x = element.x + ICON_OFFSET;
      const y = element.y + ICON_OFFSET;
      iconElement.setAttribute('transform', `translate(${x}, ${y})`);
    });
  };

  // Initialize layer when viewer becomes ready
  useEffect(() => {
    if (!viewer) return;

    // Wait a bit for viewer to fully initialize
    const timer = setTimeout(() => {
      setViewerReady(true);
      ensureIconLayer();
    }, 100);

    return () => clearTimeout(timer);
  }, [viewer]);

  // Render icons when viewer is ready or enabled state changes
  useEffect(() => {
    if (!viewerReady) return;

    renderIcons();

    // Listen for diagram changes (import, element updates)
    if (viewer) {
      const eventBus = viewer.get?.('eventBus');
      if (eventBus) {
        const handleImport = () => {
          setTimeout(() => renderIcons(), 100);
        };

        const handleElementsChanged = () => {
          updateIconPositions();
        };

        const handleCanvasViewbox = () => {
          updateIconPositions();
        };

        eventBus.on('import.done', handleImport);
        eventBus.on('elements.changed', handleElementsChanged);
        eventBus.on('canvas.viewbox.changed', handleCanvasViewbox);

        return () => {
          eventBus.off('import.done', handleImport);
          eventBus.off('elements.changed', handleElementsChanged);
          eventBus.off('canvas.viewbox.changed', handleCanvasViewbox);
        };
      }
    }
  }, [viewerReady, enabled, viewer, iconSize]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearAllIcons();
      if (iconLayerRef.current) {
        iconLayerRef.current.remove();
      }
    };
  }, []);

  return null; // This component doesn't render React elements
}

