import { Tooltip } from 'antd';

interface StatusBadgeProps {
  status: 'open' | 'connecting' | 'closed' | 'error';
  url?: string;
  onForceFallback?: () => void;
  onTest?: () => void;
}

/**
 * StatusBadge - Displays WebSocket connection status as a colored indicator
 *
 * @param status - Connection status ('open' | 'connecting' | 'closed' | 'error')
 * @param url - Optional WebSocket URL (not displayed, for debugging)
 * @param onForceFallback - Optional callback to force fallback connection
 * @param onTest - Optional callback to test connection
 */
export default function StatusBadge({
  status,
  url,
  onForceFallback,
  onTest
}: Readonly<StatusBadgeProps>) {
  let statusColor = '#d9d9d9';
  let statusLabel = 'Offline';

  if (status === 'open') {
    statusColor = '#52c41a';
    statusLabel = 'Connected';
  } else if (status === 'connecting') {
    statusColor = '#faad14';
    statusLabel = 'Connecting';
  } else if (status === 'error') {
    statusColor = '#ff4d4f';
    statusLabel = 'Error';
  }

  // Compact icon with tooltip explaining the state. Do not display the raw wsUrl inline.
  return (
    <Tooltip title={statusLabel} placement="bottom">
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span
          aria-label={statusLabel}
          role="img"
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: statusColor,
            display: 'inline-block',
            boxShadow: `0 0 6px ${statusColor}`,
          }}
        />
      </span>
    </Tooltip>
  );
}

