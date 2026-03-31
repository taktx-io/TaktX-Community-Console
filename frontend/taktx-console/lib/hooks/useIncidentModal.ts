import { useState, useCallback } from 'react';
import { App } from 'antd';

/**
 * Return type for incident modal hook
 */
interface UseIncidentModalReturn {
  /** Currently selected incident data */
  selectedIncident: any | null;
  /** Whether incident modal is visible */
  showIncidentModal: boolean;
  /** Whether stacktrace should wrap (true) or scroll horizontally (false) */
  stacktraceWrap: boolean;
  /** Set the selected incident */
  setSelectedIncident: (incident: any | null) => void;
  /** Set modal visibility */
  setShowIncidentModal: (show: boolean) => void;
  /** Toggle stacktrace wrap mode */
  setStacktraceWrap: (wrap: boolean) => void;
  /** Copy incident title/message to clipboard */
  copyIncidentTitle: () => void;
  /** Copy incident stacktrace to clipboard */
  copyIncidentStacktrace: () => void;
}

/**
 * Custom hook to manage incident modal state and clipboard operations
 *
 * Features:
 * - Modal visibility state
 * - Selected incident storage
 * - Stacktrace wrap toggle
 * - Copy incident message to clipboard
 * - Copy stacktrace to clipboard
 *
 * @returns Object with state and handlers for incident modal
 */
export function useIncidentModal(): UseIncidentModalReturn {
  const { message } = App.useApp();

  const [selectedIncident, setSelectedIncident] = useState<any | null>(null);
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [stacktraceWrap, setStacktraceWrap] = useState<boolean>(true);

  // Copy incident title/message to clipboard
  const copyIncidentTitle = useCallback(() => {
    try {
      const rawMessage = selectedIncident?.message ? String(selectedIncident.message) : '';
      if (!rawMessage) {
        message.info('No incident message to copy');
        return;
      }
      navigator.clipboard.writeText(rawMessage).then(() => {
        message.success('Incident message copied');
      }).catch((err) => {
        console.warn('copy failed', err);
        message.error('Failed to copy incident message');
      });
    } catch (e) {
      console.warn('copyIncidentTitle', e);
      message.error('Failed to copy incident message');
    }
  }, [selectedIncident, message]);

  // Copy incident stacktrace to clipboard
  const copyIncidentStacktrace = useCallback(() => {
    try {
      let text = '';
      if (Array.isArray(selectedIncident?.stacktrace) && selectedIncident.stacktrace.length > 0) {
        text = selectedIncident.stacktrace.join('\n');
      } else if (selectedIncident?.message) {
        text = String(selectedIncident.message);
      }
      if (!text) {
        message.info('No stacktrace or message to copy');
        return;
      }
      navigator.clipboard.writeText(text).then(() => {
        message.success('Stacktrace copied');
      }).catch((err) => {
        console.warn('copy failed', err);
        message.error('Failed to copy stacktrace');
      });
    } catch (e) {
      console.warn('copyIncidentStacktrace', e);
      message.error('Failed to copy stacktrace');
    }
  }, [selectedIncident, message]);

  return {
    selectedIncident,
    showIncidentModal,
    stacktraceWrap,
    setSelectedIncident,
    setShowIncidentModal,
    setStacktraceWrap,
    copyIncidentTitle,
    copyIncidentStacktrace,
  };
}

