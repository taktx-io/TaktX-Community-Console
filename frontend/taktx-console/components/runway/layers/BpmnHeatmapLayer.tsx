/**
 * BPMN Heatmap Layer
 *
 * This is the EXACT original BpmnHeatmapOverlay code moved into a layer component.
 * NO changes to animation logic - just wrapped in a layer structure.
 * Now supports data sources for flexibility.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import type { AggregatedTrigger } from '@/lib/hooks/useBpmnHeatmap';
import type { OverlaySettingsState } from '../OverlaySettings';
import type { OverlayLayerConfig, HeatmapDataSource } from '@/lib/types/overlay-layers';

const FILTER_ID_OUTER = 'taktx-glow-outer';
const FILTER_ID_INNER = 'taktx-glow-inner';
const GLOW_LAYER_ID = 'taktx-glow-layer';

interface BpmnHeatmapLayerProps {
  viewer: any;
  // Support both direct triggers (backward compat) and data source (new way)
  triggers?: AggregatedTrigger[];
  dataSource?: HeatmapDataSource;
  enabled: boolean;
  settings: OverlaySettingsState;
  config: OverlayLayerConfig;
  debugTrigger?: { requestId: number; elementId?: string; eventType?: string } | null;
}

interface LineStack {
  stackLevel: number;
  fadeTimer: number | null;
  outerPath: SVGPathElement | null;
  innerPath: SVGPathElement | null;
  lastTriggerTime: number;
}

const getStackKey = (elementId: string, eventType: string): string => {
  let category: string;
  if (eventType === 'COMPLETED') {
    category = 'outgoing';
  } else if (eventType === 'ABORTED') {
    category = 'aborted';
  } else {
    category = 'incoming';
  }
  return `${elementId}:${category}`;
};

export default function BpmnHeatmapLayer({
  viewer,
  triggers: directTriggers,
  dataSource,
  enabled = true,
  settings,
  config,
  debugTrigger,
}: Readonly<BpmnHeatmapLayerProps>) {
  // EXACT COPY of all refs and state from original
  const glowLayerRef = useRef<SVGGElement | null>(null);
  const lineStacksRef = useRef<Map<string, LineStack>>(new Map());
  const processedTriggersRef = useRef<Map<string, number>>(new Map());
  const lastCleanupRef = useRef<number>(0);
  const decayIntervalRef = useRef<number | null>(null);

  const DECAY_CHECK_INTERVAL_MS = 100;
  const DECAY_TIME_MS = 2000;
  const MAX_ACTIVE_STACKS = 1000;
  const STACK_CLEANUP_INTERVAL_MS = 5000;

  const lastStackCleanupRef = useRef<number>(0);

  // State for triggers from data source
  const [dataSourceTriggers, setDataSourceTriggers] = useState<AggregatedTrigger[]>([]);

  // Subscribe to data source if provided
  useEffect(() => {
    if (!dataSource) return;

    const unsubscribe = dataSource.subscribe((newTriggers) => {
      setDataSourceTriggers(newTriggers);
    });

    return () => {
      unsubscribe();
    };
  }, [dataSource]);

  // Use triggers from data source if available, otherwise use direct triggers (backward compat)
  const triggers = dataSource ? dataSourceTriggers : (directTriggers || []);

  // EXACT COPY of interpolateColor from original
  const interpolateColor = (color1: string, color2: string, factor: number): string => {
    const c1 = {
      r: parseInt(color1.slice(1, 3), 16),
      g: parseInt(color1.slice(3, 5), 16),
      b: parseInt(color1.slice(5, 7), 16),
    };
    const c2 = {
      r: parseInt(color2.slice(1, 3), 16),
      g: parseInt(color2.slice(3, 5), 16),
      b: parseInt(color2.slice(5, 7), 16),
    };

    const r = Math.round(c1.r + (c2.r - c1.r) * factor);
    const g = Math.round(c1.g + (c2.g - c1.g) * factor);
    const b = Math.round(c1.b + (c2.b - c1.b) * factor);

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  };

  // EXACT COPY of updateFilters from original
  const updateFilters = () => {
    if (!viewer) return;
    const canvas = viewer.get?.('canvas');
    const container = canvas?.getContainer?.();
    if (!container) return;
    const svg = container.querySelector('svg');
    if (!svg) return;

    let defs = svg.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      svg.insertBefore(defs, svg.firstChild);
    }

    defs.querySelector(`#${FILTER_ID_OUTER}`)?.remove();
    defs.querySelector(`#${FILTER_ID_INNER}`)?.remove();

    const outerFilter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    outerFilter.id = FILTER_ID_OUTER;
    outerFilter.setAttribute('filterUnits', 'userSpaceOnUse');
    outerFilter.setAttribute('x', '-500%');
    outerFilter.setAttribute('y', '-500%');
    outerFilter.setAttribute('width', '1000%');
    outerFilter.setAttribute('height', '1000%');

    const outerBlur1 = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
    outerBlur1.setAttribute('stdDeviation', String(settings.glowIntensity));
    outerBlur1.setAttribute('result', 'blur1');

    const outerBlur2 = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
    outerBlur2.setAttribute('in', 'SourceGraphic');
    outerBlur2.setAttribute('stdDeviation', String(settings.glowIntensity * 0.67));
    outerBlur2.setAttribute('result', 'blur2');

    const outerMerge = document.createElementNS('http://www.w3.org/2000/svg', 'feMerge');
    ['blur1', 'blur1', 'blur2', 'SourceGraphic'].forEach(inp => {
      const node = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
      node.setAttribute('in', inp);
      outerMerge.appendChild(node);
    });

    outerFilter.append(outerBlur1, outerBlur2, outerMerge);
    defs.appendChild(outerFilter);

    const innerFilter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    innerFilter.id = FILTER_ID_INNER;
    innerFilter.setAttribute('filterUnits', 'userSpaceOnUse');
    innerFilter.setAttribute('x', '-500%');
    innerFilter.setAttribute('y', '-500%');
    innerFilter.setAttribute('width', '1000%');
    innerFilter.setAttribute('height', '1000%');

    const innerBlur1 = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
    innerBlur1.setAttribute('stdDeviation', String(settings.innerGlowIntensity));
    innerBlur1.setAttribute('result', 'blur1');

    const innerBlur2 = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
    innerBlur2.setAttribute('in', 'SourceGraphic');
    innerBlur2.setAttribute('stdDeviation', String(settings.innerGlowIntensity * 0.5));
    innerBlur2.setAttribute('result', 'blur2');

    const innerMerge = document.createElementNS('http://www.w3.org/2000/svg', 'feMerge');
    ['blur1', 'blur1', 'blur2', 'SourceGraphic'].forEach(inp => {
      const node = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
      node.setAttribute('in', inp);
      innerMerge.appendChild(node);
    });

    innerFilter.append(innerBlur1, innerBlur2, innerMerge);
    defs.appendChild(innerFilter);
  };

  // EXACT COPY of ensureGlowLayer from original
  const ensureGlowLayer = () => {
    if (!viewer) return;
    const canvas = viewer.get?.('canvas');
    const container = canvas?.getContainer?.();
    if (!container) return;
    const svg = container.querySelector('svg');
    if (!svg) return;

    const viewport = svg.querySelector('g.viewport') as SVGGElement | null;
    const parent = viewport ?? svg;

    let layer = parent.querySelector(`#${GLOW_LAYER_ID}`) as SVGGElement | null;
    if (!layer) {
      layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      layer.id = GLOW_LAYER_ID;
      layer.style.pointerEvents = 'none';
      parent.appendChild(layer);
    }
    glowLayerRef.current = layer;
  };

  // EXACT COPY of clearAllGlows from original
  const clearAllGlows = () => {
    lineStacksRef.current.forEach(stack => {
      if (stack.fadeTimer) clearTimeout(stack.fadeTimer);
      if (stack.outerPath) {
        stack.outerPath.remove();
        stack.outerPath = null;
      }
      if (stack.innerPath) {
        stack.innerPath.remove();
        stack.innerPath = null;
      }
    });
    lineStacksRef.current.clear();
    glowLayerRef.current?.replaceChildren();
  };

  // EXACT COPY of applyDecay from original
  const applyDecay = () => {
    const now = Date.now();
    let activeStackCount = 0;

    lineStacksRef.current.forEach((stack, stackKey) => {
      if (!stack.outerPath || !stack.innerPath) {
        return;
      }

      activeStackCount++;

      if (stack.stackLevel <= 0) return;

      const timeSinceLastTrigger = now - stack.lastTriggerTime;
      const decayStartDelay = (settings.fadeInTime * 1000) + 100;

      if (timeSinceLastTrigger > decayStartDelay) {
        if (stack.outerPath && stack.innerPath) {
          const targetOuterOpacity = stack.outerPath.style.opacity;
          const targetInnerOpacity = stack.innerPath.style.opacity;

          if (targetOuterOpacity === '0' || targetInnerOpacity === '0') {
            return;
          }

          const fadeInCompleteTime = decayStartDelay + (settings.fadeInTime * 1000);
          if (timeSinceLastTrigger > fadeInCompleteTime) {
            const outerTransition = stack.outerPath.style.transition || '';
            const innerTransition = stack.innerPath.style.transition || '';

            if (outerTransition.includes('ease-out')) {
              stack.outerPath.style.transition = 'none';
            }
            if (innerTransition.includes('ease-out')) {
              stack.innerPath.style.transition = 'none';
            }
          }

          const outerTransition = stack.outerPath.style.transition || '';
          const inFadeWindow = timeSinceLastTrigger < fadeInCompleteTime;

          if (outerTransition.includes('ease-out') && inFadeWindow) {
            return;
          }
          if (outerTransition.includes('ease-in')) {
            return;
          }
        }

        const decayAmount = (stack.stackLevel / DECAY_TIME_MS) * DECAY_CHECK_INTERVAL_MS;
        const newStackLevel = Math.max(0, stack.stackLevel - decayAmount);

        if (newStackLevel !== stack.stackLevel) {
          stack.stackLevel = newStackLevel;

          if (stack.outerPath && stack.innerPath) {
            const stackRatio = stack.stackLevel / settings.maxStackLevel;
            const category = stackKey.split(':')[1];
            const baseColor = category === 'outgoing' ? settings.outgoingColor : settings.incomingColor;
            const currentHeatColor = interpolateColor(baseColor, settings.heatColor, stackRatio);

            stack.innerPath.style.transition = `stroke ${DECAY_CHECK_INTERVAL_MS * 2}ms linear`;
            stack.innerPath.setAttribute('stroke', currentHeatColor);
            stack.innerPath.style.stroke = currentHeatColor;

            const multiplier = 1 + (stack.stackLevel / settings.maxStackLevel);
            const currentOuterOpacity = Math.min(1, settings.outerGlowOpacity * multiplier);
            const currentInnerOpacity = Math.min(1, settings.innerGlowOpacity * multiplier);

            stack.outerPath.style.transition = `opacity ${DECAY_CHECK_INTERVAL_MS * 2}ms linear`;
            stack.outerPath.style.opacity = String(currentOuterOpacity);

            stack.innerPath.style.transition = `opacity ${DECAY_CHECK_INTERVAL_MS * 2}ms linear`;
            stack.innerPath.style.opacity = String(currentInnerOpacity);
          }

          if (newStackLevel === 0 && stack.outerPath && stack.innerPath) {
            startFadeOut(stackKey, stack.outerPath, stack.innerPath);
          }
        }
      }
    });

    if (now - lastStackCleanupRef.current > STACK_CLEANUP_INTERVAL_MS) {
      lastStackCleanupRef.current = now;
      const keysToDelete: string[] = [];

      lineStacksRef.current.forEach((stack, stackKey) => {
        if (!stack.outerPath && !stack.innerPath && !stack.fadeTimer) {
          keysToDelete.push(stackKey);
        }
      });

      keysToDelete.forEach(key => lineStacksRef.current.delete(key));

      if (keysToDelete.length > 0) {
        console.log(`[BpmnHeatmapLayer:${config.id}] Cleaned up ${keysToDelete.length} completed stacks. Active: ${lineStacksRef.current.size}`);
      }
    }

    return activeStackCount;
  };

  // EXACT COPY of applyGlowCSS from original
  const applyGlowCSS = (
    outerPath: SVGPathElement,
    innerPath: SVGPathElement,
    stackLevel: number,
    currentOuterOpacity: number = 0,
    currentInnerOpacity: number = 0
  ) => {
    const multiplier = 1 + (stackLevel / settings.maxStackLevel);
    const currentWidth = settings.glowThickness * multiplier;

    outerPath.setAttribute('stroke-width', String(currentWidth));
    outerPath.style.strokeWidth = `${currentWidth}px`;
    outerPath.style.opacity = String(currentOuterOpacity);
    outerPath.style.transition = 'none';

    innerPath.setAttribute('stroke-width', String(currentWidth));
    innerPath.style.strokeWidth = `${currentWidth}px`;
    innerPath.style.opacity = String(currentInnerOpacity);
    innerPath.style.transition = 'none';
  };

  // EXACT COPY of startFadeOut from original
  const startFadeOut = (stackKey: string, outerPath: SVGPathElement, innerPath: SVGPathElement) => {
    outerPath.style.transition = `opacity ${settings.fadeOutTime}s ease-in`;
    innerPath.style.transition = `opacity ${settings.fadeOutTime}s ease-in`;

    requestAnimationFrame(() => {
      outerPath.style.opacity = '0';
      innerPath.style.opacity = '0';
    });

    const fadeTimer = window.setTimeout(() => {
      outerPath.remove();
      innerPath.remove();

      const stack = lineStacksRef.current.get(stackKey);
      if (stack) {
        stack.stackLevel = 0;
        stack.fadeTimer = null;
        stack.outerPath = null;
        stack.innerPath = null;
      }
    }, settings.fadeOutTime * 1000);

    const stack = lineStacksRef.current.get(stackKey);
    if (stack) {
      if (stack.fadeTimer) clearTimeout(stack.fadeTimer);
      stack.fadeTimer = fadeTimer;
    }
  };

  // EXACT COPY of triggerGlow from original
  const triggerGlow = (elementId: string, baseColor: string, heatColor: string, eventType: string = 'ACTIVE', intensity: number = 1) => {
    if (!enabled || !viewer) return;

    const activeStackCount = Array.from(lineStacksRef.current.values()).filter(
      s => s.outerPath !== null || s.innerPath !== null
    ).length;

    if (activeStackCount >= MAX_ACTIVE_STACKS) {
      console.warn(`[BpmnHeatmapLayer:${config.id}] Max active stacks (${MAX_ACTIVE_STACKS}) reached. Skipping animation for ${elementId}`);
      return;
    }

    const registry = viewer.get?.('elementRegistry');
    const canvas = viewer.get?.('canvas');
    if (!registry || !canvas) return;

    const element = registry.get(elementId);
    if (!element) return;

    ensureGlowLayer();
    updateFilters();

    const layer = glowLayerRef.current;
    if (!layer) return;

    const stackKey = getStackKey(elementId, eventType);

    let stack = lineStacksRef.current.get(stackKey);
    if (!stack) {
      stack = { stackLevel: 0, fadeTimer: null, outerPath: null, innerPath: null, lastTriggerTime: Date.now() };
      lineStacksRef.current.set(stackKey, stack);
    }

    const now = Date.now();
    const timeSinceLastTrigger = now - stack.lastTriggerTime;

    stack.lastTriggerTime = now;

    if (stack.fadeTimer) {
      clearTimeout(stack.fadeTimer);
      stack.fadeTimer = null;
    }

    let currentOuterOpacity = 0;
    let currentInnerOpacity = 0;
    if (stack.outerPath && stack.innerPath) {
      const outerComputed = window.getComputedStyle(stack.outerPath);
      const innerComputed = window.getComputedStyle(stack.innerPath);
      currentOuterOpacity = parseFloat(outerComputed.opacity) || 0;
      currentInnerOpacity = parseFloat(innerComputed.opacity) || 0;

      stack.outerPath.remove();
      stack.outerPath = null;
      stack.innerPath.remove();
      stack.innerPath = null;
    }

    // Scale intensity to fit within maxStackLevel range
    // For small batches (intensity <= maxStackLevel), use direct mapping
    // For large batches (intensity > maxStackLevel), scale proportionally to use more of the heat range
    const scaledIntensity = intensity <= settings.maxStackLevel
      ? intensity
      : settings.maxStackLevel * Math.min(1, Math.log(intensity) / Math.log(settings.maxStackLevel * 5));

    // Debug: Log intensity scaling for high-count batches
    if (intensity > 10) {
      console.log(`[BpmnHeatmapLayer:${config.id}] ${elementId}: intensity=${intensity} → scaled=${scaledIntensity.toFixed(2)} (max=${settings.maxStackLevel})`);
    }

    if (timeSinceLastTrigger < settings.heatIncrementWindow) {
      stack.stackLevel = Math.min(stack.stackLevel + scaledIntensity, settings.maxStackLevel);
    } else {
      stack.stackLevel = scaledIntensity;
    }
    const stackRatio = stack.stackLevel / settings.maxStackLevel;
    const currentHeatColor = interpolateColor(baseColor, heatColor, stackRatio);

    let outerPath: SVGPathElement | null = null;
    let innerPath: SVGPathElement | null = null;

    const isSequenceFlow = element.type && /sequenceflow/i.test(element.type);

    if (isSequenceFlow) {
      const gfxNode = canvas.getGraphics?.(elementId);
      if (!gfxNode) {
        console.warn('[BpmnHeatmapLayer] No graphics node for sequence flow:', elementId);
        return;
      }

      const allPaths = Array.from(gfxNode.querySelectorAll('path')) as SVGPathElement[];
      const pathsNotInDefs = allPaths.filter(p => {
        let parent = p.parentElement;
        while (parent && parent !== gfxNode) {
          if (parent.tagName === 'defs') return false;
          parent = parent.parentElement;
        }
        return true;
      });

      let pathElement = pathsNotInDefs.find(p => !p.getAttribute('class')?.includes('djs-hit'));

      if (!pathElement) {
        pathElement = pathsNotInDefs.reduce((longest, current) => {
          const currentD = current.getAttribute('d') || '';
          const longestD = longest?.getAttribute('d') || '';
          return currentD.length > longestD.length ? current : longest;
        }, pathsNotInDefs[0]);
      }

      if (!pathElement) {
        console.warn('[BpmnHeatmapLayer] No path element in sequence flow graphics:', elementId);
        return;
      }

      const pathData = pathElement.getAttribute('d');
      if (!pathData) {
        console.warn('[BpmnHeatmapLayer] Path element has no d attribute:', elementId);
        return;
      }

      const adjustedPathData = pathData;

      outerPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      outerPath.setAttribute('d', adjustedPathData);
      outerPath.setAttribute('stroke', baseColor);
      outerPath.setAttribute('fill', 'none');
      outerPath.setAttribute('stroke-linecap', 'round');
      outerPath.setAttribute('stroke-linejoin', 'round');
      outerPath.setAttribute('stroke-width', '1');
      outerPath.setAttribute('filter', `url(#${FILTER_ID_OUTER})`);
      outerPath.style.strokeWidth = '0';
      outerPath.style.opacity = '0';

      innerPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      innerPath.setAttribute('d', adjustedPathData);
      innerPath.setAttribute('stroke', currentHeatColor);
      innerPath.setAttribute('fill', 'none');
      innerPath.setAttribute('stroke-linecap', 'round');
      innerPath.setAttribute('stroke-linejoin', 'round');
      innerPath.setAttribute('stroke-width', '1');
      innerPath.setAttribute('filter', `url(#${FILTER_ID_INNER})`);
      innerPath.style.strokeWidth = '0';
      innerPath.style.opacity = '0';
    } else {
      const gfxNode = canvas.getGraphics?.(elementId);
      if (!gfxNode) return;

      const visualRoot = gfxNode.querySelector('.djs-visual') || gfxNode;
      const shapes = visualRoot.querySelectorAll('rect, path, polygon, ellipse, circle');
      if (!shapes.length) return;

      const shape = shapes[0].cloneNode(false) as SVGElement;
      const transform = gfxNode.getAttribute('transform');

      outerPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      if (transform) outerPath.setAttribute('transform', transform);

      if (shape.tagName === 'rect') {
        const rect = shape as SVGRectElement;
        const x = parseFloat(rect.getAttribute('x') || '0');
        const y = parseFloat(rect.getAttribute('y') || '0');
        const width = parseFloat(rect.getAttribute('width') || '0');
        const height = parseFloat(rect.getAttribute('height') || '0');
        const rx = parseFloat(rect.getAttribute('rx') || '0');

        if (rx > 0) {
          outerPath.setAttribute('d',
            `M ${x + rx} ${y} ` +
            `L ${x + width - rx} ${y} ` +
            `Q ${x + width} ${y} ${x + width} ${y + rx} ` +
            `L ${x + width} ${y + height - rx} ` +
            `Q ${x + width} ${y + height} ${x + width - rx} ${y + height} ` +
            `L ${x + rx} ${y + height} ` +
            `Q ${x} ${y + height} ${x} ${y + height - rx} ` +
            `L ${x} ${y + rx} ` +
            `Q ${x} ${y} ${x + rx} ${y} Z`
          );
        } else {
          outerPath.setAttribute('d',
            `M ${x} ${y} L ${x + width} ${y} L ${x + width} ${y + height} L ${x} ${y + height} Z`
          );
        }
      } else if (shape.tagName === 'circle') {
        const circle = shape as SVGCircleElement;
        const cx = parseFloat(circle.getAttribute('cx') || '0');
        const cy = parseFloat(circle.getAttribute('cy') || '0');
        const r = parseFloat(circle.getAttribute('r') || '0');
        outerPath.setAttribute('d',
          `M ${cx - r} ${cy} ` +
          `A ${r} ${r} 0 0 1 ${cx + r} ${cy} ` +
          `A ${r} ${r} 0 0 1 ${cx - r} ${cy} Z`
        );
      } else if (shape.tagName === 'path') {
        outerPath.setAttribute('d', (shape as SVGPathElement).getAttribute('d') || '');
      } else if (shape.tagName === 'polygon') {
        const points = (shape as SVGPolygonElement).getAttribute('points') || '';
        const coords = points.trim().split(/\s+/).map(p => p.split(','));
        if (coords.length > 0) {
          const d = `M ${coords.map(c => c.join(' ')).join(' L ')} Z`;
          outerPath.setAttribute('d', d);
        }
      }

      outerPath.setAttribute('stroke', baseColor);
      outerPath.setAttribute('fill', 'none');
      outerPath.setAttribute('stroke-linecap', 'round');
      outerPath.setAttribute('stroke-linejoin', 'round');
      outerPath.setAttribute('stroke-width', '1');
      outerPath.setAttribute('filter', `url(#${FILTER_ID_OUTER})`);
      outerPath.style.strokeWidth = '0';
      outerPath.style.opacity = '0';

      innerPath = outerPath.cloneNode(true) as SVGPathElement;
      innerPath.setAttribute('stroke', currentHeatColor);
      innerPath.setAttribute('filter', `url(#${FILTER_ID_INNER})`);
    }

    if (!outerPath || !innerPath) {
      console.warn('[BpmnHeatmapLayer] Failed to create glow paths for element:', elementId, element);
      return;
    }

    const gfxNode = canvas.getGraphics?.(elementId);
    if (gfxNode && gfxNode.parentNode) {
      gfxNode.parentNode.insertBefore(outerPath, gfxNode);
      gfxNode.parentNode.insertBefore(innerPath, gfxNode);
    } else {
      layer.appendChild(outerPath);
      layer.appendChild(innerPath);
    }

    applyGlowCSS(outerPath, innerPath, stack.stackLevel, currentOuterOpacity, currentInnerOpacity);

    stack.outerPath = outerPath;
    stack.innerPath = innerPath;

    requestAnimationFrame(() => {
      if (!outerPath || !innerPath) return;
      const stackRatio = stack.stackLevel / settings.maxStackLevel;
      const multiplier = 1 + stackRatio;
      const targetOuterOpacity = Math.min(1, settings.outerGlowOpacity * multiplier);
      const targetInnerOpacity = Math.min(1, settings.innerGlowOpacity * multiplier);

      outerPath.style.transition = `opacity ${settings.fadeInTime}s ease-out`;
      innerPath.style.transition = `opacity ${settings.fadeInTime}s ease-out`;

      requestAnimationFrame(() => {
        if (!outerPath || !innerPath) return;
        outerPath.style.opacity = String(targetOuterOpacity);
        innerPath.style.opacity = String(targetInnerOpacity);
      });
    });

    const fadeOutTimer = window.setTimeout(() => {
      if (!outerPath || !innerPath) return;
      startFadeOut(stackKey, outerPath, innerPath);
    }, settings.fadeInTime * 1000);

    stack.fadeTimer = fadeOutTimer;
  };

  // EXACT COPY of all useEffect hooks from original

  // Process triggers
  useEffect(() => {
    if (!enabled || !triggers.length) return;

    const now = Date.now();

    triggers.forEach(trigger => {
      const key = `${trigger.id}-${trigger.timestamp}`;
      if (processedTriggersRef.current.has(key)) return;
      processedTriggersRef.current.set(key, now);

      if (now - lastCleanupRef.current > 5000) {
        lastCleanupRef.current = now;
        const cutoff = now - 10000;
        for (const [k, processedAt] of processedTriggersRef.current.entries()) {
          if (processedAt < cutoff) {
            processedTriggersRef.current.delete(k);
          }
        }
      }

      let elementId: string | undefined;
      let eventType = trigger.eventType || 'ACTIVE';
      const intensity = trigger.intensity || 1;

      if (trigger.elementId) {
        elementId = trigger.elementId;
      } else if (trigger.sequenceFlowIds && trigger.sequenceFlowIds.length > 0) {
        trigger.sequenceFlowIds.forEach(seqId => {
          const baseColor = settings.outgoingColor;
          triggerGlow(seqId, baseColor, settings.heatColor, 'ACTIVE', intensity);
        });
        return;
      }

      if (!elementId) return;

      // Determine base color based on event type
      let baseColor: string;
      if (eventType === 'COMPLETED') {
        baseColor = settings.outgoingColor;
      } else if (eventType === 'ABORTED') {
        baseColor = settings.abortedColor;
      } else {
        baseColor = settings.incomingColor;
      }

      triggerGlow(elementId, baseColor, settings.heatColor, eventType, intensity);
    });
  }, [triggers, enabled, settings]);

  // Handle debug trigger
  useEffect(() => {
    if (!debugTrigger || !enabled) return;

    const elementId = debugTrigger.elementId;
    const eventType = debugTrigger.eventType || 'ACTIVE';

    // Determine base color based on event type
    let baseColor: string;
    if (eventType === 'COMPLETED') {
      baseColor = settings.outgoingColor;
    } else if (eventType === 'ABORTED') {
      baseColor = settings.abortedColor;
    } else {
      baseColor = settings.incomingColor;
    }

    if (elementId) {
      triggerGlow(elementId, baseColor, settings.heatColor, eventType);
    } else {
      const registry = viewer?.get?.('elementRegistry');
      if (registry) {
        const all = registry.getAll?.() ?? [];
        const firstElement = all.find((el: any) => /task/i.test(el?.type ?? ''));
        if (firstElement) {
          triggerGlow(firstElement.id, baseColor, settings.heatColor, eventType);
        }
      }
    }
  }, [debugTrigger?.requestId, enabled, settings]);

  // Update filters when settings change
  useEffect(() => {
    updateFilters();
  }, [
    settings.glowIntensity,
    settings.innerGlowIntensity,
    viewer,
  ]);

  // Initialize
  useEffect(() => {
    if (!viewer) return;
    ensureGlowLayer();
    updateFilters();

    return () => {
      clearAllGlows();
    };
  }, [viewer]);

  // Start/stop decay interval
  useEffect(() => {
    if (!enabled) return;

    const interval = window.setInterval(() => {
      applyDecay();
    }, DECAY_CHECK_INTERVAL_MS);

    decayIntervalRef.current = interval;

    return () => {
      if (decayIntervalRef.current) {
        clearInterval(decayIntervalRef.current);
        decayIntervalRef.current = null;
      }
    };
  }, [enabled, settings.fadeInTime, settings.maxStackLevel, settings.outerGlowOpacity, settings.innerGlowOpacity, settings.incomingColor, settings.outgoingColor, settings.abortedColor, settings.heatColor]);

  // Clear on disable
  useEffect(() => {
    if (!enabled) {
      clearAllGlows();
    }
  }, [enabled]);

  return null;
}

