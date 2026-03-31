'use client';

import { Button, Slider } from 'antd';
import { HexColorPicker } from 'react-colorful';
import { useEffect, useState, useRef } from 'react';

export interface OverlaySettingsState {
  glowIntensity: number;
  innerGlowIntensity: number;
  glowThickness: number;
  outerGlowOpacity: number;
  innerGlowOpacity: number;
  maxStackLevel: number;
  fadeInTime: number;
  fadeOutTime: number;
  heatIncrementWindow: number;
  incomingColor: string;
  outgoingColor: string;
  abortedColor: string;
  incidentColor: string;
  heatColor: string;
}

const STORAGE_KEYS = {
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
};

export const DEFAULT_OVERLAY_SETTINGS: OverlaySettingsState = {
  glowIntensity: 20,
  innerGlowIntensity: 10,
  glowThickness: 20,
  outerGlowOpacity: 0.2,
  innerGlowOpacity: 0.2,
  maxStackLevel: 100,
  fadeInTime: 0.2,
  fadeOutTime: 1.0,
  heatIncrementWindow: 3000,
  incomingColor: '#3d5eff',
  outgoingColor: '#00ff00',
  abortedColor: '#999999',
  incidentColor: '#ff0000',
  heatColor: '#ff0000',
};

function getInitialValue<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return fallback;
    if (typeof fallback === 'number') {
      const num = Number(stored);
      return (isNaN(num) ? fallback : num) as T;
    }
    return stored as T;
  } catch {
    return fallback;
  }
}

interface OverlaySettingsProps {
  onSettingsChange?: (settings: OverlaySettingsState) => void;
}

export default function OverlaySettings({ onSettingsChange }: OverlaySettingsProps) {
  const [settings, setSettings] = useState<OverlaySettingsState>(() => ({
    glowIntensity: getInitialValue(STORAGE_KEYS.glowIntensity, DEFAULT_OVERLAY_SETTINGS.glowIntensity),
    innerGlowIntensity: getInitialValue(STORAGE_KEYS.innerGlowIntensity, DEFAULT_OVERLAY_SETTINGS.innerGlowIntensity),
    glowThickness: getInitialValue(STORAGE_KEYS.glowThickness, DEFAULT_OVERLAY_SETTINGS.glowThickness),
    outerGlowOpacity: getInitialValue(STORAGE_KEYS.outerGlowOpacity, DEFAULT_OVERLAY_SETTINGS.outerGlowOpacity),
    innerGlowOpacity: getInitialValue(STORAGE_KEYS.innerGlowOpacity, DEFAULT_OVERLAY_SETTINGS.innerGlowOpacity),
    maxStackLevel: getInitialValue(STORAGE_KEYS.maxStackLevel, DEFAULT_OVERLAY_SETTINGS.maxStackLevel),
    fadeInTime: getInitialValue(STORAGE_KEYS.fadeInTime, DEFAULT_OVERLAY_SETTINGS.fadeInTime),
    fadeOutTime: getInitialValue(STORAGE_KEYS.fadeOutTime, DEFAULT_OVERLAY_SETTINGS.fadeOutTime),
    heatIncrementWindow: getInitialValue(STORAGE_KEYS.heatIncrementWindow, DEFAULT_OVERLAY_SETTINGS.heatIncrementWindow),
    incomingColor: getInitialValue(STORAGE_KEYS.incomingColor, DEFAULT_OVERLAY_SETTINGS.incomingColor),
    outgoingColor: getInitialValue(STORAGE_KEYS.outgoingColor, DEFAULT_OVERLAY_SETTINGS.outgoingColor),
    abortedColor: getInitialValue(STORAGE_KEYS.abortedColor, DEFAULT_OVERLAY_SETTINGS.abortedColor),
    incidentColor: getInitialValue(STORAGE_KEYS.incidentColor, DEFAULT_OVERLAY_SETTINGS.incidentColor),
    heatColor: getInitialValue(STORAGE_KEYS.heatColor, DEFAULT_OVERLAY_SETTINGS.heatColor),
  }));

  // Track if this is the first render to avoid calling onSettingsChange on mount
  const isFirstRender = useRef(true);

  // Debounce timer for notifying parent (avoid excessive updates while dragging color picker)
  const notifyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounce timer for updateSetting to prevent too many rapid setState calls
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Pending update to apply after debounce
  const pendingUpdateRef = useRef<{ key: string; value: any } | null>(null);

  const updateSetting = <K extends keyof OverlaySettingsState>(key: K, value: OverlaySettingsState[K]) => {
    // Clear existing timeout
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }

    // Store pending update
    pendingUpdateRef.current = { key, value };

    // Update immediately in state for visual feedback (color picker position)
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      // Save to localStorage immediately
      try {
        localStorage.setItem(STORAGE_KEYS[key], String(value));
      } catch {}
      return next;
    });
  };

  const restoreDefaults = () => {
    setSettings(DEFAULT_OVERLAY_SETTINGS);
    // Clear all stored values
    Object.keys(STORAGE_KEYS).forEach(key => {
      try {
        localStorage.removeItem(STORAGE_KEYS[key as keyof typeof STORAGE_KEYS]);
      } catch {}
    });
  };

  // Notify parent when settings change
  // Note: onSettingsChange is intentionally NOT in dependencies to avoid infinite loop
  // Debounced to prevent excessive updates while dragging color picker
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    // Clear existing timeout
    if (notifyTimeoutRef.current) {
      clearTimeout(notifyTimeoutRef.current);
    }

    // Debounce: wait 100ms after last change before notifying parent
    notifyTimeoutRef.current = setTimeout(() => {
      onSettingsChange?.(settings);
    }, 100);

    // Cleanup
    return () => {
      if (notifyTimeoutRef.current) {
        clearTimeout(notifyTimeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 18,
      width: '100%',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8
      }}>
        <div style={{ fontWeight: 600, fontSize: 16 }}>Colors & highlight settings</div>
        <Button
          size="small"
          onClick={restoreDefaults}
          style={{ fontSize: 11 }}
        >
          Restore Defaults
        </Button>
      </div>

      {/* CSS to make color pickers more compact while keeping full functionality */}
      <style>{`
        .react-colorful {
          height: 80px !important;
        }
        .react-colorful__saturation {
          height: 60px !important;
          border-radius: 4px 4px 0 0;
        }
        .react-colorful__hue {
          height: 12px !important;
          border-radius: 0 0 4px 4px;
        }
        .react-colorful__pointer {
          width: 16px !important;
          height: 16px !important;
        }
      `}</style>

      {/* Colors */}
      <div style={{ width: '100%' }}>
        <div style={{ fontWeight: 500, marginBottom: 4, fontSize: 13 }}>Activated</div>
        <HexColorPicker
          color={settings.incomingColor}
          onChange={v => updateSetting('incomingColor', v)}
          style={{ width: '100%' }}
        />
      </div>

      <div style={{ width: '100%' }}>
        <div style={{ fontWeight: 500, marginBottom: 4, fontSize: 13 }}>Completed</div>
        <HexColorPicker
          color={settings.outgoingColor}
          onChange={v => updateSetting('outgoingColor', v)}
          style={{ width: '100%' }}
        />
      </div>

      <div style={{ width: '100%' }}>
        <div style={{ fontWeight: 500, marginBottom: 4, fontSize: 13 }}>Aborted</div>
        <HexColorPicker
          color={settings.abortedColor}
          onChange={v => updateSetting('abortedColor', v)}
          style={{ width: '100%' }}
        />
      </div>

      <div style={{ width: '100%' }}>
        <div style={{ fontWeight: 500, marginBottom: 4, fontSize: 13 }}>Incident</div>
        <HexColorPicker
          color={settings.incidentColor}
          onChange={v => updateSetting('incidentColor', v)}
          style={{ width: '100%' }}
        />
      </div>

      <div style={{ width: '100%' }}>
        <div style={{ fontWeight: 500, marginBottom: 4, fontSize: 13 }}>Heat</div>
        <HexColorPicker
          color={settings.heatColor}
          onChange={v => updateSetting('heatColor', v)}
          style={{ width: '100%' }}
        />
      </div>

      {/* Glow Intensity */}
      <div>
        <div style={{ fontSize: 12, marginBottom: 4 }}>
          Glow Intensity (outer): {settings.glowIntensity}px
        </div>
        <Slider
          min={1}
          max={50}
          step={1}
          value={settings.glowIntensity}
          onChange={v => updateSetting('glowIntensity', v)}
        />
      </div>

      {/* Inner Glow Intensity */}
      <div>
        <div style={{ fontSize: 12, marginBottom: 4 }}>
          Inner Glow Intensity: {settings.innerGlowIntensity}px
        </div>
        <Slider
          min={1}
          max={50}
          step={1}
          value={settings.innerGlowIntensity}
          onChange={v => updateSetting('innerGlowIntensity', v)}
        />
      </div>

      {/* Glow Thickness */}
      <div>
        <div style={{ fontSize: 12, marginBottom: 4 }}>
          Glow Thickness: {settings.glowThickness}px
        </div>
        <Slider
          min={1}
          max={50}
          step={1}
          value={settings.glowThickness}
          onChange={v => updateSetting('glowThickness', v)}
        />
      </div>

      {/* Outer Glow Opacity */}
      <div>
        <div style={{ fontSize: 12, marginBottom: 4 }}>
          Outer Glow Opacity: {Math.round(settings.outerGlowOpacity * 100)}%
        </div>
        <Slider
          min={0}
          max={100}
          step={5}
          value={settings.outerGlowOpacity * 100}
          onChange={v => updateSetting('outerGlowOpacity', v / 100)}
        />
      </div>

      {/* Inner Glow Opacity */}
      <div>
        <div style={{ fontSize: 12, marginBottom: 4 }}>
          Inner Glow Opacity: {Math.round(settings.innerGlowOpacity * 100)}%
        </div>
        <Slider
          min={0}
          max={100}
          step={5}
          value={settings.innerGlowOpacity * 100}
          onChange={v => updateSetting('innerGlowOpacity', v / 100)}
        />
      </div>

      {/* Heat Tolerance */}
      <div>
        <div style={{ fontSize: 12, marginBottom: 4 }}>
          Heat Tolerance (heat accumulation sensitivity): {settings.maxStackLevel}
        </div>
        <Slider
          min={1}
          max={1000}
          step={1}
          value={settings.maxStackLevel}
          onChange={v => updateSetting('maxStackLevel', v)}
        />
      </div>

      {/* Heat Increment Window */}
      <div>
        <div style={{ fontSize: 12, marginBottom: 4 }}>
          Heat Increment Window: {settings.heatIncrementWindow}ms
          <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
            Max time between triggers before heat resets (increase for timer-based processes)
          </div>
        </div>
        <Slider
          min={100}
          max={10000}
          step={100}
          value={settings.heatIncrementWindow}
          onChange={v => updateSetting('heatIncrementWindow', v)}
        />
      </div>

      {/* Fade In Time */}
      <div>
        <div style={{ fontSize: 12, marginBottom: 4 }}>
          Fade In Time: {settings.fadeInTime}s
        </div>
        <Slider
          min={0}
          max={5}
          step={0.1}
          value={settings.fadeInTime}
          onChange={v => updateSetting('fadeInTime', v)}
        />
      </div>

      {/* Fade Out Time */}
      <div>
        <div style={{ fontSize: 12, marginBottom: 4 }}>
          Fade Out Time: {settings.fadeOutTime}s
        </div>
        <Slider
          min={0}
          max={5}
          step={0.1}
          value={settings.fadeOutTime}
          onChange={v => updateSetting('fadeOutTime', v)}
        />
      </div>


      <div style={{ fontSize: 11, color: '#666', marginTop: 8, textAlign: 'center' }}>
        Click outside or press Esc to close
      </div>
    </div>
  );
}

