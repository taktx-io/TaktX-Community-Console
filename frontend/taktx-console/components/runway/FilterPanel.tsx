'use client';

import { Select, Space, Checkbox, Tabs } from 'antd';
import {
  FilterOutlined,
  LeftOutlined,
  RightOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';
import { EXECUTION_STATES } from '@/lib/types/filters';
import type { OverlaySettingsState } from './OverlaySettings';
import type { ProcessDefinitionVersionInfo } from '@/lib/api/runwayApi';
import { useMemo } from 'react';
import InstanceSelectionFilter from './InstanceSelectionFilter';
import TimeRangeFilter from './TimeRangeFilter';

/**
 * Helper to convert hex to lighter background color (92% white blend)
 */
function hexToLightBackground(hex: string): string {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);

  const blend = 0.92; // Very light background
  const lr = Math.round(r * (1 - blend) + 255 * blend);
  const lg = Math.round(g * (1 - blend) + 255 * blend);
  const lb = Math.round(b * (1 - blend) + 255 * blend);

  return `rgb(${lr}, ${lg}, ${lb})`;
}

/**
 * Helper to get border color (70% white blend - slightly darker than background)
 */
function hexToBorderColor(hex: string): string {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);

  const blend = 0.7; // Medium lightness for border
  const lr = Math.round(r * (1 - blend) + 255 * blend);
  const lg = Math.round(g * (1 - blend) + 255 * blend);
  const lb = Math.round(b * (1 - blend) + 255 * blend);

  return `rgb(${lr}, ${lg}, ${lb})`;
}

/**
 * Helper to darken color for text to ensure good contrast (same algorithm as badges)
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

interface FilterPanelProps {
  processDefinitionIds: string[];
  selectedDefinitionId: string | null;
  onDefinitionChange: (id: string | null) => void;
  versions: ProcessDefinitionVersionInfo[];
  selectedVersion: number | null;
  onVersionChange: (version: number | null) => void;
  selectedStates: string[];
  onStatesChange: (states: string[]) => void;
  overlaySettings?: OverlaySettingsState;
  versionsDisabled?: boolean;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  // New props for instance selection
  filterMode: 'definition' | 'instance';
  onFilterModeChange: (mode: 'definition' | 'instance') => void;
  instanceSelectionMode?: 'manual' | 'bookmarks';
  onInstanceSelectionModeChange?: (mode: 'manual' | 'bookmarks') => void;
  manualInstanceIds: string[];
  onManualInstanceIdsChange: (ids: string[]) => void;
  selectedBookmark: string | null;
  onSelectedBookmarkChange: (bookmarkName: string | null) => void;
  bookmarkRefreshTrigger?: number;
  onBookmarkSaved?: () => void;
  // Date range filter props for start time
  startTimeFrom: Date | null;
  startTimeTo: Date | null;
  onStartTimeRangeChange: (from: Date | null, to: Date | null) => void;
  // Date range filter props for end time
  endTimeFrom: Date | null;
  endTimeTo: Date | null;
  onEndTimeRangeChange: (from: Date | null, to: Date | null) => void;
}

/**
 * Collapsible filter panel for process definition and version selection.
 * Positioned on the left side of the content area.
 */
export default function FilterPanel({
  processDefinitionIds,
  selectedDefinitionId,
  onDefinitionChange,
  versions,
  selectedVersion,
  onVersionChange,
  selectedStates,
  onStatesChange,
  overlaySettings,
  versionsDisabled = false,
  collapsed = false,
  onCollapsedChange,
  filterMode,
  onFilterModeChange,
  instanceSelectionMode,
  onInstanceSelectionModeChange,
  manualInstanceIds,
  onManualInstanceIdsChange,
  selectedBookmark,
  onSelectedBookmarkChange,
  bookmarkRefreshTrigger,
  onBookmarkSaved,
  startTimeFrom,
  startTimeTo,
  onStartTimeRangeChange,
  endTimeFrom,
  endTimeTo,
  onEndTimeRangeChange,
}: Readonly<FilterPanelProps>) {
  const handleToggleCollapsed = () => {
    const newCollapsed = !collapsed;
    onCollapsedChange?.(newCollapsed);
  };

  // Memoize state colors - computed only when overlaySettings changes
  // Use default colors for SSR to avoid hydration mismatch
  const stateColors = useMemo(() => {
    // Map states to overlay colors (from localStorage settings)
    // During SSR, overlaySettings will be undefined, so we use defaults
    const incomingColor = overlaySettings?.incomingColor || '#00ff88'; // ACTIVE
    const outgoingColor = overlaySettings?.outgoingColor || '#00aaff'; // COMPLETED
    const abortedColor = overlaySettings?.abortedColor || '#888888'; // ABORTED
    const incidentColor = overlaySettings?.incidentColor || '#ff4444'; // INCIDENT

    return {
      ACTIVE: {
        dot: incomingColor,
        bg: hexToLightBackground(incomingColor),
        border: hexToBorderColor(incomingColor),
        text: hexToDarkText(incomingColor),
      },
      COMPLETED: {
        dot: outgoingColor,
        bg: hexToLightBackground(outgoingColor),
        border: hexToBorderColor(outgoingColor),
        text: hexToDarkText(outgoingColor),
      },
      ABORTED: {
        dot: abortedColor,
        bg: hexToLightBackground(abortedColor),
        border: hexToBorderColor(abortedColor),
        text: hexToDarkText(abortedColor),
      },
      INCIDENT: {
        dot: incidentColor,
        bg: hexToLightBackground(incidentColor),
        border: hexToBorderColor(incidentColor),
        text: hexToDarkText(incidentColor),
      },
    };
  }, [overlaySettings?.incomingColor, overlaySettings?.outgoingColor, overlaySettings?.abortedColor, overlaySettings?.incidentColor]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Collapse/Expand Button */}
      <div
        style={{
          padding: '8px',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          background: '#fafafa',
        }}
        onClick={handleToggleCollapsed}
      >
        <Space size="small">
          <FilterOutlined style={{ fontSize: 16 }} />
          {!collapsed && <span style={{ fontWeight: 500 }}>Filters</span>}
        </Space>
        {collapsed ? <RightOutlined style={{ fontSize: 12 }} /> : <LeftOutlined style={{ fontSize: 12 }} />}
      </div>

      {/* Filter Content */}
      {!collapsed && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <Tabs
            activeKey={filterMode}
            onChange={(key) => onFilterModeChange(key as 'definition' | 'instance')}
            style={{ padding: '0 16px', height: '100%' }}
            items={[
              {
                key: 'definition',
                label: 'Definition Filter',
                children: (
                  <div style={{ paddingBottom: 16, overflow: 'auto', height: 'calc(100vh - 200px)' }}>
                    <Space direction="vertical" style={{ width: '100%' }} size="large">
                      {/* Process Definition Filter */}
                      <div>
                        <label
                          htmlFor="filter-process-definition"
                          style={{
                            display: 'block',
                            marginBottom: 8,
                            fontSize: 13,
                            fontWeight: 500,
                            color: '#262626',
                          }}
                        >
                          Process Definition
                        </label>
                        <Select
                          id="filter-process-definition"
                data-testid="filter-process-definition"
                style={{ width: '100%' }}
                placeholder="Select definition"
                value={selectedDefinitionId}
                onChange={onDefinitionChange}
                options={processDefinitionIds.map(id => ({ label: id, value: id }))}
                showSearch
                allowClear
                filterOption={(input, option) =>
                  (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                }
              />
            </div>

            {/* Version Filter */}
            <div>
              <label
                htmlFor="filter-version"
                style={{
                  display: 'block',
                  marginBottom: 8,
                  fontSize: 13,
                  fontWeight: 500,
                  color: '#262626',
                }}
              >
                Version
              </label>
              <Select
                key={`version-select-${selectedDefinitionId}`}
                id="filter-version"
                data-testid="filter-version"
                style={{ width: '100%' }}
                placeholder="Select version"
                value={selectedVersion ?? undefined}
                onChange={(v) => onVersionChange(v == null ? null : Number(v))}
                disabled={versionsDisabled || !selectedDefinitionId || versions.length === 0}
                options={versions.map(vInfo => ({
                  label: `v${vInfo.version}`,
                  value: vInfo.version,
                  versionTag: vInfo.versionTag,
                }))}
                labelRender={(props) => {
                  // Find the version info to get the tag
                  const versionInfo = versions.find(v => v.version === props.value);
                  const versionTag = versionInfo?.versionTag;

                  return (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', maxWidth: '100%', overflow: 'hidden' }}>
                      <span style={{ flexShrink: 0 }}>v{props.value}</span>
                      {versionTag && (
                        <span
                          title={versionTag}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '1px 6px',
                            fontSize: '11px',
                            fontWeight: 500,
                            color: '#1890ff',
                            background: '#e6f7ff',
                            border: '1px solid #91d5ff',
                            borderRadius: '8px',
                            lineHeight: '1.2',
                            maxWidth: '160px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flexShrink: 1,
                          }}>
                          {versionTag}
                        </span>
                      )}
                    </span>
                  );
                }}
                optionRender={(option) => {
                  const versionTag = (option.data as any)?.versionTag;
                  return (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px', maxWidth: '100%', overflow: 'hidden' }}>
                      <span style={{ flexShrink: 0 }}>v{option.value}</span>
                      {versionTag && (
                        <span
                          title={versionTag}
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            fontSize: '11px',
                            fontWeight: 500,
                            color: '#1890ff',
                            background: '#e6f7ff',
                            border: '1px solid #91d5ff',
                            borderRadius: '10px',
                            maxWidth: '220px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flexShrink: 1,
                          }}>
                          {versionTag}
                        </span>
                      )}
                    </span>
                  );
                }}
                allowClear
              />
            </div>

            {/* State Filter */}
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <label
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: '#262626',
                  }}
                >
                  State
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => onStatesChange(Object.values(EXECUTION_STATES))}
                    style={{
                      border: 'none',
                      background: 'none',
                      color: '#1890ff',
                      fontSize: 11,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    All
                  </button>
                  <button
                    onClick={() => onStatesChange([])}
                    style={{
                      border: 'none',
                      background: 'none',
                      color: '#8c8c8c',
                      fontSize: 11,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    None
                  </button>
                </div>
              </div>
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                {Object.entries(EXECUTION_STATES).map(([key, value]) => {
                  const isChecked = selectedStates.includes(value);
                  const colors = stateColors[value as keyof typeof stateColors];

                  // Determine which icon to use based on state
                  let StateIcon;
                  if (value === 'ACTIVE') {
                    StateIcon = SyncOutlined;
                  } else if (value === 'COMPLETED') {
                    StateIcon = CheckCircleOutlined;
                  } else if (value === 'ABORTED') {
                    StateIcon = CloseCircleOutlined;
                  } else if (value === 'INCIDENT') {
                    StateIcon = ExclamationCircleOutlined;
                  }

                  return (
                    <label
                      key={value}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        cursor: 'pointer',
                        padding: '6px 8px',
                        borderRadius: 4,
                        background: isChecked ? colors.bg : 'transparent',
                        border: `1px solid ${isChecked ? colors.border : 'transparent'}`,
                        transition: 'all 0.2s',
                      }}
                    >
                      <Checkbox
                        data-testid={`filter-state-${value.toLowerCase()}`}
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            onStatesChange([...selectedStates, value]);
                          } else {
                            onStatesChange(selectedStates.filter(s => s !== value));
                          }
                        }}
                      />
                      {StateIcon && (
                        <StateIcon
                          style={{
                            fontSize: 14,
                            color: colors.text,
                            flexShrink: 0,
                          }}
                        />
                      )}
                      <span
                        style={{
                          fontSize: 13,
                          color: colors.text,
                          fontWeight: isChecked ? 500 : 400,
                        }}
                      >
                        {key.charAt(0) + key.slice(1).toLowerCase()}
                      </span>
                    </label>
                  );
                })}
              </Space>
            </div>

            {/* Time Range Filters */}
            <div>
              <label
                style={{
                  display: 'block',
                  marginBottom: 8,
                  fontSize: 13,
                  fontWeight: 500,
                  color: '#262626',
                }}
              >
                Process Start Time
              </label>
              <TimeRangeFilter
                startTime={startTimeFrom}
                endTime={startTimeTo}
                onTimeChange={onStartTimeRangeChange}
              />
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  marginBottom: 8,
                  fontSize: 13,
                  fontWeight: 500,
                  color: '#262626',
                }}
              >
                Process End Time
              </label>
              <TimeRangeFilter
                startTime={endTimeFrom}
                endTime={endTimeTo}
                onTimeChange={onEndTimeRangeChange}
              />
            </div>

            {/* Info Text */}
            {(selectedDefinitionId || selectedStates.length < Object.keys(EXECUTION_STATES).length || startTimeFrom || startTimeTo || endTimeFrom || endTimeTo) && (
              <div
                style={{
                  padding: '10px 12px',
                  background: '#f0f7ff',
                  borderRadius: 6,
                  fontSize: 12,
                  color: '#0958d9',
                  border: '1px solid #d6e4ff',
                }}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 6
                }}>
                  <div style={{ fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', opacity: 0.8 }}>
                    Active Filters
                  </div>
                  <button
                    onClick={() => {
                      onDefinitionChange(null);
                      onVersionChange(null);
                      onStatesChange(Object.values(EXECUTION_STATES));
                      onStartTimeRangeChange(null, null);
                      onEndTimeRangeChange(null, null);
                    }}
                    style={{
                      border: 'none',
                      background: 'none',
                      color: '#ff4d4f',
                      fontSize: 11,
                      cursor: 'pointer',
                      padding: '2px 4px',
                      fontWeight: 500,
                      textDecoration: 'underline',
                    }}
                    title="Clear all filters"
                  >
                    Clear all
                  </button>
                </div>
                {selectedDefinitionId && <div style={{ marginBottom: 3 }}>• {selectedDefinitionId}</div>}
                {selectedVersion !== null && <div style={{ marginBottom: 3 }}>• Version {selectedVersion}</div>}
                {selectedStates.length > 0 && selectedStates.length < Object.keys(EXECUTION_STATES).length && (
                  <div style={{ marginBottom: 3 }}>• {selectedStates.map(s => s.charAt(0) + s.slice(1).toLowerCase()).join(', ')}</div>
                )}
                {(startTimeFrom || startTimeTo) && (
                  <div style={{ marginBottom: 3 }}>
                    • Start Time: {startTimeFrom ? startTimeFrom.toLocaleString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      hour12: false
                    }) : 'Any'} → {startTimeTo ? startTimeTo.toLocaleString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      hour12: false
                    }) : 'Now'}
                  </div>
                )}
                {(endTimeFrom || endTimeTo) && (
                  <div style={{ marginBottom: 3 }}>
                    • End Time: {endTimeFrom ? endTimeFrom.toLocaleString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      hour12: false
                    }) : 'Any'} → {endTimeTo ? endTimeTo.toLocaleString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      hour12: false
                    }) : 'Now'}
                  </div>
                )}
              </div>
            )}
          </Space>
                  </div>
                ),
              },
              {
                key: 'instance',
                label: 'Instance Selection',
                children: (
                  <InstanceSelectionFilter
                    instanceSelectionMode={instanceSelectionMode}
                    onInstanceSelectionModeChange={onInstanceSelectionModeChange}
                    manualInstanceIds={manualInstanceIds}
                    onManualIdsChange={onManualInstanceIdsChange}
                    selectedBookmark={selectedBookmark}
                    onSelectedBookmarkChange={onSelectedBookmarkChange}
                    bookmarkRefreshTrigger={bookmarkRefreshTrigger}
                    onBookmarkSaved={onBookmarkSaved}
                  />
                ),
              },
            ]}
          />
        </div>
      )}
    </div>
  );
}

