/**
 * Flow Node Count Data Source
 *
 * Provides badge data showing activity/sequence flow execution counts.
 * Supports both aggregate (across all instances) and single-instance views.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import type { ElementBadge, BadgeDataSource } from '@/components/runway/layers/BpmnBadgeLayer';
import type { ProcessDefinitionAggregateState, ProcessInstanceState, ProcessInstanceHeatmap } from './useBpmnHeatmap';

// Count data structure from backend
export interface FlowNodeCounts {
  elementId: string;
  active: number;
  completed: number;
  aborted: number;
}

/**
 * Format a number to fit within reasonable space (max ~5 chars with decimal precision)
 * Based on requirements:
 * - 9999 → "9999" (4 chars)
 * - 10123 → "10.1k" (5 chars)
 * - 123123 → "123k" (4 chars)
 * - 999999 → "999k" (4 chars)
 * - 1123123 → "1.23m" (5 chars)
 * - 123123123 → "123m" (4 chars)
 *
 * Logic: Use decimals when there's room for precision within ~4-5 chars
 */
function formatBadgeNumber(num: number): string {
  if (num <= 9999) {
    // Up to 9999, display as-is
    return String(num);
  } else if (num < 1000000) {
    // Thousands (k)
    const k = num / 1000;
    if (k < 100) {
      // 10.0k to 99.9k: use 1 decimal (gives 4-5 chars)
      return k.toFixed(1) + 'k';
    } else {
      // 100k to 999k: no decimal (gives 4 chars)
      return Math.floor(k) + 'k';
    }
  } else {
    // Millions (m)
    const m = num / 1000000;
    if (m < 10) {
      // 1.00m to 9.99m: use 2 decimals (gives 5 chars)
      return m.toFixed(2) + 'm';
    } else if (m < 100) {
      // 10.0m to 99.9m: use 1 decimal (gives 5 chars)
      return m.toFixed(1) + 'm';
    } else {
      // 100m to 999m: no decimal (gives 4 chars)
      return Math.floor(m) + 'm';
    }
  }
}

/**
 * Hook that provides aggregate flow node count badges
 * Shows total counts across all process instances
 *
 * Uses STATE SNAPSHOTS from backend - no accumulation, no calculation!
 */
export function useAggregateFlowNodeCountDataSource(
  selectedDefinitionId: string | null,
  selectedVersion: number | null,
  aggregateState: ProcessDefinitionAggregateState | null,
  colors?: { incomingColor: string; outgoingColor: string; abortedColor: string }
): BadgeDataSource {

  const [badges, setBadges] = useState<ElementBadge[]>([]);
  const subscribersRef = useRef<Set<(badges: ElementBadge[]) => void>>(new Set());

  // Clear badges immediately when selection changes
  useEffect(() => {
    setBadges([]);
    subscribersRef.current.forEach(callback => callback([]));
  }, [selectedDefinitionId, selectedVersion]);

  // Process aggregate state snapshots from the backend and convert to badges
  useEffect(() => {
    const state = aggregateState;
    if (!state || !state.flowNodeStates) {
      // No aggregate state available - clear badges
      setBadges([]);
      subscribersRef.current.forEach(callback => callback([]));
      return;
    }

    // IMPORTANT: Validate that the state matches the selected process definition
    // This prevents showing data from other process definitions
    if (state.processDefinitionId !== selectedDefinitionId || state.version !== selectedVersion) {
      console.warn('[useAggregateFlowNodeCountDataSource] State mismatch - ignoring', {
        received: { id: state.processDefinitionId, version: state.version },
        selected: { id: selectedDefinitionId, version: selectedVersion }
      });
      // Ignore mismatched state - do not update badges
      return;
    }

    // Use glow colors for badges, or fallback to defaults
    const incomingColor = colors?.incomingColor || '#00ff88';
    const outgoingColor = colors?.outgoingColor || '#00aaff';
    const abortedColor = colors?.abortedColor || '#888888';

    // Convert state snapshot to badges
    const newBadges: ElementBadge[] = [];

    Object.entries(state.flowNodeStates).forEach(([elementId, counts]: any) => {
      // Active badge - use incoming/activated color
      if (counts.active > 0) {
        newBadges.push({
          elementId,
          position: 'bottom-right',
          type: 'active',
          text: formatBadgeNumber(counts.active),
          color: hexToDarkText(incomingColor),
          backgroundColor: hexToLightBackground(incomingColor),
          tooltip: `${counts.active} active`,
        });
      }

      // Completed badge - use outgoing/completed color
      if (counts.completed > 0) {
        newBadges.push({
          elementId,
          position: 'top-right',
          type: 'completed',
          text: formatBadgeNumber(counts.completed),
          color: hexToDarkText(outgoingColor),
          backgroundColor: hexToLightBackground(outgoingColor),
          tooltip: `${counts.completed} completed`,
        });
      }

      // Aborted badge - use aborted color
      if (counts.aborted > 0) {
        newBadges.push({
          elementId,
          position: 'bottom-left',
          type: 'aborted',
          text: formatBadgeNumber(counts.aborted),
          color: hexToDarkText(abortedColor),
          backgroundColor: hexToLightBackground(abortedColor),
          tooltip: `${counts.aborted} aborted`,
        });
      }

      // Active/other badges could be added here if desired
    });

    setBadges(newBadges);
    subscribersRef.current.forEach(callback => callback(newBadges));

  }, [aggregateState, selectedDefinitionId, selectedVersion, colors]);

  return {
    subscribe: (callback: (badges: ElementBadge[]) => void) => {
      subscribersRef.current.add(callback);
      callback(badges);

      return () => {
        subscribersRef.current.delete(callback);
      };
    },

    getBadges: () => {
      return badges;
    },
  };
}

/**
 * Hook that provides single-instance flow node count badges
 * Shows state-specific counts for a specific process instance
 *
 * Tracks: started, active, completed, aborted for each activity
 *
 * IMPORTANT: Initializes from processInstanceHeatmap (historical data)
 * then tracks new events from animationTriggers
 */
export function useSingleInstanceFlowNodeCountDataSource(
  processInstanceId: string | null,
  instanceState: ProcessInstanceState | null,
  processInstanceHeatmap: ProcessInstanceHeatmap | null,
  colors?: { incomingColor: string; outgoingColor: string; abortedColor: string }
): BadgeDataSource {

  const [badges, setBadges] = useState<ElementBadge[]>([]);
  const subscribersRef = useRef<Set<(badges: ElementBadge[]) => void>>(new Set());

  // Track state counts per element for THIS instance
  const stateCountsRef = useRef<Map<string, {
    started: number;
    active: number;
    completed: number;
    aborted: number;
  }>>(new Map());

  // Track the last processInstanceId to detect changes
  const lastInstanceIdRef = useRef<string | null>(null);

  // Track if we've initialized from heatmap
  const initializedFromHeatmapRef = useRef<boolean>(false);
  // Track last seen time for instance messages to avoid clearing badges on transient gaps
  const lastInstanceMessageSeenRef = useRef<number | null>(null);

  // Reset counts when processInstanceId changes
  useEffect(() => {
    if (lastInstanceIdRef.current !== processInstanceId) {
      // Instance changed - clear all counts
      stateCountsRef.current.clear();
      initializedFromHeatmapRef.current = false;
      lastInstanceIdRef.current = processInstanceId;

      if (!processInstanceId) {
        // No instance selected, clear badges
        setBadges([]);
        subscribersRef.current.forEach(callback => callback([]));
      }
    }
  }, [processInstanceId]);

  // Initialize and UPDATE from processInstanceHeatmap (historical) AND processInstanceState (real-time)
  useEffect(() => {
    if (!processInstanceId) return;

    const hist = processInstanceHeatmap;
    const inst = instanceState;

    // If neither historical nor instance state is available, only clear if we've not seen data for a while
    const hasHist = !!(hist && hist.processInstanceId === processInstanceId);
    const hasInst = !!(inst && inst.processInstanceId === processInstanceId && inst.flowNodeStates);
    const now = Date.now();

    if (hasHist || hasInst) {
      // update last-seen timestamp when we actually have data
      lastInstanceMessageSeenRef.current = now;
    }

    const CLEAR_GRACE_MS = 3000; // keep badges visible for 3s during transient gaps
    if (!hasHist && !hasInst) {
      if (lastInstanceMessageSeenRef.current && (now - lastInstanceMessageSeenRef.current) < CLEAR_GRACE_MS) {
        // Within grace period after last message — do not clear yet
        return;
      }

      // No recent data — clear if we had initialized
      if (initializedFromHeatmapRef.current) {
        stateCountsRef.current.clear();
        setBadges([]);
        subscribersRef.current.forEach(callback => callback([]));
        initializedFromHeatmapRef.current = false;
      }

      return;
    }

    const merged = new Map<string, { started: number; active: number; completed: number; aborted: number }>();

    // Start from historical cumulative passes if available
    if (hist && hist.processInstanceId === processInstanceId) {
      const activityPassCounts = hist.activityPassCounts || {};
      Object.entries(activityPassCounts).forEach(([elementId, val]) => {
        const n = Number(val) || 0;
        merged.set(elementId, {
          started: n,
          active: 0,
          completed: n,
          aborted: 0,
        });
      });
      // Note: sequenceFlowPassCounts are ignored here (sequence flow badges handled elsewhere)
    }

    // Overlay real-time instance state if available — this has the authoritative active/completed/aborted counts
    if (inst && inst.processInstanceId === processInstanceId && inst.flowNodeStates) {
      Object.entries(inst.flowNodeStates).forEach(([elementId, counts]: any) => {
        const existing = merged.get(elementId) || { started: 0, active: 0, completed: 0, aborted: 0 };
        const started = (counts.completed || 0) + (counts.active || 0) + (counts.aborted || 0);
        merged.set(elementId, {
          started: Math.max(existing.started, started), // ensure started is at least what we observed historically
          active: counts.active || 0,
          completed: counts.completed || 0,
          aborted: counts.aborted || 0,
        });
      });
    }

    stateCountsRef.current = merged;
    initializedFromHeatmapRef.current = true;

    // Update last seen whenever we produce merged counts
    lastInstanceMessageSeenRef.current = Date.now();

    const updatedBadges = generateBadges(stateCountsRef.current, colors);
    setBadges(updatedBadges);
    subscribersRef.current.forEach(callback => callback(updatedBadges));

  }, [processInstanceHeatmap, instanceState, processInstanceId, colors]);

  // Note: We intentionally don't react to animationTriggers for single-instance view; the backend
  // sends process-instance-heatmap and process-instance-state messages for the selected instance.


  return {
    subscribe: (callback: (badges: ElementBadge[]) => void) => {
      subscribersRef.current.add(callback);
      callback(badges);

      return () => {
        subscribersRef.current.delete(callback);
      };
    },

    getBadges: () => {
      return badges;
    },
  };
}

/**
 * Helper to convert hex to lighter background color (90% white blend)
 * Used for badge backgrounds
 */
function hexToLightBackground(hex: string): string {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);

  const blend = 0.9;
  const lr = Math.round(r * (1 - blend) + 255 * blend);
  const lg = Math.round(g * (1 - blend) + 255 * blend);
  const lb = Math.round(b * (1 - blend) + 255 * blend);

  return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`;
}

/**
 * Helper to darken color for text to ensure good contrast
 * Intelligently darkens bright colors based on perceived brightness
 */
function hexToDarkText(hex: string): string {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);

  // Calculate perceived brightness using luminance formula
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;

  // If color is too light, darken it significantly for text
  if (brightness > 180) {
    // Very light color - darken to 30% of original
    const dr = Math.round(r * 0.3);
    const dg = Math.round(g * 0.3);
    const db = Math.round(b * 0.3);
    return `#${dr.toString(16).padStart(2, '0')}${dg.toString(16).padStart(2, '0')}${db.toString(16).padStart(2, '0')}`;
  } else if (brightness > 100) {
    // Medium brightness - darken to 60%
    const dr = Math.round(r * 0.6);
    const dg = Math.round(g * 0.6);
    const db = Math.round(b * 0.6);
    return `#${dr.toString(16).padStart(2, '0')}${dg.toString(16).padStart(2, '0')}${db.toString(16).padStart(2, '0')}`;
  } else {
    // Already dark enough, use as is
    return hex;
  }
}

/**
 * Helper function to generate badges from state counts
 */
function generateBadges(
  stateCounts: Map<string, { started: number; active: number; completed: number; aborted: number }>,
  colors?: { incomingColor: string; outgoingColor: string; abortedColor: string }
): ElementBadge[] {
  const badges: ElementBadge[] = [];

  // Use glow colors for badges, or fallback to defaults
  const incomingColor = colors?.incomingColor || '#00ff88';
  const outgoingColor = colors?.outgoingColor || '#00aaff';
  const abortedColor = colors?.abortedColor || '#888888';

  stateCounts.forEach((counts, elementId) => {
    // Started (top-left) - use incoming color (activated state)
    // "Started" means the task was activated/initiated
    if (counts.started > 0) {
      badges.push({
        elementId,
        position: 'top-left',
        type: 'started',
        text: formatBadgeNumber(counts.started),
        color: hexToDarkText(incomingColor),
        backgroundColor: hexToLightBackground(incomingColor),
        tooltip: `${counts.started} started`,
      });
    }

    // Active -> bottom-right - use incoming color (activated state)
    if (counts.active > 0) {
      badges.push({
        elementId,
        position: 'bottom-right',
        type: 'active',
        text: formatBadgeNumber(counts.active),
        color: hexToDarkText(incomingColor),
        backgroundColor: hexToLightBackground(incomingColor),
        tooltip: `${counts.active} active`,
      });
    }

    // Completed -> top-right - use outgoing color (completed state)
    if (counts.completed > 0) {
      badges.push({
        elementId,
        position: 'top-right',
        type: 'completed',
        text: formatBadgeNumber(counts.completed),
        color: hexToDarkText(outgoingColor),
        backgroundColor: hexToLightBackground(outgoingColor),
        tooltip: `${counts.completed} completed`,
      });
    }

    // Aborted -> bottom-left - use aborted color
    if (counts.aborted > 0) {
      badges.push({
        elementId,
        position: 'bottom-left',
        type: 'aborted',
        text: formatBadgeNumber(counts.aborted),
        color: hexToDarkText(abortedColor),
        backgroundColor: hexToLightBackground(abortedColor),
        tooltip: `${counts.aborted} aborted`,
      });
    }
  });

  return badges;
}
