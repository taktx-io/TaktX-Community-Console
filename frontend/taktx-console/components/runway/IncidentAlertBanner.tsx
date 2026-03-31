import { Alert, Button, Tooltip } from 'antd';

interface IncidentAlertBannerProps {
  /** Incident information */
  incident: {
    message?: string;
    elementInstanceIdPath?: string[];
  };
  /** Callback when stacktrace button is clicked */
  onShowStacktrace: () => void;
}

/**
 * IncidentAlertBanner - Displays incident error message with stacktrace button
 *
 * Shows:
 * - Error message (truncated with tooltip)
 * - Element path if available
 * - Button to open stacktrace modal
 */
export default function IncidentAlertBanner({
  incident,
  onShowStacktrace
}: IncidentAlertBannerProps) {
  const message = incident?.message ?? 'Error occurred';
  const elementPath = incident?.elementInstanceIdPath;
  const elementPathText = elementPath ? ` — Element path: ${elementPath.join(' > ')}` : '';
  const fullText = message + elementPathText;

  return (
    <div style={{ marginBottom: 8 }}>
      <Alert
        type="error"
        showIcon
        style={{ fontSize: 12 }}
        description={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Truncated single-line message with tooltip for full content */}
              <Tooltip title={fullText} placement="bottomLeft">
                <span
                  aria-label={message}
                  style={{
                    color: '#333',
                    fontWeight: 400,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: 'inline-block',
                    verticalAlign: 'middle',
                    maxWidth: '100%'
                  }}
                >
                  {fullText}
                </span>
              </Tooltip>
            </div>
            <div style={{ flex: '0 0 auto' }}>
              <Button size="small" onClick={onShowStacktrace}>
                Stacktrace
              </Button>
            </div>
          </div>
        }
      />
    </div>
  );
}

