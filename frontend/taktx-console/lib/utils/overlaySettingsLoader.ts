import { type OverlaySettingsState, DEFAULT_OVERLAY_SETTINGS } from '@/components/runway/OverlaySettings';
import { loadSettingFromStorage } from './storageHelpers';

/**
 * Storage keys for runway overlay settings
 */
const OVERLAY_STORAGE_KEYS = {
  glowIntensity: 'runway-overlay-glowIntensity',
  innerGlowIntensity: 'runway-overlay-innerGlowIntensity',
  glowThickness: 'runway-overlay-glowThickness',
  outerGlowOpacity: 'runway-overlay-outerGlowOpacity',
  innerGlowOpacity: 'runway-overlay-innerGlowOpacity',
  maxStackLevel: 'runway-overlay-maxStackLevel',
  fadeInTime: 'runway-overlay-fadeInTime',
  fadeOutTime: 'runway-overlay-fadeOutTime',
  heatIncrementWindow: 'runway-overlay-heatIncrementWindow',
  incomingColor: 'runway-overlay-incomingColor',
  outgoingColor: 'runway-overlay-outgoingColor',
  abortedColor: 'runway-overlay-abortedColor',
  incidentColor: 'runway-overlay-incidentColor',
  heatColor: 'runway-overlay-heatColor',
} as const;

/**
 * Load overlay settings from localStorage on initial mount
 * Falls back to default values if keys don't exist
 *
 * @returns Complete overlay settings state
 */
export function loadOverlaySettings(): OverlaySettingsState {
  return {
    glowIntensity: loadSettingFromStorage(
      OVERLAY_STORAGE_KEYS.glowIntensity,
      DEFAULT_OVERLAY_SETTINGS.glowIntensity
    ),
    innerGlowIntensity: loadSettingFromStorage(
      OVERLAY_STORAGE_KEYS.innerGlowIntensity,
      DEFAULT_OVERLAY_SETTINGS.innerGlowIntensity
    ),
    glowThickness: loadSettingFromStorage(
      OVERLAY_STORAGE_KEYS.glowThickness,
      DEFAULT_OVERLAY_SETTINGS.glowThickness
    ),
    outerGlowOpacity: loadSettingFromStorage(
      OVERLAY_STORAGE_KEYS.outerGlowOpacity,
      DEFAULT_OVERLAY_SETTINGS.outerGlowOpacity
    ),
    innerGlowOpacity: loadSettingFromStorage(
      OVERLAY_STORAGE_KEYS.innerGlowOpacity,
      DEFAULT_OVERLAY_SETTINGS.innerGlowOpacity
    ),
    maxStackLevel: loadSettingFromStorage(
      OVERLAY_STORAGE_KEYS.maxStackLevel,
      DEFAULT_OVERLAY_SETTINGS.maxStackLevel
    ),
    fadeInTime: loadSettingFromStorage(
      OVERLAY_STORAGE_KEYS.fadeInTime,
      DEFAULT_OVERLAY_SETTINGS.fadeInTime
    ),
    fadeOutTime: loadSettingFromStorage(
      OVERLAY_STORAGE_KEYS.fadeOutTime,
      DEFAULT_OVERLAY_SETTINGS.fadeOutTime
    ),
    heatIncrementWindow: loadSettingFromStorage(
      OVERLAY_STORAGE_KEYS.heatIncrementWindow,
      DEFAULT_OVERLAY_SETTINGS.heatIncrementWindow
    ),
    incomingColor: loadSettingFromStorage(
      OVERLAY_STORAGE_KEYS.incomingColor,
      DEFAULT_OVERLAY_SETTINGS.incomingColor
    ),
    outgoingColor: loadSettingFromStorage(
      OVERLAY_STORAGE_KEYS.outgoingColor,
      DEFAULT_OVERLAY_SETTINGS.outgoingColor
    ),
    abortedColor: loadSettingFromStorage(
      OVERLAY_STORAGE_KEYS.abortedColor,
      DEFAULT_OVERLAY_SETTINGS.abortedColor
    ),
    incidentColor: loadSettingFromStorage(
      OVERLAY_STORAGE_KEYS.incidentColor,
      DEFAULT_OVERLAY_SETTINGS.incidentColor
    ),
    heatColor: loadSettingFromStorage(
      OVERLAY_STORAGE_KEYS.heatColor,
      DEFAULT_OVERLAY_SETTINGS.heatColor
    ),
  };
}

