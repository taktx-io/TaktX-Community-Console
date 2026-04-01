"use client";

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { App, Button, Tooltip, Checkbox, Modal, Input } from 'antd';
import {
  ReloadOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  LinkOutlined,
  SaveOutlined,
  StopOutlined,
} from '@ant-design/icons';
import type { ProcessInstanceRow as ProcessInstanceRowType, ProcessDefinitionVersionInfo } from '@/lib/api/runwayApi';
import { getProcessInstancesPageWithFilters } from '@/lib/api/runwayApi';
import type { ProcessInstanceFilters } from '@/lib/types/filters';
import type { OverlaySettingsState } from '@/components/runway/OverlaySettings';
import { getStateColor, getIncidentColor } from '@/lib/utils/stateColors';
import { hexToDarkText } from '@/lib/utils/colorUtils';
import { saveBatch, batchExists } from '@/lib/utils/batchStorage';
import { TAKTX_BACKEND_URL } from '@/lib/config/env';
import {
  cancelProcessInstances,
  verifyInstanceStates,
} from '@/lib/api/processInstanceApi';
import {
  createCancelJob,
  createCancelByFilterJob,
  saveJob,
  updateJobStatus,
  updateJobProgress,
  updateInstanceStateInJob,
  updateCancelByFilterProgress,
  getJob,
  type JobInstanceState,
} from '@/lib/utils/jobStorage';
import { useProcessInstanceUpdates, type ProcessInstanceMetadata } from '@/lib/hooks/useProcessInstanceUpdates';

interface Props {
  /** Filters to apply to process instances */
  filters: ProcessInstanceFilters;
  /** Overlay settings for consistent state colors */
  overlaySettings?: OverlaySettingsState;
  /** Version information with tags for the selected process definition */
  versions?: ProcessDefinitionVersionInfo[];
  heightPx?: number;
  compact?: boolean;
  fullHeight?: boolean;
  onRowClick?: (row: ProcessInstanceRowType) => void;
  selectedInstanceId?: string;
  /** Callback when rows are loaded */
  onRowsLoaded?: (rows: ProcessInstanceRowType[]) => void;
  /** Callback to navigate to a specific instance */
  onNavigateToInstance?: (instanceId: string) => void;
  /** Callback when a bookmark is saved to trigger refresh in parent */
  onBookmarkSaved?: () => void;
  /** Callback when a job is created (opens jobs panel) */
  onJobCreated?: (jobId: string) => void;
  /** Community mode does not require route scoping props. */
}

const PAGE_SIZE = 50;

// Memoized row component to prevent re-renders when other rows change selection
const ProcessInstanceRow = React.memo(({
  row,
  isSelected,
  isCheckboxChecked,
  onRowClick,
  onCheckboxChange,
  onCancelInstance,
  onParentInstanceClick,
  showParentColumn,
  showProcessDefColumn,
  showVersionColumn,
  overlaySettings,
  versions,
  isInstanceViewMode,
  canCancel,
}: {
  row: ProcessInstanceRowType;
  isSelected: boolean;
  isCheckboxChecked: boolean;
  onRowClick: (row: ProcessInstanceRowType) => void;
  onCheckboxChange: (id: string) => void;
  onCancelInstance: (instanceId: string) => void;
  onParentInstanceClick: (id: string) => void;
  showParentColumn: boolean;
  showProcessDefColumn: boolean;
  showVersionColumn: boolean;
  overlaySettings?: OverlaySettingsState;
  versions: ProcessDefinitionVersionInfo[];
  isInstanceViewMode: boolean;
  /** Whether cancel is available for this row. */
  canCancel: boolean;
}) => {
  const isIncident = (row as any).incidentInfo != null;

  return (
    <tr
      key={row.processInstanceId}
      data-testid={`process-instance-row-${row.processInstanceId}`}
      onClick={() => onRowClick(row)}
      onMouseEnter={(e) => {
        if (!isSelected) {
          e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.02)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.backgroundColor = 'transparent';
        }
      }}
      style={{
        cursor: 'pointer',
        backgroundColor: isSelected ? 'rgba(24, 144, 255, 0.15)' : 'transparent',
        transition: 'background-color 0.15s ease',
      }}
    >
      {/* Checkbox cell */}
      <td
        style={{
          padding: '8px 8px',
          textAlign: 'center',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={isCheckboxChecked}
          onChange={() => onCheckboxChange(row.processInstanceId)}
          disabled={isInstanceViewMode}
        />
      </td>
      <td
        style={{
          padding: '8px 8px',
          textAlign: 'center',
        }}
      >
        {/* state icon with tooltip */}
        {(() => {
          const state = isIncident ? 'INCIDENT' : (row.state || 'ACTIVE');
          const color = isIncident
            ? getIncidentColor(overlaySettings)
            : getStateColor(row.state, overlaySettings);

          let StateIcon;
          let stateLabel;
          if (state === 'ACTIVE') {
            StateIcon = SyncOutlined;
            stateLabel = 'Active';
          } else if (state === 'COMPLETED') {
            StateIcon = CheckCircleOutlined;
            stateLabel = 'Completed';
          } else if (state === 'ABORTED') {
            StateIcon = CloseCircleOutlined;
            stateLabel = 'Aborted';
          } else if (state === 'INCIDENT') {
            StateIcon = ExclamationCircleOutlined;
            stateLabel = 'Incident';
          }

          return StateIcon ? (
            <Tooltip title={stateLabel} placement="right">
              <StateIcon
                aria-label={state}
                style={{
                  fontSize: 16,
                  color: hexToDarkText(color),
                }}
              />
            </Tooltip>
          ) : null;
        })()}
      </td>
      <td style={{
        padding: '8px 8px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {row.processInstanceId}
      </td>
      {/* Parent Instance cell */}
      {showParentColumn && (
        <td style={{
          padding: '8px 8px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {row.parentProcessInstanceId ? (
            <Tooltip title={`Go to parent instance: ${row.parentProcessInstanceId}`}>
              <Button
                type="link"
                size="small"
                icon={<LinkOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  onParentInstanceClick(row.parentProcessInstanceId!);
                }}
                style={{
                  padding: 0,
                  height: 'auto',
                  fontSize: 13,
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '140px',
                }}>
                  {row.parentProcessInstanceId}
                </span>
              </Button>
            </Tooltip>
          ) : (
            <span style={{ color: '#999', fontSize: 12 }}>—</span>
          )}
        </td>
      )}
      {showProcessDefColumn && (
        <td
          style={{
            padding: '8px 8px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={row.processDefinitionId}
        >
          {row.processDefinitionId}
        </td>
      )}
      {showVersionColumn && (
        <td style={{ padding: '8px 8px', whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {(() => {
            const versionInfo = versions.find(v => v.version === row.version);
            const versionTag = versionInfo?.versionTag;
            return versionTag ? (
              <Tooltip title={versionTag}>
                <span style={{ cursor: 'help' }}>v{row.version}</span>
              </Tooltip>
            ) : (
              <span>v{row.version}</span>
            );
          })()}
        </td>
      )}
      <td style={{ padding: '8px 8px' }}>
        {row.startTime ? new Date(row.startTime).toLocaleString(undefined, {
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          hour: 'numeric',
          minute: 'numeric',
          second: 'numeric'
        }) : '—'}
      </td>
      <td style={{ padding: '8px 8px' }}>
        {row.endTime ? new Date(row.endTime).toLocaleString(undefined, {
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          hour: 'numeric',
          minute: 'numeric',
          second: 'numeric'
        }) : '—'}
      </td>
      {/* Actions cell with cancel button */}
      <td
        style={{ padding: '8px 8px', textAlign: 'center' }}
        onClick={(e) => e.stopPropagation()}
      >
        {row.state === 'ACTIVE' && canCancel && (
          <Tooltip title="Cancel Instance">
            <Button
              type="text"
              size="small"
              danger
              icon={<StopOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                onCancelInstance(row.processInstanceId);
              }}
              style={{ padding: '0 4px' }}
            />
          </Tooltip>
        )}
      </td>
    </tr>
  );
}, (prevProps, nextProps) => {
  // Custom comparison: only re-render if these specific props change
  return (
    prevProps.row === nextProps.row &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isCheckboxChecked === nextProps.isCheckboxChecked &&
    prevProps.showParentColumn === nextProps.showParentColumn &&
    prevProps.showProcessDefColumn === nextProps.showProcessDefColumn &&
    prevProps.showVersionColumn === nextProps.showVersionColumn &&
    prevProps.overlaySettings === nextProps.overlaySettings &&
    prevProps.versions === nextProps.versions &&
    prevProps.onCancelInstance === nextProps.onCancelInstance &&
    prevProps.isInstanceViewMode === nextProps.isInstanceViewMode &&
    prevProps.canCancel === nextProps.canCancel
  );
});

ProcessInstanceRow.displayName = 'ProcessInstanceRow';

export default function ProcessInstanceTable({
  filters,
  heightPx,
  compact = true,
  fullHeight = false,
  onRowClick,
  selectedInstanceId,
  overlaySettings,
  versions = [],
  onRowsLoaded,
  onNavigateToInstance,
  onBookmarkSaved,
  onJobCreated,
}: Readonly<Props>) {
  const { message, modal } = App.useApp();

  // ...existing code...

  // Handler for parent instance clicks
  const handleParentInstanceClick = (parentInstanceId: string) => {
    if (onNavigateToInstance) {
      onNavigateToInstance(parentInstanceId);
    }
  };

  const [rows, setRows] = useState<ProcessInstanceRowType[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [sortField, setSortField] = useState<'startTime' | 'endTime' | 'state'>('startTime');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [refreshToken, setRefreshToken] = useState<number>(0);

  const [pageIndex, setPageIndex] = useState<number>(0); // 0-based page index

  // Multi-selection state
  const [selectedInstanceIds, setSelectedInstanceIds] = useState<Set<string>>(new Set());

  // Selection mode: 'page' = selected IDs on current page, 'all-matching-filter' = all instances matching filter
  const [selectionMode, setSelectionMode] = useState<'page' | 'all-matching-filter'>('page');

  // Bookmark modal state
  const [showSaveBookmarkModal, setShowSaveBookmarkModal] = useState(false);
  const [newBookmarkName, setNewBookmarkName] = useState('');

  // Active cancel job tracking for real-time WebSocket updates.
  // Use a ref so handleInstanceUpdate always reads the latest value without
  // stale-closure issues and without needing to re-subscribe the WS listener
  // every time the job ID changes.
  const activeCancelJobIdRef = useRef<string | null>(null);
  const [, setActiveCancelJobId] = useState<string | null>(null);

  // Keep ref in sync with state (synchronous — ref is always current on the next tick)
  const setActiveCancelJob = useCallback((id: string | null) => {
    activeCancelJobIdRef.current = id;
    setActiveCancelJobId(id);
  }, []);

  // Stable ref for the filters so handleInstanceUpdate can read them without
  // being recreated whenever the filters change (avoids WS listener churn).
  const filtersRef = useRef(filters);
  useEffect(() => { filtersRef.current = filters; }, [filters]);

  // Stable ref for onJobCreated so the callback can call it without stale capture.
  const onJobCreatedRef = useRef(onJobCreated);
  useEffect(() => { onJobCreatedRef.current = onJobCreated; }, [onJobCreated]);

  // WebSocket subscription for real-time instance state updates.
  // This callback is intentionally stable (empty dep array + refs) so the WS
  // listener is never torn down mid-cancel and no messages are ever dropped.
  const handleInstanceUpdate = useCallback((metadata: ProcessInstanceMetadata) => {
    const currentFilters = filtersRef.current;

    // Only process updates for instances that match the current view filters
    const matchesFilters =
      (!currentFilters.processDefinitionId || currentFilters.processDefinitionId === metadata.processDefinitionId) &&
      (currentFilters.version === null || currentFilters.version === undefined || currentFilters.version === metadata.version);

    if (!matchesFilters) {
      return;
    }

    // Update table row state in real-time (immediate visual feedback)
    setRows(prevRows =>
      prevRows.map(row => {
        if (row.processInstanceId === metadata.processInstanceId) {
          const endTime = metadata.endTimeMillis != null
            ? new Date(metadata.endTimeMillis).toISOString()
            : row.endTime;
          return {
            ...row,
            state: metadata.state,
            endTime: endTime as string | null,
          };
        }
        return row;
      })
    );

    // Update active cancel job progress via the ref — always current, never stale
    const jobId = activeCancelJobIdRef.current;
    if (jobId) {
      const updated = updateInstanceStateInJob(
        jobId,
        metadata.processInstanceId,
        metadata.state
      );

      if (updated) {
        // Notify jobs panel to refresh (via ref — avoids stale capture)
        onJobCreatedRef.current?.(jobId);

        // Check if job is now complete
        const job = getJob(jobId);
        if (job?.status === 'completed') {
          // Clear tracking — table rows already updated via WebSocket above
          activeCancelJobIdRef.current = null;
          setActiveCancelJobId(null);
        }
      }
    }
  }, []); // stable — intentionally empty; all mutable values accessed via refs

  // WebSocket connection to the ingester for real-time instance state updates
  useProcessInstanceUpdates({
    onInstanceUpdate: handleInstanceUpdate,
    enabled: true,
  });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const bodyHeight: number | undefined = undefined;

  // map UI sort -> backend orderBy key
  const orderByKey = useMemo(() => {
    switch (sortField) {
      case 'endTime':
        return 'PROCESS_INSTANCE_COMPLETE';
      case 'state':
        return 'PROCESS_INSTANCE_STATE';
      case 'startTime':
      default:
        return 'PROCESS_INSTAMCE_START';
    }
  }, [sortField]);

  const loadPage = useCallback(async () => {
    const start = pageIndex * PAGE_SIZE;

    // If processInstanceIds is explicitly set to empty array, don't make API call
    // This happens in instance mode when no IDs are entered
    if (filters.processInstanceIds !== undefined && filters.processInstanceIds.length === 0) {
      setRows([]);
      setTotal(0);
      setLoading(false);
      if (onRowsLoaded) {
        onRowsLoaded([]);
      }
      return;
    }

    try {
      setLoading(true);
      const page = await getProcessInstancesPageWithFilters(filters, {
        start,
        limit: PAGE_SIZE,
        orderBy: orderByKey,
        orderDirection: sortOrder === 'asc' ? 'ASC' : 'DESC',
      });

      const loadedRows = Array.isArray(page.items) ? page.items : [];
      setRows(loadedRows);
      setTotal(typeof page.total === 'number' ? page.total : 0);

      // Notify parent that rows were loaded
      if (onRowsLoaded) {
        onRowsLoaded(loadedRows);
      }
    } catch (e) {
      console.warn('[ProcessInstanceTable] fetch error', e);
      message.error('Failed to load process instances');
    } finally {
      setLoading(false);
    }
  }, [filters, pageIndex, orderByKey, sortOrder, message, onRowsLoaded]);

  // Load current page whenever filters, paging, or sorting changes
  useEffect(() => {
    loadPage();
  }, [filters, pageIndex, orderByKey, sortOrder, refreshToken, loadPage]);

  // Clear selections when filters or page changes (but keep the table data)
  useEffect(() => {
    setSelectedInstanceIds(new Set());
    setSelectionMode('page');
  }, [filters, pageIndex]);

  // Selection handlers
  const handleToggleSelection = useCallback((instanceId: string) => {
    const start = performance.now();
    setSelectedInstanceIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(instanceId)) {
        newSet.delete(instanceId);
      } else {
        newSet.add(instanceId);
      }
      console.log(`[handleToggleSelection] setState took ${performance.now() - start}ms`);
      return newSet;
    });
  }, []);

  const handleToggleAll = useCallback(() => {
    const start = performance.now();
    if (selectedInstanceIds.size === rows.length && rows.length > 0 && selectionMode === 'page') {
      // Deselect all
      setSelectedInstanceIds(new Set());
      setSelectionMode('page');
    } else {
      // Select all visible rows (page mode)
      setSelectedInstanceIds(new Set(rows.map(r => r.processInstanceId)));
      setSelectionMode('page');
    }
    console.log(`[handleToggleAll] setState took ${performance.now() - start}ms`);
  }, [rows, selectedInstanceIds.size, selectionMode]);

  const handleClearSelection = useCallback(() => {
    setSelectedInstanceIds(new Set());
    setSelectionMode('page');
  }, []);

  const handleSelectAllMatchingFilter = useCallback(() => {
    setSelectionMode('all-matching-filter');
    console.log('[handleSelectAllMatchingFilter] Switched to all-matching-filter mode');
  }, []);

  // Keyboard shortcut for select all (Ctrl+A / Cmd+A)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'a' && containerRef.current?.contains(document.activeElement)) {
        e.preventDefault();
        handleToggleAll();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleToggleAll]);

  // Bookmark save handlers
  const handleSaveToBookmark = useCallback(() => {
    if (selectedInstanceIds.size === 0) {
      message.error('No instances selected');
      return;
    }

    setNewBookmarkName('');
    setShowSaveBookmarkModal(true);
  }, [selectedInstanceIds.size, message]);

  const performSave = useCallback((name: string, instanceIds: string[]) => {
    try {
      saveBatch({
        name,
        instanceIds,
        timestamp: new Date().toISOString(),
      });
      message.success(`Bookmark "${name}" saved with ${instanceIds.length} instance${instanceIds.length !== 1 ? 's' : ''}`);
      setShowSaveBookmarkModal(false);
      setNewBookmarkName('');

      // Clear selections after save
      handleClearSelection();

      // Notify parent to trigger refresh
      if (onBookmarkSaved) {
        onBookmarkSaved();
      }
    } catch (error) {
      message.error(`Failed to save bookmark: ${error}`);
    }
  }, [message, handleClearSelection, onBookmarkSaved]);

  const handleConfirmSaveBookmark = useCallback(() => {
    const name = newBookmarkName.trim();

    if (!name) {
      message.error('Bookmark name is required');
      return;
    }

    const instanceIdsArray = Array.from(selectedInstanceIds);

    if (batchExists(name)) {
      modal.confirm({
        title: 'Bookmark already exists',
        content: `A bookmark named "${name}" already exists. Do you want to overwrite it?`,
        onOk: () => {
          performSave(name, instanceIdsArray);
        },
      });
    } else {
      performSave(name, instanceIdsArray);
    }
  }, [newBookmarkName, selectedInstanceIds, message, modal, performSave]);

  // Manual refresh
  const handleRefresh = useCallback(() => {
    setRefreshToken((x) => x + 1);
  }, []);

  // Cancel handlers
  const processCancelJob = useCallback(async (jobId: string, instanceIds: string[]) => {
    try {
      updateJobStatus(jobId, 'running');

      // Set the ref synchronously BEFORE the first await so any WS messages
      // that arrive during the API call are attributed to this job immediately.
      setActiveCancelJob(jobId);

      const cancelResponse = await cancelProcessInstances(instanceIds);

      // All instances were already in a terminal state or failed to send — no commands actually sent
      if (cancelResponse.succeededIds.length === 0) {
        updateJobProgress(jobId, instanceIds.length, {
          commandsSent: 0,
          commandsSkipped: cancelResponse.skippedCount,
          commandsFailed: cancelResponse.failedCount,
          skippedIds: cancelResponse.skippedIds,
          failedCommands: cancelResponse.failures,
          instanceStates: {},
          stillActiveCount: 0,
          abortedCount: 0,
          completedCount: 0,
          notFoundCount: 0,
        });
        updateJobStatus(jobId, 'completed');
        setActiveCancelJob(null);
        setRefreshToken(prev => prev + 1);
        return;
      }

      // Verify actual current states for the instances we sent cancel commands to
      const verifyResponse = await verifyInstanceStates(cancelResponse.succeededIds);

      // Initialize job data with actual verified states
      const initialStates: Record<string, JobInstanceState> = {};
      let stillActive = 0;
      let alreadyAborted = 0;
      let alreadyCompleted = 0;
      let notFound = 0;

      verifyResponse.states.forEach(stateInfo => {
        const state = stateInfo.state as 'ACTIVE' | 'ABORTED' | 'COMPLETED' | 'NOT_FOUND';
        initialStates[stateInfo.instanceId] = {
          instanceId: stateInfo.instanceId,
          currentState: state,
          lastChecked: stateInfo.timestamp,
        };

        // Count by state
        if (state === 'ACTIVE') stillActive++;
        else if (state === 'ABORTED') alreadyAborted++;
        else if (state === 'COMPLETED') alreadyCompleted++;
        else if (state === 'NOT_FOUND') notFound++;
      });

      updateJobProgress(jobId, cancelResponse.succeededCount, {
        commandsSent: cancelResponse.succeededCount,
        commandsSkipped: cancelResponse.skippedCount,
        commandsFailed: cancelResponse.failedCount,
        skippedIds: cancelResponse.skippedIds,
        failedCommands: cancelResponse.failures,
        instanceStates: initialStates,
        stillActiveCount: stillActive,
        abortedCount: alreadyAborted,
        completedCount: alreadyCompleted,
        notFoundCount: notFound,
      });

      // If all instances already transitioned, complete immediately
      if (stillActive === 0) {
        updateJobStatus(jobId, 'completed');
        setActiveCancelJob(null);
        // No popup notification - Jobs panel shows completion
        setRefreshToken(prev => prev + 1);
        return;
      }

      // WebSocket will handle real-time state updates via handleInstanceUpdate callback
      // Job will auto-complete when stillActiveCount reaches 0 (handled in handleInstanceUpdate)

      // Safety timeout: if no WebSocket updates received after 30 seconds, complete job with warning
      setTimeout(() => {
        const job = getJob(jobId);
        if (job && job.status === 'running') {
          console.warn('[ProcessInstanceTable] Cancel job timeout - completing with warning');
          updateJobStatus(jobId, 'completed', {
            warnings: ['Job completed by timeout - some instances may not have transitioned to ABORTED'],
          });
          setActiveCancelJob(null);
          message.warning('Cancel job timed out - check instance states manually');
          setRefreshToken(prev => prev + 1);
        }
      }, 30000); // 30 second safety timeout

    } catch (error: any) {
      console.error('[ProcessInstanceTable] Cancel job error:', error);
      updateJobStatus(jobId, 'failed', { error: error.message || 'Unknown error' });
      setActiveCancelJob(null);
      message.error('Failed to cancel instances');
    }
  }, [message, setActiveCancelJob]);

  const processCancelByFilterJob = useCallback(async (jobId: string, filter: any) => {
    try {
      updateJobStatus(jobId, 'running');

      // Route through BFF in community mode
      const { authFetch } = await import('@/lib/authFetch');
      const response = await authFetch(
        `${TAKTX_BACKEND_URL}/api/runway/processinstances/cancel-by-filter`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ jobId, filter }),
        }
      );

      if (!response.ok) {
        throw new Error(`Backend returned ${response.status}`);
      }

      const result = await response.json();

      // Update job with final results
      updateCancelByFilterProgress(jobId, {
        processedCount: result.processedCount,
        succeededCount: result.succeededCount,
        failedCount: result.failedCount,
        skippedCount: result.skippedCount,
      });

      // Add failures if any
      if (result.failures && result.failures.length > 0) {
        result.failures.forEach((failure: any) => {
          updateCancelByFilterProgress(jobId, {
            failure: { instanceId: failure.instanceId, reason: failure.reason }
          });
        });
      }

      // Add succeeded sample
      if (result.succeededSample && result.succeededSample.length > 0) {
        result.succeededSample.forEach((instanceId: string) => {
          updateCancelByFilterProgress(jobId, { succeededId: instanceId });
        });
      }

      updateJobStatus(jobId, 'completed');

      // No popup notification - Jobs panel shows completion status
      // Refresh table to show updated states
      handleRefresh();

    } catch (error: any) {
      console.error('Error processing filter-based cancel:', error);
      updateJobStatus(jobId, 'failed', { error: error.message });
      message.error(`Cancel job failed: ${error.message}`);
    }
  }, [message, handleRefresh]);

  const submitCancelJob = useCallback(async (instanceIds: string[]) => {
    try {
      const job = createCancelJob(instanceIds);
      saveJob(job);
      onJobCreated?.(job.id);
      processCancelJob(job.id, instanceIds);
      // No popup notification - Jobs panel shows progress
    } catch (error: any) {
      message.error(`Failed to start cancel job: ${error.message}`);
    }
  }, [message, onJobCreated, processCancelJob]);

  const submitCancelByFilterJob = useCallback(async (filter: any, estimatedTotal: number, description: string) => {
    try {
      const job = createCancelByFilterJob(filter, estimatedTotal, description);
      saveJob(job);
      onJobCreated?.(job.id);
      processCancelByFilterJob(job.id, filter);
      // No popup notification - Jobs panel shows progress
    } catch (error: any) {
      message.error(`Failed to start cancel job: ${error.message}`);
    }
  }, [message, onJobCreated, processCancelByFilterJob]);

  const handleCancelSingle = useCallback((instanceId: string) => {
    modal.confirm({
      title: 'Cancel Process Instance?',
      content: 'This will abort the process instance. This action cannot be undone.',
      okText: 'Cancel Instance',
      okType: 'danger',
      onOk: async () => {
        submitCancelJob([instanceId]);
      }
    });
  }, [modal, submitCancelJob]);

  const handleBulkCancel = useCallback(async () => {
    if (selectionMode === 'all-matching-filter') {
      // Filter-based cancel - show confirmation without pre-counting
      // (counting has race conditions and the cancel endpoint returns actual counts anyway)

      // Build filter description for display
      const filterDesc = [];
      if (filters.processDefinitionId) filterDesc.push(`Process: ${filters.processDefinitionId}`);
      if (filters.version !== null && filters.version !== undefined) filterDesc.push(`Version: ${filters.version}`);
      if (filters.states?.length) filterDesc.push(`States: ${filters.states.join(', ')}`);
      const description = filterDesc.length > 0 ? filterDesc.join(' • ') : 'All instances';

      // Show confirmation
      modal.confirm({
        title: 'Cancel All Active Instances Matching Filter?',
        content: (
          <div>
            <p>You are about to cancel <strong>ALL ACTIVE</strong> process instances matching:</p>
            <ul style={{ marginTop: 8, paddingLeft: 20 }}>
              {filterDesc.map((desc, i) => <li key={i}>{desc}</li>)}
            </ul>
            <p style={{ marginTop: 8, color: '#8c8c8c', fontSize: 13 }}>
              ℹ️ Non-active instances will be skipped automatically.
            </p>
            <p style={{ marginTop: 8, color: '#ff4d4f' }}>
              ⚠️ This action cannot be undone!
            </p>
          </div>
        ),
        okText: 'Yes, Cancel All Active Instances',
        okType: 'danger',
        width: 520,
        onOk: async () => {
          // The cancel endpoint will report actual counts after execution
          submitCancelByFilterJob(filters, 0, description); // Pass 0 as placeholder
          setSelectedInstanceIds(new Set());
          setSelectionMode('page');
        }
      });
    } else {
      // ID-based cancel (current page only)
      const activeIds = Array.from(selectedInstanceIds).filter(id => {
        const row = rows.find(r => r.processInstanceId === id);
        return row?.state === 'ACTIVE';
      });

      if (activeIds.length === 0) {
        message.warning('No active instances selected');
        return;
      }

      modal.confirm({
        title: `Cancel ${activeIds.length} Process Instances?`,
        content: `This will cancel ${activeIds.length} active process instances. Non-active instances will be skipped. This action cannot be undone.`,
        okText: 'Cancel Instances',
        okType: 'danger',
        onOk: async () => {
          submitCancelJob(activeIds);
          setSelectedInstanceIds(new Set());
          setSelectionMode('page');
        }
      });
    }
  }, [selectionMode, selectedInstanceIds, rows, message, modal, filters, submitCancelJob, submitCancelByFilterJob]);

  // Sorting handlers (client-side toggle, but backend receives the field/order)
  const makeSortHandler = (field: 'startTime' | 'endTime' | 'state') => () => {
    // Always go back to first page when sorting changes
    setPageIndex(0);

    if (sortField === field) {
      // Same field: toggle asc/desc directly so the new value is visible immediately
      setSortOrder((prevOrder) => (prevOrder === 'asc' ? 'desc' : 'asc'));
    } else {
      // New field: select it and default to descending
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const headerCellClass = (field: 'startTime' | 'endTime' | 'state') => {
    if (sortField !== field) return '';
    return sortOrder === 'asc' ? 'sort-asc' : 'sort-desc';
  };

  const handleRowClick = (row: ProcessInstanceRowType) => {
    if (!onRowClick) return;
    onRowClick(row);
  };

  const totalPages = total > 0 ? Math.ceil(total / PAGE_SIZE) : 1;
  const currentPage = Math.min(pageIndex + 1, totalPages);
  const canGoPrev = currentPage > 1 && selectionMode !== 'all-matching-filter';
  const canGoNext = currentPage < totalPages && selectionMode !== 'all-matching-filter';

  const goFirst = () => {
    if (!canGoPrev) return;
    setPageIndex(0);
  };
  const goPrev = () => {
    if (!canGoPrev) return;
    setPageIndex((p) => Math.max(0, p - 1));
  };
  const goNext = () => {
    if (!canGoNext) return;
    setPageIndex((p) => Math.min(totalPages - 1, p + 1));
  };
  const goLast = () => {
    if (!canGoNext) return;
    setPageIndex(totalPages - 1);
  };

  const from = total === 0 ? 0 : pageIndex * PAGE_SIZE + 1;
  const to = total === 0 ? 0 : Math.min(total, pageIndex * PAGE_SIZE + rows.length);

  // Determine which columns to show based on filters
  const showProcessDefColumn = !filters.processDefinitionId; // Show if not filtering by specific definition
  const showVersionColumn = !filters.version; // Show if not filtering by specific version

  // Memoize whether to show parent instance column (expensive check)
  // Memoize whether to show parent instance column (expensive check)
  const showParentColumn = useMemo(() => rows.some(r => r.parentProcessInstanceId), [rows]);

  return (
    <div
      ref={containerRef}
      data-testid="process-instance-table"
      className={compact ? 'compactTable' : undefined}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: fullHeight ? '100%' : heightPx ?? 'auto',
        overflow: 'hidden',
      }}
    >
      {/* Info + refresh + pagination row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 11,
          color: '#666',
          padding: '0 4px 4px 4px',
          flexShrink: 0,
          minHeight: 28,
          gap: 8,
          flexWrap: 'nowrap',
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          minWidth: 0,
          overflow: 'hidden',
        }}>
          <span style={{
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {from}-{to} of {total || rows.length}
          </span>

          {/* Show filter description */}
          {filters.processInstanceIds && filters.processInstanceIds.length > 0 && (
            <span style={{
              whiteSpace: 'nowrap',
              color: '#1890ff',
              fontSize: 11,
              fontWeight: 500,
              paddingLeft: 8,
              borderLeft: '1px solid #d9d9d9',
            }}>
              ({filters.processInstanceIds.length} specific ID{filters.processInstanceIds.length !== 1 ? 's' : ''})
            </span>
          )}

          <Button
            type="text"
            size="small"
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={handleRefresh}
            style={{ padding: '0 4px', height: 20, flexShrink: 0 }}
          />
          {selectedInstanceIds.size > 0 && (
            <>
              <Tooltip title={`Save ${selectedInstanceIds.size} selected to bookmark`}>
                <Button
                  type="text"
                  size="small"
                  icon={<SaveOutlined />}
                  onClick={handleSaveToBookmark}
                  style={{ padding: '0 4px', height: 20, flexShrink: 0 }}
                />
              </Tooltip>
              {(() => {
                // Filter-based cancel button — always rendered when in all-matching-filter mode.
                if (selectionMode === 'all-matching-filter') {
                  const disabledReason = null;

                  return (
                    <Tooltip title={disabledReason ?? 'Cancel all instances matching filter'}>
                      {/* span needed so Tooltip works on a disabled button */}
                      <span>
                        <Button
                          type="text"
                          size="small"
                          danger
                          disabled={false}
                          icon={<StopOutlined />}
                          onClick={handleBulkCancel}
                          style={{ padding: '0 4px', height: 20, flexShrink: 0 }}
                        />
                      </span>
                    </Tooltip>
                  );
                }

                // For page-based selection, only show if there are active instances on current page
                const activeCount = Array.from(selectedInstanceIds).filter(id => {
                  const row = rows.find(r => r.processInstanceId === id);
                  return row?.state === 'ACTIVE';
                }).length;

                return activeCount > 0 && (
                  <Tooltip title={`Cancel ${activeCount} active instance(s)`}>
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<StopOutlined />}
                      onClick={handleBulkCancel}
                      style={{ padding: '0 4px', height: 20, flexShrink: 0 }}
                    />
                  </Tooltip>
                );
              })()}
            </>
          )}
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          flexShrink: 0,
          marginLeft: 'auto',
        }}>
          <span style={{ fontSize: 11, color: '#8c8c8c', whiteSpace: 'nowrap' }}>
            Page {currentPage}/{totalPages}
          </span>
          <div style={{
            display: 'flex',
            gap: 2,
            background: '#fafafa',
            borderRadius: 4,
            padding: 2,
            border: '1px solid #f0f0f0'
          }}>
            <Button size="small" disabled={!canGoPrev} onClick={goFirst} style={{ minWidth: 24, padding: '0 2px', fontSize: 11 }}>
              {'<<'}
            </Button>
            <Button size="small" disabled={!canGoPrev} onClick={goPrev} style={{ minWidth: 24, padding: '0 2px', fontSize: 11 }}>
              {'<'}
            </Button>
            <Button size="small" disabled={!canGoNext} onClick={goNext} style={{ minWidth: 24, padding: '0 2px', fontSize: 11 }}>
              {'>'}
            </Button>
            <Button size="small" disabled={!canGoNext} onClick={goLast} style={{ minWidth: 24, padding: '0 2px', fontSize: 11 }}>
              {'>>'}
            </Button>
          </div>
        </div>
      </div>

      {/* Selection Banner - shows when all on page are selected */}
      {!selectedInstanceId && selectionMode === 'page' && selectedInstanceIds.size === rows.length && rows.length > 0 && rows.length < total && (
        <div style={{
          padding: '8px 12px',
          backgroundColor: '#e6f7ff',
          border: '1px solid #91d5ff',
          borderRadius: 4,
          margin: '0 4px 4px 4px',
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <span>
            <strong>{selectedInstanceIds.size}</strong> instances selected on this page.
            {' '}
            <a
              onClick={handleSelectAllMatchingFilter}
              style={{ fontWeight: 500, cursor: 'pointer' }}
            >
              Select all {total} instances matching current filter?
            </a>
          </span>
          <Button size="small" onClick={handleClearSelection}>Clear</Button>
        </div>
      )}

      {/* Selection Banner - shows when in all-matching-filter mode */}
      {!selectedInstanceId && selectionMode === 'all-matching-filter' && (
        <div style={{
          padding: '8px 12px',
          backgroundColor: '#fff7e6',
          border: '1px solid #ffd591',
          borderRadius: 4,
          margin: '0 4px 4px 4px',
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <span>
            <strong>All {total} instances</strong> matching the current filter are selected.
            {' '}
            <span style={{ color: '#8c8c8c', fontSize: 12 }}>
              (Pagination disabled)
            </span>
          </span>
          <Button size="small" onClick={handleClearSelection}>Clear Selection</Button>
        </div>
      )}

      {/* Simple scrollable table body */}
      <div
        style={{
          flex: 1,
          height: fullHeight ? bodyHeight : heightPx ? Math.max(80, heightPx - 32) : 'auto',
          overflow: 'auto',
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            tableLayout: 'fixed',
            fontSize: compact ? 13 : 14,
          }}
        >
          <thead>
            <tr>
              {/* Checkbox column */}
              <th style={{ width: 40, padding: '8px 4px', textAlign: 'center' }}>
                <Checkbox
                  checked={selectedInstanceIds.size === rows.length && rows.length > 0}
                  indeterminate={selectedInstanceIds.size > 0 && selectedInstanceIds.size < rows.length}
                  onChange={handleToggleAll}
                  disabled={!!selectedInstanceId}
                />
              </th>
              <th style={{ width: 40, padding: '8px 4px' }} />
              <th
                style={{
                  width: 260,
                  textAlign: 'left',
                  padding: '8px 8px',
                  borderBottom: '1px solid #f0f0f0',
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                Process Instance ID
              </th>
              {/* Parent Instance column - only show if any row has a parent */}
              {showParentColumn && (
                <th
                  style={{
                    width: 200,
                    textAlign: 'left',
                    padding: '8px 8px',
                    borderBottom: '1px solid #f0f0f0',
                    fontWeight: 600,
                    fontSize: 13,
                  }}
                >
                  Parent Instance
                </th>
              )}
              {showProcessDefColumn && (
                <th
                  style={{
                    width: 200,
                    textAlign: 'left',
                    padding: '8px 8px',
                    borderBottom: '1px solid #f0f0f0',
                    fontWeight: 600,
                    fontSize: 13,
                  }}
                >
                  Process Definition
                </th>
              )}
              {showVersionColumn && (
                <th
                  style={{
                    width: 50,
                    textAlign: 'left',
                    padding: '8px 8px',
                    borderBottom: '1px solid #f0f0f0',
                    fontWeight: 600,
                    fontSize: 13,
                  }}
                  title="Version"
                >
                  {/* Empty header - version indicated by tooltip */}
                </th>
              )}
              <th
                style={{
                  width: 160,
                  padding: '8px 8px',
                  borderBottom: '1px solid #f0f0f0',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  textAlign: 'left',
                  fontWeight: 600,
                  fontSize: 13,
                }}
                className={headerCellClass('startTime')}
                onClick={makeSortHandler('startTime')}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  Start
                  {sortField === 'startTime' && (
                    <span aria-hidden style={{ fontSize: 10 }}>
                      {sortOrder === 'asc' ? '▲' : '▼'}
                    </span>
                  )}
                </span>
              </th>
              <th
                style={{
                  width: 160,
                  padding: '8px 8px',
                  borderBottom: '1px solid #f0f0f0',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  textAlign: 'left',
                  fontWeight: 600,
                  fontSize: 13,
                }}
                className={headerCellClass('endTime')}
                onClick={makeSortHandler('endTime')}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  End
                  {sortField === 'endTime' && (
                    <span aria-hidden style={{ fontSize: 10 }}>
                      {sortOrder === 'asc' ? '▲' : '▼'}
                    </span>
                  )}
                </span>
              </th>
              {/* Actions column */}
              <th
                style={{
                  width: 80,
                  padding: '8px 8px',
                  borderBottom: '1px solid #f0f0f0',
                  textAlign: 'left',
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <ProcessInstanceRow
                key={row.processInstanceId}
                row={row}
                isSelected={row.processInstanceId === selectedInstanceId}
                isCheckboxChecked={selectedInstanceIds.has(row.processInstanceId)}
                onRowClick={handleRowClick}
                onCheckboxChange={handleToggleSelection}
                onCancelInstance={handleCancelSingle}
                onParentInstanceClick={handleParentInstanceClick}
                showParentColumn={showParentColumn}
                showProcessDefColumn={showProcessDefColumn}
                showVersionColumn={showVersionColumn}
                overlaySettings={overlaySettings}
                versions={versions}
                isInstanceViewMode={!!selectedInstanceId}
                canCancel={true}
              />
            ))}

            {rows.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={6 + (showProcessDefColumn ? 1 : 0) + (showVersionColumn ? 1 : 0) + (showParentColumn ? 1 : 0)}
                  style={{ padding: 8, textAlign: 'center', color: '#999' }}
                >
                  No process instances
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Save Bookmark Modal */}
      <Modal
        open={showSaveBookmarkModal}
        onCancel={() => {
          setShowSaveBookmarkModal(false);
          setNewBookmarkName('');
        }}
        onOk={handleConfirmSaveBookmark}
        title="Save to Bookmark"
        okText="Save"
      >
        <div style={{ marginTop: 16 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
            Bookmark Name
          </label>
          <Input
            placeholder="Enter bookmark name"
            value={newBookmarkName}
            onChange={(e) => setNewBookmarkName(e.target.value)}
            onPressEnter={handleConfirmSaveBookmark}
            maxLength={64}
          />
          <div style={{ marginTop: 12, fontSize: 12, color: '#8c8c8c' }}>
            This will save {selectedInstanceIds.size} instance ID{selectedInstanceIds.size !== 1 ? 's' : ''} to the bookmark.
          </div>
        </div>
      </Modal>
    </div>
  );
}
