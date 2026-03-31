import { Space, Button, Tooltip, Badge } from 'antd';
import { LinkOutlined, ThunderboltOutlined, BgColorsOutlined, TagsOutlined, PlayCircleOutlined, UnorderedListOutlined } from '@ant-design/icons';
import StatusBadge from './StatusBadge';

interface DiagramCardHeaderProps {
  /** Whether realtime highlights are enabled */
  realtimeHighlightsEnabled: boolean;
  /** Toggle realtime highlights */
  onToggleRealtimeHighlights: () => void;
  /** Whether overlay settings panel is open */
  overlayOpen: boolean;
  /** Toggle overlay settings panel */
  onToggleOverlay: () => void;
  /** Whether badge settings panel is open */
  badgeSettingsOpen?: boolean;
  /** Toggle badge settings panel */
  onToggleBadgeSettings?: () => void;
  /** WebSocket connection status */
  wsStatus: 'open' | 'connecting' | 'closed' | 'error';
  /** WebSocket URL */
  wsUrl?: string;
  /** Force fallback callback */
  onForceFallback?: () => void;
  /** Test WebSocket callback */
  onTestWebSocket?: () => void;
  /** Share link callback */
  onShareLink?: () => void;
  /** Whether to show share link button (default: false) */
  showShareLink?: boolean;
  /** Whether to show badge settings button (default: false) */
  showBadgeSettings?: boolean;
  /** Start instance callback (optional - shown when BPMN is loaded) */
  onStartInstance?: () => void;
  /** Whether to show start instance button (default: false) */
  showStartInstance?: boolean;
  /** Whether jobs panel is collapsed */
  jobsPanelCollapsed?: boolean;
  /** Toggle jobs panel */
  onToggleJobsPanel?: () => void;
  /** Active jobs count for badge */
  activeJobsCount?: number;
}

/**
 * DiagramCardHeader - Controls bar for BPMN diagram and overview cards
 *
 * Displays:
 * - Share link button (optional)
 * - Realtime highlights toggle
 * - Badge settings toggle (optional)
 * - Overlay settings toggle
 * - WebSocket status badge
 */
export default function DiagramCardHeader({
  realtimeHighlightsEnabled,
  onToggleRealtimeHighlights,
  overlayOpen,
  onToggleOverlay,
  badgeSettingsOpen,
  onToggleBadgeSettings,
  wsStatus,
  wsUrl,
  onForceFallback,
  onTestWebSocket,
  onShareLink,
  showShareLink = false,
  showBadgeSettings = false,
  onStartInstance,
  showStartInstance = false,
  jobsPanelCollapsed,
  onToggleJobsPanel,
  activeJobsCount = 0,
}: DiagramCardHeaderProps) {
  return (
    <Space size="small" align="center">
      {showStartInstance && onStartInstance && (
        <Tooltip title="Start process instances" placement="bottom">
          <Button
            type="text"
            size="small"
            aria-label="Start process instances"
            icon={<PlayCircleOutlined style={{ fontSize: 16, color: '#52c41a' }} />}
            onClick={onStartInstance}
            style={{ padding: 4 }}
          />
        </Tooltip>
      )}

      {onToggleJobsPanel && (
        <Tooltip title={jobsPanelCollapsed ? 'Show jobs panel' : 'Hide jobs panel'} placement="bottom">
          <Badge count={activeJobsCount} size="small" offset={[-2, 2]}>
            <Button
              type="text"
              size="small"
              aria-label="Toggle jobs panel"
              icon={<UnorderedListOutlined style={{ fontSize: 16, color: jobsPanelCollapsed ? '#8c8c8c' : '#1890ff' }} />}
              onClick={onToggleJobsPanel}
              style={{ padding: 4 }}
            />
          </Badge>
        </Tooltip>
      )}

      {showShareLink && onShareLink && (
        <Tooltip title="Copy shareable link" placement="bottom">
          <Button
            type="text"
            size="small"
            aria-label="Copy shareable link"
            icon={<LinkOutlined style={{ fontSize: 16, color: '#8c8c8c' }} />}
            onClick={onShareLink}
            style={{ padding: 4 }}
          />
        </Tooltip>
      )}

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 8px',
        background: '#f5f5f5',
        borderRadius: 6,
        marginRight: 8
      }}>
        <Tooltip
          title={realtimeHighlightsEnabled ? 'Realtime highlights enabled' : 'Realtime highlights disabled'}
          placement="bottom"
        >
          <Button
            type="text"
            size="small"
            aria-label="Toggle realtime highlights"
            icon={
              <ThunderboltOutlined
                style={{
                  fontSize: 16,
                  color: realtimeHighlightsEnabled ? '#52c41a' : '#8c8c8c'
                }}
              />
            }
            onClick={onToggleRealtimeHighlights}
            style={{ padding: 4 }}
          />
        </Tooltip>

        {showBadgeSettings && onToggleBadgeSettings && (
          <Tooltip title="Badge settings" placement="bottom">
            <Button
              type="text"
              size="small"
              aria-label="Open badge settings"
              icon={
                <TagsOutlined
                  style={{
                    fontSize: 16,
                    color: badgeSettingsOpen ? '#1890ff' : '#8c8c8c'
                  }}
                />
              }
              onClick={onToggleBadgeSettings}
              style={{ padding: 4 }}
            />
          </Tooltip>
        )}

        <Tooltip title="Colors & highlight settings" placement="bottom">
          <Button
            type="text"
            size="small"
            aria-label="Open Colors & highlight settings"
            icon={
              <BgColorsOutlined
                style={{
                  fontSize: 16,
                  color: overlayOpen ? '#1890ff' : '#8c8c8c'
                }}
              />
            }
            onClick={onToggleOverlay}
            style={{ padding: 4 }}
          />
        </Tooltip>
      </div>

      <StatusBadge
        status={wsStatus}
        url={wsUrl}
        onForceFallback={onForceFallback}
        onTest={onTestWebSocket}
      />
    </Space>
  );
}

