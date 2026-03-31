/**
 * Shared state color utilities
 * Maps execution states to their corresponding overlay settings colors
 */

import type { OverlaySettingsState } from '@/components/runway/OverlaySettings';

export function getStateColor(
  state: string | undefined | null,
  overlaySettings?: OverlaySettingsState
): string {
  const s = (state || '').toUpperCase();

  // Use overlay settings colors if available, otherwise use defaults
  const incomingColor = overlaySettings?.incomingColor || '#00ff88'; // ACTIVE
  const outgoingColor = overlaySettings?.outgoingColor || '#00aaff'; // COMPLETED
  const abortedColor = overlaySettings?.abortedColor || '#888888'; // ABORTED/FAILED
  const incidentColor = overlaySettings?.incidentColor || '#ff4444'; // INCIDENT

  if (s === 'ACTIVE') return incomingColor;
  if (s === 'COMPLETED') return outgoingColor;
  if (s === 'ABORTED' || s === 'FAILED' || s === 'ERROR') return abortedColor;
  if (s === 'INCIDENT') return incidentColor;

  return '#8c8c8c'; // Default gray for unknown states
}

export function getIncidentColor(overlaySettings?: OverlaySettingsState): string {
  // Incidents use the dedicated incident color (typically red)
  return overlaySettings?.incidentColor || '#ff4444';
}

