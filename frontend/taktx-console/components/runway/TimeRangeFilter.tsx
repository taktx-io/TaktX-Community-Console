'use client';

import { useState, useEffect, useRef } from 'react';
import { DatePicker, Input, Select, Tabs, Button, Space, Popover, Switch } from 'antd';
import { ClockCircleOutlined, CalendarOutlined, SyncOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';

type TimeMode = 'absolute' | 'relative' | 'now';
type RelativeUnit = 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years';

interface TimeConfig {
  mode: TimeMode;
  // For relative mode
  relativeValue?: number;
  relativeUnit?: RelativeUnit;
  // For absolute mode
  absoluteDate?: Date;
  // Common
  roundToDay?: boolean;
}

interface TimeRangeFilterProps {
  startTime: Date | null;
  endTime: Date | null;
  onTimeChange: (start: Date | null, end: Date | null) => void;
}

interface QuickRange {
  label: string;
  startConfig: TimeConfig;
  endConfig: TimeConfig;
}

const QUICK_RANGES: QuickRange[] = [
  {
    label: 'Last 15 minutes',
    startConfig: { mode: 'relative', relativeValue: 15, relativeUnit: 'minutes' },
    endConfig: { mode: 'now' },
  },
  {
    label: 'Last 30 minutes',
    startConfig: { mode: 'relative', relativeValue: 30, relativeUnit: 'minutes' },
    endConfig: { mode: 'now' },
  },
  {
    label: 'Last 1 hour',
    startConfig: { mode: 'relative', relativeValue: 1, relativeUnit: 'hours' },
    endConfig: { mode: 'now' },
  },
  {
    label: 'Last 4 hours',
    startConfig: { mode: 'relative', relativeValue: 4, relativeUnit: 'hours' },
    endConfig: { mode: 'now' },
  },
  {
    label: 'Last 24 hours',
    startConfig: { mode: 'relative', relativeValue: 24, relativeUnit: 'hours' },
    endConfig: { mode: 'now' },
  },
  {
    label: 'Last 7 days',
    startConfig: { mode: 'relative', relativeValue: 7, relativeUnit: 'days' },
    endConfig: { mode: 'now' },
  },
  {
    label: 'Last 30 days',
    startConfig: { mode: 'relative', relativeValue: 30, relativeUnit: 'days' },
    endConfig: { mode: 'now' },
  },
  {
    label: 'Last 90 days',
    startConfig: { mode: 'relative', relativeValue: 90, relativeUnit: 'days' },
    endConfig: { mode: 'now' },
  },
];

// Helper function to compute date from config - must be defined before TimeConfigEditor
function computeDateFromConfig(config: TimeConfig): Date | null {
  const now = new Date();

  switch (config.mode) {
    case 'now':
      // Return null for 'now' mode so the API treats it as unbounded (live query)
      return null;

    case 'relative': {
      const value = config.relativeValue || 0;
      const unit = config.relativeUnit || 'hours';
      const date = dayjs(now);

      let result: Dayjs;
      switch (unit) {
        case 'seconds':
          result = date.subtract(value, 'second');
          break;
        case 'minutes':
          result = date.subtract(value, 'minute');
          break;
        case 'hours':
          result = date.subtract(value, 'hour');
          break;
        case 'days':
          result = date.subtract(value, 'day');
          break;
        case 'weeks':
          result = date.subtract(value, 'week');
          break;
        case 'months':
          result = date.subtract(value, 'month');
          break;
        case 'years':
          result = date.subtract(value, 'year');
          break;
        default:
          result = date;
      }

      if (config.roundToDay) {
        result = result.startOf('day');
      }

      return result.toDate();
    }

    case 'absolute': {
      if (!config.absoluteDate) return null;

      let result = dayjs(config.absoluteDate);
      if (config.roundToDay) {
        result = result.startOf('day');
      }

      return result.toDate();
    }

    default:
      return null;
  }
}

function TimeConfigEditor({
  label,
  config,
  onChange,
  isEndDate = false,
}: {
  label: string;
  config: TimeConfig;
  onChange: (config: TimeConfig) => void;
  isEndDate?: boolean;
}) {
  const [manualInput, setManualInput] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [lastFormattedDate, setLastFormattedDate] = useState('');

  const computedDate = computeDateFromConfig(config);

  // Format for display: "MMM D, YYYY @ HH:mm:ss" (no milliseconds)
  // Show "Any" for start date in 'now' mode, "Now" for end date
  const formattedDate = config.mode === 'now'
    ? (isEndDate ? 'Now' : 'Any')
    : computedDate
    ? dayjs(computedDate).format('MMM D, YYYY [@@] HH:mm:ss')
    : '';

  // Update manual input when formatted date changes (but not while editing)
  if (!isEditing && formattedDate !== lastFormattedDate) {
    setManualInput(formattedDate);
    setLastFormattedDate(formattedDate);
  }

  const handleManualInputChange = (value: string) => {
    setManualInput(value);
  };

  const handleManualInputFocus = () => {
    setIsEditing(true);
  };

  const handleManualInputBlur = () => {
    setIsEditing(false);
    // Try to parse the manual input
    const parsed = parseManualInput(manualInput);
    if (parsed) {
      onChange({ mode: 'absolute', absoluteDate: parsed });
    } else {
      // Reset to computed value if invalid
      setManualInput(formattedDate);
    }
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        marginBottom: 8,
        fontSize: 13,
        fontWeight: 500,
        color: '#262626'
      }}>
        {label}
      </div>

      <Tabs
        size="small"
        activeKey={config.mode}
        onChange={(key) => {
          const newMode = key as TimeMode;

          // When switching to absolute mode, set a default date if not already set
          if (newMode === 'absolute' && !config.absoluteDate) {
            // Use the computed date from current mode as the starting point
            const currentDate = computeDateFromConfig(config) || new Date();
            onChange({
              mode: 'absolute',
              absoluteDate: currentDate,
              roundToDay: config.roundToDay
            });
          } else if (newMode === 'relative' && !config.relativeValue) {
            // When switching to relative mode, set default values if not set
            onChange({
              mode: 'relative',
              relativeValue: 24,
              relativeUnit: 'hours',
              roundToDay: config.roundToDay
            });
          } else {
            // For other cases (like switching to 'now'), just update the mode
            onChange({ ...config, mode: newMode });
          }
        }}
        style={{ marginBottom: 8 }}
        items={[
          {
            key: 'absolute',
            label: 'Absolute',
            children: (
              <div style={{ paddingTop: 8 }}>
                {/* Date picker only (no time) */}
                <DatePicker
                  format="YYYY-MM-DD"
                  value={config.absoluteDate ? dayjs(config.absoluteDate) : dayjs()}
                  onChange={(date) => {
                    if (date) {
                      // Preserve existing time or use 00:00:00
                      const existingTime = config.absoluteDate ? dayjs(config.absoluteDate) : dayjs().startOf('day');
                      const newDate = date
                        .hour(existingTime.hour())
                        .minute(existingTime.minute())
                        .second(existingTime.second());

                      onChange({
                        ...config,
                        mode: 'absolute',
                        absoluteDate: newDate.toDate(),
                      });
                    }
                  }}
                  style={{ width: '100%', marginBottom: 8 }}
                  size="small"
                  allowClear={false}
                />

                {/* Time dropdown with 15-minute intervals */}
                <Select
                  size="small"
                  style={{ width: '100%' }}
                  value={(() => {
                    if (!config.absoluteDate) return '00:00:00';
                    const d = dayjs(config.absoluteDate);
                    return d.format('HH:mm:ss');
                  })()}
                  onChange={(timeStr) => {
                    const [hours, minutes, seconds] = timeStr.split(':').map(Number);
                    const currentDate = config.absoluteDate ? dayjs(config.absoluteDate) : dayjs();
                    const newDate = currentDate
                      .hour(hours)
                      .minute(minutes)
                      .second(seconds || 0);

                    onChange({
                      ...config,
                      mode: 'absolute',
                      absoluteDate: newDate.toDate(),
                    });
                  }}
                  showSearch
                  placeholder="Select time"
                  options={(() => {
                    const times: { label: string; value: string }[] = [];
                    for (let h = 0; h < 24; h++) {
                      for (let m = 0; m < 60; m += 15) {
                        const hStr = h.toString().padStart(2, '0');
                        const mStr = m.toString().padStart(2, '0');
                        times.push({
                          label: `${hStr}:${mStr}`,
                          value: `${hStr}:${mStr}:00`,
                        });
                      }
                    }
                    return times;
                  })()}
                />

                <div style={{ marginTop: 8 }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: 12,
                    cursor: 'pointer'
                  }}>
                    <Switch
                      size="small"
                      checked={config.roundToDay || false}
                      onChange={(checked) => onChange({ ...config, roundToDay: checked })}
                      style={{ marginRight: 8 }}
                    />
                    Round to the day
                  </label>
                </div>
              </div>
            ),
          },
          {
            key: 'relative',
            label: 'Relative',
            children: (
              <div style={{ paddingTop: 8 }}>
                <Space.Compact style={{ width: '100%' }}>
                  <Input
                    type="number"
                    min={1}
                    value={config.relativeValue || 1}
                    onChange={(e) => {
                      onChange({
                        ...config,
                        mode: 'relative',
                        relativeValue: Number.parseInt(e.target.value) || 1,
                        relativeUnit: config.relativeUnit || 'hours',
                      });
                    }}
                    style={{ width: '35%' }}
                    size="small"
                  />
                  <Select
                    value={config.relativeUnit || 'hours'}
                    onChange={(value) => {
                      onChange({
                        ...config,
                        mode: 'relative',
                        relativeValue: config.relativeValue || 1,
                        relativeUnit: value,
                      });
                    }}
                    style={{ width: '65%' }}
                    size="small"
                    options={[
                      { label: 'seconds ago', value: 'seconds' },
                      { label: 'minutes ago', value: 'minutes' },
                      { label: 'hours ago', value: 'hours' },
                      { label: 'days ago', value: 'days' },
                      { label: 'weeks ago', value: 'weeks' },
                      { label: 'months ago', value: 'months' },
                      { label: 'years ago', value: 'years' },
                    ]}
                  />
                </Space.Compact>
              </div>
            ),
          },
          // Third tab: "Any" for start date, "Now" for end date
          {
            key: 'now',
            label: isEndDate ? 'Now' : 'Any',
            children: (
              <div style={{
                padding: '8px 0',
                color: '#8c8c8c',
                fontSize: 12,
                fontStyle: 'italic'
              }}>
                {isEndDate
                  ? 'Using current time (unbounded)'
                  : 'No start time limit (from the beginning)'}
              </div>
            ),
          },
        ]}
      />

      {/* Editable computed date display */}
      <div style={{ marginTop: 8 }}>
        <Input
          size="small"
          value={manualInput}
          onChange={(e) => handleManualInputChange(e.target.value)}
          onFocus={handleManualInputFocus}
          onBlur={handleManualInputBlur}
          onPressEnter={handleManualInputBlur}
          placeholder="MMM D, YYYY @ HH:mm:ss"
          readOnly={config.mode === 'now'}
          style={{
            fontFamily: 'monospace',
            fontSize: 11,
            background: config.mode === 'now' ? '#f5f5f5' : '#fafafa',
            cursor: config.mode === 'now' ? 'default' : 'text'
          }}
          prefix={<CalendarOutlined style={{ color: '#8c8c8c', fontSize: 12 }} />}
        />
      </div>
    </div>
  );
}

function parseManualInput(input: string): Date | null {
  if (!input) return null;

  // Try various formats (prioritize without milliseconds)
  const formats = [
    'MMM D, YYYY @ HH:mm:ss',
    'MMM D, YYYY @ HH:mm',
    'YYYY-MM-DD HH:mm:ss',
    'YYYY-MM-DD HH:mm',
    'YYYY-MM-DD',
    // Support milliseconds but don't prioritize
    'MMM D, YYYY @ HH:mm:ss.SSS',
    'YYYY-MM-DD HH:mm:ss.SSS',
  ];

  for (const format of formats) {
    const parsed = dayjs(input, format, true);
    if (parsed.isValid()) {
      return parsed.toDate();
    }
  }

  // Try ISO format
  const isoDate = dayjs(input);
  if (isoDate.isValid()) {
    return isoDate.toDate();
  }

  return null;
}

export default function TimeRangeFilter({
  startTime,
  endTime,
  onTimeChange,
}: TimeRangeFilterProps) {
  const [startConfig, setStartConfig] = useState<TimeConfig>(() => {
    // Initialize from props if available
    if (startTime) {
      return { mode: 'absolute', absoluteDate: startTime };
    }
    // Default to "Any" (no start time limit) for "All time" display
    return { mode: 'now' };
  });

  const [endConfig, setEndConfig] = useState<TimeConfig>(() => {
    // Initialize from props if available
    if (endTime) {
      return { mode: 'absolute', absoluteDate: endTime };
    }
    return { mode: 'now' };
  });

  const [popoverOpen, setPopoverOpen] = useState(false);

  // Track previous props to detect external changes
  const prevPropsRef = useRef({ startTime, endTime });

  // Note: We don't auto-apply changes anymore. Changes only apply when user clicks "Apply" button.

  // Sync internal state when props change from external actions (e.g., "Clear all" button)
  // This only runs when props change from outside, not from our own updates
  useEffect(() => {
    const prevStart = prevPropsRef.current.startTime;
    const prevEnd = prevPropsRef.current.endTime;

    // Check if props actually changed
    const propsChanged = prevStart !== startTime || prevEnd !== endTime;

    if (!propsChanged) {
      return;
    }

    // Update ref
    prevPropsRef.current = { startTime, endTime };

    // Only update state if the new props don't match what we'd compute from current config
    const currentStart = computeDateFromConfig(startConfig);
    const currentEnd = computeDateFromConfig(endConfig);

    const startMatches = (startTime === null && currentStart === null) ||
                         (startTime !== null && currentStart !== null &&
                          Math.abs(startTime.getTime() - currentStart.getTime()) < 1000);

    const endMatches = (endTime === null && currentEnd === null) ||
                       (endTime !== null && currentEnd !== null &&
                        Math.abs(endTime.getTime() - currentEnd.getTime()) < 1000);

    if (startMatches && endMatches) {
      return; // Already in sync
    }

    // Update state to match props
    if (startTime === null && endTime === null) {
      setStartConfig({ mode: 'now' });
      setEndConfig({ mode: 'now' });
    } else {
      if (startTime !== null && !startMatches) {
        setStartConfig({ mode: 'absolute', absoluteDate: startTime });
      } else if (startTime === null && currentStart !== null) {
        setStartConfig({ mode: 'now' });
      }

      if (endTime !== null && !endMatches) {
        setEndConfig({ mode: 'absolute', absoluteDate: endTime });
      } else if (endTime === null && currentEnd !== null) {
        setEndConfig({ mode: 'now' });
      }
    }
  }, [startTime, endTime]);

  const handleQuickRangeSelect = (range: QuickRange) => {
    setStartConfig(range.startConfig);
    setEndConfig(range.endConfig);

    // Quick ranges are presets, apply them immediately
    const start = computeDateFromConfig(range.startConfig);
    const end = computeDateFromConfig(range.endConfig);
    onTimeChange(start, end);

    setPopoverOpen(false);
  };

  const handleClear = () => {
    // Reset to "Any → Now" which displays as "All time"
    setStartConfig({ mode: 'now' }); // "Any" for start date
    setEndConfig({ mode: 'now' });   // "Now" for end date
    onTimeChange(null, null);
    setPopoverOpen(false);
  };

  const handleApply = () => {
    const start = computeDateFromConfig(startConfig);
    const end = computeDateFromConfig(endConfig);

    // Validate: don't apply if start >= end (when both are set)
    if (start !== null && end !== null && start.getTime() >= end.getTime()) {
      // Invalid range, don't apply
      return;
    }

    // Apply the changes
    onTimeChange(start, end);
    setPopoverOpen(false);
  };

  const currentStartDate = computeDateFromConfig(startConfig);
  const currentEndDate = computeDateFromConfig(endConfig);

  // Validate: start time should be before end time
  const isInvalidRange = currentStartDate !== null &&
                         currentEndDate !== null &&
                         currentStartDate.getTime() >= currentEndDate.getTime();

  // Format display text
  const displayText = (() => {
    if (!currentStartDate && !currentEndDate) {
      return 'All time';
    }

    const formatDate = (date: Date | null, isStart: boolean) => {
      if (!date) return isStart ? 'Any' : 'Now';
      const d = dayjs(date);
      const now = dayjs();

      // Get the config for this date (start or end)
      const config = isStart ? startConfig : endConfig;

      // For relative times, show more user-friendly text
      if (config.mode === 'relative') {
        const value = config.relativeValue || 1;
        const unit = config.relativeUnit || 'hours';

        // Shorten unit names for display
        const unitMap: Record<string, string> = {
          'seconds': 's',
          'minutes': 'm',
          'hours': 'h',
          'days': 'd',
          'weeks': 'w',
          'months': 'mo',
          'years': 'y',
        };

        return `~${value}${unitMap[unit] || unit} ago`;
      }

      // For absolute mode, always show the actual date with seconds
      if (config.mode === 'absolute') {
        return d.format('MMM D, HH:mm:ss');
      }

      // For dates close to now (when not in absolute mode), show relative time
      const diffMinutes = now.diff(d, 'minute');
      if (Math.abs(diffMinutes) < 60) {
        return `~${Math.abs(diffMinutes)}m`;
      }

      const diffHours = now.diff(d, 'hour');
      if (Math.abs(diffHours) < 24) {
        return `~${Math.abs(diffHours)}h`;
      }

      const diffDays = now.diff(d, 'day');
      if (Math.abs(diffDays) < 7) {
        return `~${Math.abs(diffDays)}d`;
      }

      // For older dates, show actual date
      return d.format('MMM D, HH:mm');
    };

    const startText = formatDate(currentStartDate, true);
    const endText = formatDate(currentEndDate, false);

    return `${startText} → ${endText}`;
  })();

  const content = (
    <div style={{ width: 520, padding: '12px 16px' }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{
          marginBottom: 8,
          fontSize: 11,
          fontWeight: 600,
          color: '#8c8c8c',
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>
          QUICK SELECT
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6 }}>
          {QUICK_RANGES.map((range) => (
            <Button
              key={range.label}
              size="small"
              onClick={() => handleQuickRangeSelect(range)}
              style={{ fontSize: 11 }}
            >
              {range.label}
            </Button>
          ))}
        </div>
      </div>

      <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 16, marginTop: 16 }}>
        <TimeConfigEditor
          label="Start date"
          config={startConfig}
          onChange={setStartConfig}
          isEndDate={false}
        />

        <TimeConfigEditor
          label="End date"
          config={endConfig}
          onChange={setEndConfig}
          isEndDate={true}
        />
      </div>

      {/* Validation warning */}
      {isInvalidRange && (
        <div
          style={{
            marginTop: 12,
            padding: '8px 12px',
            background: '#fff2e8',
            border: '1px solid #ffbb96',
            borderRadius: 4,
            fontSize: 12,
            color: '#d4380d',
          }}
        >
          ⚠️ Start time must be before end time
        </div>
      )}

      <div
        style={{
          borderTop: '1px solid #f0f0f0',
          paddingTop: 12,
          marginTop: 16,
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <Button size="small" onClick={handleClear}>
          Clear
        </Button>
        <Button
          size="small"
          type="primary"
          onClick={handleApply}
          disabled={isInvalidRange}
          title={isInvalidRange ? 'Start time must be before end time' : ''}
        >
          Apply
        </Button>
      </div>
    </div>
  );

  // Check if filter uses dynamic time (relative or now modes)
  const isDynamic = startConfig.mode === 'relative' || startConfig.mode === 'now' ||
                    endConfig.mode === 'relative' || endConfig.mode === 'now';

  return (
    <Popover
      content={content}
      trigger="click"
      placement="bottomLeft"
      open={popoverOpen}
      onOpenChange={setPopoverOpen}
    >
      <Button
        icon={<ClockCircleOutlined />}
        style={{
          width: '100%',
          textAlign: 'left',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          height: 'auto',
          padding: '4px 11px',
          borderColor: isInvalidRange ? '#ff4d4f' : undefined,
          background: isInvalidRange ? '#fff2f0' : undefined,
        }}
        size="small"
        danger={isInvalidRange}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: 12,
            flex: 1,
            color: isInvalidRange ? '#ff4d4f' : undefined,
          }}
        >
          {isInvalidRange ? '⚠️ Invalid range' : displayText}
        </span>
        {isDynamic && !isInvalidRange && (
          <SyncOutlined
            style={{
              marginLeft: 8,
              fontSize: 11,
              color: '#1890ff',
              flexShrink: 0
            }}
          />
        )}
      </Button>
    </Popover>
  );
}

