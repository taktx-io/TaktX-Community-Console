/**
 * Badge Settings Panel
 *
 * Provides separate controls for aggregated and process instance badge visibility.
 * Uses CSS visibility toggling for immediate feedback.
 */

'use client';

import { Button, Checkbox, Divider, Space } from 'antd';
import { useEffect, useState } from 'react';

export interface AggregateBadgeSettings {
  showStarted: boolean;
  showCompleted: boolean;
  showAborted: boolean;
  showActive: boolean;
}

export interface InstanceBadgeSettings {
  showActive: boolean;
  showStarted: boolean;
  showCompleted: boolean;
  showAborted: boolean;
  onlyShowWhenGreaterThanOne: boolean;
}

export const DEFAULT_AGGREGATE_BADGE_SETTINGS: AggregateBadgeSettings = {
  showStarted: false, // Not used (no started badges in aggregate view)
  showCompleted: false,
  showAborted: false,
  showActive: true,
};

export const DEFAULT_INSTANCE_BADGE_SETTINGS: InstanceBadgeSettings = {
  showActive: true,
  showStarted: false,
  showCompleted: true,
  showAborted: true,
  onlyShowWhenGreaterThanOne: true,
};

const STORAGE_KEYS = {
  AGGREGATE: {
    showStarted: 'runway-badge-aggregate-showStarted',
    showCompleted: 'runway-badge-aggregate-showCompleted',
    showAborted: 'runway-badge-aggregate-showAborted',
    showActive: 'runway-badge-aggregate-showActive',
  },
  INSTANCE: {
    showActive: 'runway-badge-instance-showActive',
    showStarted: 'runway-badge-instance-showStarted',
    showCompleted: 'runway-badge-instance-showCompleted',
    showAborted: 'runway-badge-instance-showAborted',
    onlyShowWhenGreaterThanOne: 'runway-badge-instance-onlyWhenGT1',
  },
};

function loadBooleanSetting(key: string, defaultValue: boolean): boolean {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? defaultValue : stored === 'true';
  } catch {
    return defaultValue;
  }
}

function saveBooleanSetting(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value));
  } catch (e) {
    console.warn('Failed to save setting', key, e);
  }
}

export function loadAggregateBadgeSettings(): AggregateBadgeSettings {
  return {
    showStarted: loadBooleanSetting(STORAGE_KEYS.AGGREGATE.showStarted, DEFAULT_AGGREGATE_BADGE_SETTINGS.showStarted),
    showCompleted: loadBooleanSetting(STORAGE_KEYS.AGGREGATE.showCompleted, DEFAULT_AGGREGATE_BADGE_SETTINGS.showCompleted),
    showAborted: loadBooleanSetting(STORAGE_KEYS.AGGREGATE.showAborted, DEFAULT_AGGREGATE_BADGE_SETTINGS.showAborted),
    showActive: loadBooleanSetting(STORAGE_KEYS.AGGREGATE.showActive, DEFAULT_AGGREGATE_BADGE_SETTINGS.showActive),
  };
}

export function loadInstanceBadgeSettings(): InstanceBadgeSettings {
  return {
    showActive: loadBooleanSetting(STORAGE_KEYS.INSTANCE.showActive, DEFAULT_INSTANCE_BADGE_SETTINGS.showActive),
    showStarted: loadBooleanSetting(STORAGE_KEYS.INSTANCE.showStarted, DEFAULT_INSTANCE_BADGE_SETTINGS.showStarted),
    showCompleted: loadBooleanSetting(STORAGE_KEYS.INSTANCE.showCompleted, DEFAULT_INSTANCE_BADGE_SETTINGS.showCompleted),
    showAborted: loadBooleanSetting(STORAGE_KEYS.INSTANCE.showAborted, DEFAULT_INSTANCE_BADGE_SETTINGS.showAborted),
    onlyShowWhenGreaterThanOne: loadBooleanSetting(STORAGE_KEYS.INSTANCE.onlyShowWhenGreaterThanOne, DEFAULT_INSTANCE_BADGE_SETTINGS.onlyShowWhenGreaterThanOne),
  };
}

interface BadgeSettingsProps {
  mode: 'aggregated' | 'instance';
  onSettingsChange?: (settings: AggregateBadgeSettings | InstanceBadgeSettings) => void;
}

export default function BadgeSettings({ mode, onSettingsChange }: Readonly<BadgeSettingsProps>) {
  const [aggregateSettings, setAggregateSettings] = useState<AggregateBadgeSettings>(() => loadAggregateBadgeSettings());
  const [instanceSettings, setInstanceSettings] = useState<InstanceBadgeSettings>(() => loadInstanceBadgeSettings());

  // Notify parent of changes
  useEffect(() => {
    if (onSettingsChange) {
      onSettingsChange(mode === 'aggregated' ? aggregateSettings : instanceSettings);
    }
  }, [mode, aggregateSettings, instanceSettings, onSettingsChange]);

  const handleAggregateChange = (key: keyof AggregateBadgeSettings, value: boolean) => {
    const newSettings = { ...aggregateSettings, [key]: value };
    console.log('[BadgeSettings] Aggregate changed:', key, '=', value, 'New settings:', newSettings);
    setAggregateSettings(newSettings);
    saveBooleanSetting(STORAGE_KEYS.AGGREGATE[key], value);
  };

  const handleInstanceChange = (key: keyof InstanceBadgeSettings, value: boolean) => {
    const newSettings = { ...instanceSettings, [key]: value };
    setInstanceSettings(newSettings);
    saveBooleanSetting(STORAGE_KEYS.INSTANCE[key], value);
  };

  const restoreDefaults = () => {
    if (mode === 'aggregated') {
      setAggregateSettings(DEFAULT_AGGREGATE_BADGE_SETTINGS);
      // Clear all stored values
      Object.keys(STORAGE_KEYS.AGGREGATE).forEach(key => {
        try {
          localStorage.removeItem(STORAGE_KEYS.AGGREGATE[key as keyof typeof STORAGE_KEYS.AGGREGATE]);
        } catch {}
      });
    } else {
      setInstanceSettings(DEFAULT_INSTANCE_BADGE_SETTINGS);
      // Clear all stored values
      Object.keys(STORAGE_KEYS.INSTANCE).forEach(key => {
        try {
          localStorage.removeItem(STORAGE_KEYS.INSTANCE[key as keyof typeof STORAGE_KEYS.INSTANCE]);
        } catch {}
      });
    }
  };

  if (mode === 'aggregated') {
    return (
      <div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16
        }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>
            Aggregate View Badges
          </div>
          <Button
            size="small"
            onClick={restoreDefaults}
            style={{ fontSize: 11 }}
          >
            Restore Defaults
          </Button>
        </div>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Checkbox
            checked={aggregateSettings.showCompleted}
            onChange={(e) => handleAggregateChange('showCompleted', e.target.checked)}
          >
            Total count completed
          </Checkbox>
          <Checkbox
            checked={aggregateSettings.showAborted}
            onChange={(e) => handleAggregateChange('showAborted', e.target.checked)}
          >
            Total count aborted
          </Checkbox>
          <Checkbox
            checked={aggregateSettings.showActive}
            onChange={(e) => handleAggregateChange('showActive', e.target.checked)}
          >
            Amount currently active
          </Checkbox>
        </Space>
      </div>
    );
  }

  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16
      }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>
          Instance View Badges
        </div>
        <Button
          size="small"
          onClick={restoreDefaults}
          style={{ fontSize: 11 }}
        >
          Restore Defaults
        </Button>
      </div>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Checkbox
          checked={instanceSettings.showActive}
          onChange={(e) => handleInstanceChange('showActive', e.target.checked)}
        >
          Show "Active"
        </Checkbox>
        <Checkbox
          checked={instanceSettings.showStarted}
          onChange={(e) => handleInstanceChange('showStarted', e.target.checked)}
        >
          Show "Started"
        </Checkbox>
        <Checkbox
          checked={instanceSettings.showCompleted}
          onChange={(e) => handleInstanceChange('showCompleted', e.target.checked)}
        >
          Show "Completed"
        </Checkbox>
        <Checkbox
          checked={instanceSettings.showAborted}
          onChange={(e) => handleInstanceChange('showAborted', e.target.checked)}
        >
          Show "Aborted"
        </Checkbox>
        <Divider style={{ margin: '8px 0' }} />
        <Checkbox
          checked={instanceSettings.onlyShowWhenGreaterThanOne}
          onChange={(e) => handleInstanceChange('onlyShowWhenGreaterThanOne', e.target.checked)}
        >
          Only show when &gt; 1
        </Checkbox>
      </Space>
    </div>
  );
}

