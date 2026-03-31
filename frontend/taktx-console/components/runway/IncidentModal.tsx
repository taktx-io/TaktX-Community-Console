import { Modal, Button, Tooltip, Switch } from 'antd';
import { CopyOutlined } from '@ant-design/icons';

interface IncidentModalProps {
  /** Whether modal is visible */
  open: boolean;
  /** Callback when modal is closed */
  onClose: () => void;
  /** Incident data */
  incident: {
    message?: string;
    stacktrace?: string[];
  } | null;
  /** Whether stacktrace should wrap lines */
  wrapLines: boolean;
  /** Callback when wrap toggle changes */
  onWrapChange: (wrap: boolean) => void;
  /** Callback to copy incident message */
  onCopyMessage: () => void;
  /** Callback to copy stacktrace */
  onCopyStacktrace: () => void;
}

/**
 * IncidentModal - Large modal displaying incident details and stacktrace
 *
 * Features:
 * - Incident message area (30% height)
 * - Stacktrace area (70% height)
 * - Copy buttons for both
 * - Line wrap toggle
 * - Dark theme code display
 */
export default function IncidentModal({
  open,
  onClose,
  incident,
  wrapLines,
  onWrapChange,
  onCopyMessage,
  onCopyStacktrace,
}: IncidentModalProps) {
  const message = incident?.message ?? '';
  const stacktrace = Array.isArray(incident?.stacktrace) && incident.stacktrace.length > 0
    ? incident.stacktrace.join('\n')
    : (incident?.message ?? 'No details');

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      centered
      width={936}
      style={{ maxWidth: '95vw' }}
      styles={{ body: { paddingTop: 8 } }}
      maskClosable={true}
      closable={true}
      title="Incident"
    >
      {/* Content area: message above stacktrace */}
      <div style={{
        paddingTop: 8,
        display: 'flex',
        flexDirection: 'column',
        height: '70vh',
        maxHeight: 720
      }}>
        {/* Message area: 30% height */}
        <div style={{
          flex: '0 0 30%',
          display: 'flex',
          flexDirection: 'column',
          marginBottom: 12,
          minWidth: 0
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingRight: 6
          }}>
            <div style={{ minWidth: 0, overflow: 'hidden', paddingRight: 8 }}>
              <div style={{
                fontSize: 14,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                Incident message
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Tooltip title="Copy incident message">
                <Button
                  size="small"
                  type="text"
                  icon={<CopyOutlined />}
                  onClick={onCopyMessage}
                  aria-label="Copy incident message"
                  style={{ padding: 6, height: 28 }}
                />
              </Tooltip>
            </div>
          </div>

          <textarea
            readOnly
            value={message}
            wrap={wrapLines ? 'soft' : 'off'}
            aria-label="Incident message"
            style={{
              marginTop: 8,
              flex: 1,
              resize: 'none',
              width: '100%',
              boxSizing: 'border-box',
              padding: 12,
              borderRadius: 6,
              border: '1px solid #d9d9d9',
              background: '#0d1117',
              color: '#e6edf3',
              fontFamily: 'monospace',
              fontSize: 13,
              lineHeight: '18px',
              overflow: 'auto',
              whiteSpace: wrapLines ? 'pre-wrap' : 'pre',
              wordBreak: wrapLines ? 'break-word' : 'normal'
            }}
          />
        </div>

        {/* Stacktrace area: 70% height */}
        <div style={{
          flex: '1 1 70%',
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8
          }}>
            <div style={{ minWidth: 0, overflow: 'hidden', paddingRight: 8 }}>
              <div style={{
                fontSize: 14,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                Stacktrace
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Tooltip title="Copy stacktrace">
                <Button
                  size="small"
                  type="text"
                  icon={<CopyOutlined />}
                  onClick={onCopyStacktrace}
                  aria-label="Copy stacktrace"
                  style={{ padding: 6, height: 28 }}
                />
              </Tooltip>
            </div>
          </div>

          <textarea
            readOnly
            value={stacktrace}
            wrap={wrapLines ? 'soft' : 'off'}
            aria-label="Stacktrace"
            style={{
              flex: 1,
              width: '100%',
              boxSizing: 'border-box',
              padding: 12,
              borderRadius: 6,
              border: '1px solid #d9d9d9',
              background: '#0d1117',
              color: '#e6edf3',
              fontFamily: 'monospace',
              fontSize: 12,
              lineHeight: '18px',
              overflow: 'auto',
              whiteSpace: wrapLines ? 'pre-wrap' : 'pre',
              wordBreak: wrapLines ? 'break-word' : 'normal'
            }}
          />

          {/* Footer toolbar: wrap toggle left, actions right */}
          <div style={{
            marginTop: 12,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Switch
                size="small"
                checked={wrapLines}
                onChange={(v) => onWrapChange(Boolean(v))}
              />
              <span style={{ fontSize: 13 }}>Wrap lines</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button type="primary" onClick={onClose}>Close</Button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

