'use client';

import {useCallback, useEffect, useMemo, useRef, useState, Suspense} from 'react';
import {Alert, App, Button, Card} from 'antd';
import {LinkOutlined} from '@ant-design/icons';
import DmnViewerComponent from '@/components/dmn/DmnViewer';
import BpmnViewerComponent from '@/components/runway/BpmnViewer';
import ProcessInstanceTable from '@/components/runway/ProcessInstanceTable';
import ProcessInstanceDetail from '@/components/runway/ProcessInstanceDetail';
import FlowNodeDetailPopup from '@/components/runway/FlowNodeDetailPopup';
import GlobalProcessOverview from '@/components/runway/GlobalProcessOverview';
import OverlaySettings, {
  DEFAULT_OVERLAY_SETTINGS,
  type OverlaySettingsState
} from '@/components/runway/OverlaySettings';
import BadgeSettings, {
  type AggregateBadgeSettings,
  type InstanceBadgeSettings,
  loadAggregateBadgeSettings,
  loadInstanceBadgeSettings
} from '@/components/runway/BadgeSettings';
import {
  getProcessDefinitionIds,
  getProcessDefinitionVersions,
  getDmnDefinitionXml,
  getProcessDefinitionXml,
  type ProcessDefinitionVersionInfo,
  type ProcessInstanceRow,
} from '@/lib/api/runwayApi';
import VerticalSplit from '@/components/layout/VerticalSplit';
import FilterPanel from '@/components/runway/FilterPanel';
import {useBpmnHeatmap} from '@/lib/hooks/useBpmnHeatmap';
import {getProcessInstance, type TimedFlowNodeInstance} from '@/lib/api/processInstanceApi';
import type {ProcessInstanceFilters} from '@/lib/types/filters';
import {EXECUTION_STATES} from '@/lib/types/filters';
import {
  getBookmarkState,
  getDefinitionFilterState,
  getInstanceIdsState,
  saveBookmarkState,
  saveDefinitionFilterState,
  saveInstanceIdsState,
} from '@/lib/utils/viewStateStorage';
import DiagramCardHeader from '@/components/runway/DiagramCardHeader';
import IncidentAlertBanner from '@/components/runway/IncidentAlertBanner';
import IncidentModal from '@/components/runway/IncidentModal';
import StartProcessModal from '@/components/runway/StartProcessModal';
import {CallActivityIcon} from '@/components/runway/BpmnIcons';
import type {ClickableLink} from '@/components/runway/layers/BpmnClickableLinksLayer';
import {loadOverlaySettings} from '@/lib/utils/overlaySettingsLoader';
import JobsPanel from '@/components/runway/JobsPanel';
import {getActiveJobCount} from '@/lib/utils/jobStorage';
import {loadBatches, saveBatch} from '@/lib/utils/batchStorage';
import {extractCalledDecisions, getCalledDecision} from '@/lib/utils/bpmnDmnBridge';
import {useRunwayUrlSync} from '@/lib/hooks/useRunwayUrlSync';
import {useDetailPaneResize} from '@/lib/hooks/useDetailPaneResize';
import {useIncidentModal} from '@/lib/hooks/useIncidentModal';
import {generateFlowNodeInstanceKey, getFirstInstanceForElement} from '@/lib/utils/flowNodeInstanceUtils';

type BpmnViewerHandle = {
  get: (service: string) => any;
};

function RunwayPageContent() {
  const {message} = App.useApp();


  const [processDefinitionIds, setProcessDefinitionIds] = useState<string[]>([]);
  const [selectedDefinitionId, setSelectedDefinitionId] = useState<string | null>(null);
  const [versions, setVersions] = useState<ProcessDefinitionVersionInfo[]>([]);
  const [versionsOwner, setVersionsOwner] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [selectedStates, setSelectedStates] = useState<string[]>(Object.values(EXECUTION_STATES));
  const [startTimeFrom, setStartTimeFrom] = useState<Date | null>(null);
  const [startTimeTo, setStartTimeTo] = useState<Date | null>(null);
  const [endTimeFrom, setEndTimeFrom] = useState<Date | null>(null);
  const [endTimeTo, setEndTimeTo] = useState<Date | null>(null);
  const [businessKey, setBusinessKey] = useState<string>('');
  const [tag, setTag] = useState<string>('');
  const [bpmnXml, setBpmnXml] = useState<string | null>(null);
  const [dmnXml, setDmnXml] = useState<string | null>(null);
  const [dmnLoading, setDmnLoading] = useState(false);
  const [selectedDmnDecisionId, setSelectedDmnDecisionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [selectedInstance, setSelectedInstance] = useState<ProcessInstanceRow | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [flowNodeInstances, setFlowNodeInstances] = useState<TimedFlowNodeInstance[]>([]);
  const viewerRef = useRef<BpmnViewerHandle | null>(null);

  // ============================================================================
  // CLEAN DUAL-SELECTION ARCHITECTURE
  // ============================================================================
  // Two independent selection concepts:
  // 1. selectedElementId: Controls BPMN diagram highlight and which rows get light highlight
  // 2. selectedFlowNodeInstanceKey: Controls which specific instance has deep highlight
  // ============================================================================
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [selectedFlowNodeInstanceKey, setSelectedFlowNodeInstanceKey] = useState<string | null>(null);

  // Filter mode and instance selection state
  const [filterMode, setFilterMode] = useState<'definition' | 'instance'>('definition');
  const [instanceSelectionMode, setInstanceSelectionMode] = useState<'manual' | 'bookmarks'>('manual');
  const [manualInstanceIds, setManualInstanceIds] = useState<string[]>([]);
  const [selectedBookmark, setSelectedBookmark] = useState<string | null>(null);
  const [bookmarkRefreshTrigger, setBookmarkRefreshTrigger] = useState(0);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const bottomCardRef = useRef<HTMLDivElement | null>(null);
  // token to cancel/ignore stale loadBpmnXml results
  const bpmnRequestTokenRef = useRef<number>(0);
  const dmnRequestTokenRef = useRef<number>(0);
  // pending version to set after definition change (from instance selection)
  const pendingVersionRef = useRef<number | null>(null);
  // flag to indicate if diagram switch is from instance selection (don't close detail)
  const isAutoSwitchRef = useRef<boolean>(false);
  // pending instance ID to set after BPMN diagram loads (for highlighting)
  const pendingInstanceIdRef = useRef<string | null>(null);
  // flag to indicate if we should auto-select the first instance after table loads
  const autoSelectFirstInstanceRef = useRef<boolean>(false);

  // URL state synchronization hook
  const {handleShareLink} = useRunwayUrlSync({
    setSelectedDefinitionId,
    setSelectedVersion,
    setSelectedInstanceId,
    setSelectedStates,
    selectedDefinitionId,
    selectedVersion,
    selectedInstanceId,
    selectedStates,
    pendingVersionRef,
    pendingInstanceIdRef,
    versions,
    versionsOwner,
  });

  // Initialize state from localStorage on mount
  useEffect(() => {
    const savedDefinitionState = getDefinitionFilterState();
    const savedInstanceIdsState = getInstanceIdsState();
    const savedBookmarkState = getBookmarkState();

    // Only restore if not already set by URL params
    if (!selectedDefinitionId && savedDefinitionState.processDefinitionId) {
      setSelectedDefinitionId(savedDefinitionState.processDefinitionId);
      setSelectedVersion(savedDefinitionState.version);
      setSelectedStates(savedDefinitionState.states);
      setStartTimeFrom(savedDefinitionState.startTimeFrom);
      setStartTimeTo(savedDefinitionState.startTimeTo);
      setEndTimeFrom(savedDefinitionState.endTimeFrom);
      setEndTimeTo(savedDefinitionState.endTimeTo);
    }

    // Restore instance IDs if in instance mode
    if (filterMode === 'instance' && savedInstanceIdsState.manualInstanceIds.length > 0) {
      setManualInstanceIds(savedInstanceIdsState.manualInstanceIds);
    }

    // Restore bookmark if in instance mode
    if (filterMode === 'instance' && savedBookmarkState.selectedBookmark) {
      setSelectedBookmark(savedBookmarkState.selectedBookmark);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

  // Incident modal hook
  const {
    selectedIncident,
    showIncidentModal,
    stacktraceWrap,
    setSelectedIncident,
    setShowIncidentModal,
    setStacktraceWrap,
    copyIncidentTitle,
    copyIncidentStacktrace,
  } = useIncidentModal();

  // Clear state and close detail pane when page initializes
  useEffect(() => {
    setSelectedInstanceId(null);
    setSelectedInstance(null);
    setIsClosing(false);
    setSelectedIncident(null);
    setSelectedElementId(null);
    setSelectedFlowNodeInstanceKey(null);
    setFlowNodeInstances([]);
    setViewedBpmnDefinition(null);
    setViewedBpmnVersion(null);
    setSelectedDmnDecisionId(null);
    setDmnXml(null);
    setDmnLoading(false);
  }, [setSelectedIncident]);

  // Filter panel collapsed state
  const [filterPanelCollapsed, setFilterPanelCollapsed] = useState(false);

  // Detail pane resize hook
  const {detailWidthPx, onStartDrag, onHandleKeyDown} = useDetailPaneResize({
    containerRef: bottomCardRef,
    dependencies: [selectedDefinitionId, selectedVersion],
  });

  // Reset selections when instance changes
  useEffect(() => {
    setSelectedElementId(null);
    setSelectedFlowNodeInstanceKey(null);
    setFlowNodeInstances([]);
  }, [selectedInstanceId]);

  // Handle flow node instances update from detail panel (e.g., after refresh)
  // This is the single source of truth - ProcessInstanceDetail fetches and lifts data up via this callback
  const handleFlowNodeInstancesUpdate = useCallback((instances: TimedFlowNodeInstance[]) => {
    setFlowNodeInstances(instances);
  }, []);


  // ============================================================================
  // CLEAN SELECTION EVENT HANDLERS
  // ============================================================================
  // Simple, direct state updates with no circular dependencies
  // ============================================================================

  /**
   * Handle BPMN diagram element click
   * Sets element ID and auto-selects first matching instance
   */
  const handleDiagramElementClick = useCallback((elementId: string) => {
    const firstInstance = getFirstInstanceForElement(elementId, flowNodeInstances);

    if (firstInstance) {
      const key = generateFlowNodeInstanceKey(firstInstance);

      setSelectedElementId(elementId);
      setSelectedFlowNodeInstanceKey(key);
    } else {
      // No instances found, just set element
      setSelectedElementId(elementId);
      setSelectedFlowNodeInstanceKey(null);
    }
  }, [flowNodeInstances]);

  /**
   * Handle table row click
   * Sets both element ID and specific instance key
   * Automatically navigates into collapsed subprocess if element is inside one
   */
  const handleTableRowClick = useCallback((elementId: string, instanceKey: string) => {
    // Toggle: if same instance is clicked, deselect
    if (selectedFlowNodeInstanceKey === instanceKey) {
      setSelectedElementId(null);
      setSelectedFlowNodeInstanceKey(null);
    } else {
      setSelectedElementId(elementId);
      setSelectedFlowNodeInstanceKey(instanceKey);

      // Check if element is inside a collapsed subprocess and navigate to it
      if (viewerRef.current) {
        try {
          const elementRegistry = viewerRef.current.get('elementRegistry');
          const canvas = viewerRef.current.get('canvas');

          if (elementRegistry && canvas) {
            const element = elementRegistry.get(elementId);

            if (element) {
              const currentRoot = canvas.getRootElement();

              // Walk up the parent chain to find if element is inside a subprocess
              let parent = element.parent;
              let subprocessToOpen = null;

              while (parent) {
                // If we find a subprocess that is not the current root, we need to navigate to it
                if (parent.$type === 'bpmn:SubProcess' && parent !== currentRoot) {
                  subprocessToOpen = parent;
                }
                parent = parent.parent;
              }

              // If element is inside a collapsed subprocess, open it
              if (subprocessToOpen && subprocessToOpen !== currentRoot) {
                console.log('[RunwayPage] Opening subprocess for element:', elementId, 'subprocess:', subprocessToOpen.id);
                canvas.setRootElement(subprocessToOpen);
              }
            }
          }
        } catch (err) {
          console.warn('[RunwayPage] Error navigating to subprocess for element:', elementId, err);
        }
      }
    }
  }, [selectedFlowNodeInstanceKey]);

  /**
   * Handle popup dropdown change
   * Only updates the specific instance key, keeps element ID
   */
  const handlePopupInstanceChange = useCallback((instanceKey: string) => {
    setSelectedFlowNodeInstanceKey(instanceKey);
  }, []);

  /**
   * Handle popup close
   * Clears both selections
   */
  const handlePopupClose = useCallback(() => {
    setSelectedElementId(null);
    setSelectedFlowNodeInstanceKey(null);
  }, []);

  const calledDecisions = useMemo(
    () => (bpmnXml ? extractCalledDecisions(bpmnXml) : new Map()),
    [bpmnXml]
  );

  const selectedCalledDecision = useMemo(
    () => (selectedElementId ? getCalledDecision(selectedElementId, calledDecisions) : null),
    [selectedElementId, calledDecisions]
  );

  const handleViewDecision = useCallback(async (decisionId: string) => {
    const token = ++dmnRequestTokenRef.current;

    setSelectedDmnDecisionId(decisionId);
    setDmnXml(null);
    setDmnLoading(true);
    setError(null);

    try {
      const xml = await getDmnDefinitionXml(decisionId);
      if (dmnRequestTokenRef.current !== token) {
        return;
      }
      setDmnXml(xml);
    } catch (err) {
      if (dmnRequestTokenRef.current !== token) {
        return;
      }
      console.error('[RunwayPage] Error loading DMN XML:', err);
      setSelectedDmnDecisionId(null);
      setDmnXml(null);
      setError(`Failed to load DMN decision '${decisionId}'`);
    } finally {
      if (dmnRequestTokenRef.current === token) {
        setDmnLoading(false);
      }
    }
  }, []);

  const handleBackToBpmn = useCallback(() => {
    dmnRequestTokenRef.current += 1;
    setSelectedDmnDecisionId(null);
    setDmnXml(null);
    setDmnLoading(false);
  }, []);

  // Track the BPMN being viewed (may come from filters OR from selected instance)
  // This is separate from filter state to maintain independence
  const [viewedBpmnDefinition, setViewedBpmnDefinition] = useState<string | null>(null);
  const [viewedBpmnVersion, setViewedBpmnVersion] = useState<number | null>(null);
  const isViewingDmn = selectedDmnDecisionId !== null;

  // Single overlay settings state (controls the global overlay panel)
  const [overlayOpen, setOverlayOpen] = useState(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);
  // Realtime highlights enable switch (header control)
  const [realtimeHighlightsEnabled, setRealtimeHighlightsEnabled] = useState<boolean>(true);

  // Badge settings state and panel management
  const [badgeSettingsOpen, setBadgeSettingsOpen] = useState(false);
  const badgeSettingsRef = useRef<HTMLDivElement | null>(null);
  const [aggregateBadgeSettings, setAggregateBadgeSettings] = useState<AggregateBadgeSettings>(() => loadAggregateBadgeSettings());
  const [instanceBadgeSettings, setInstanceBadgeSettings] = useState<InstanceBadgeSettings>(() => loadInstanceBadgeSettings());

  // Jobs Panel state
  const [jobsPanelCollapsed, setJobsPanelCollapsed] = useState(true);
  const [activeJobsCount, setActiveJobsCount] = useState(0);

  // Update job count periodically
  useEffect(() => {
    const updateJobsCount = () => {
      setActiveJobsCount(getActiveJobCount());
    };

    updateJobsCount();
    const interval = setInterval(updateJobsCount, 2000);

    return () => clearInterval(interval);
  }, []);

  // Start Process Modal state
  const [showStartModal, setShowStartModal] = useState(false);
  const [startModalPrefill, setStartModalPrefill] = useState<{ definitionId?: string; version?: number }>({});
  const [batchInstanceIds, setBatchInstanceIds] = useState<string[]>([]);
  const [tableRefreshToken, setTableRefreshToken] = useState(0);

  // Create filters object from selected definition and version
  // When in instance mode or batchInstanceIds is set, show specific instances
  const filters: ProcessInstanceFilters = useMemo(() => {
    // Instance mode: use manual IDs OR selected bookmark (NOT both!)
    if (filterMode === 'instance') {
      const instanceIds = new Set<string>();

      // Only use ONE source based on which sub-tab is active
      if (instanceSelectionMode === 'manual') {
        // Manual IDs mode - only use manual IDs
        manualInstanceIds.forEach(id => instanceIds.add(id));
      } else if (instanceSelectionMode === 'bookmarks') {
        // Bookmarks mode - only use selected bookmark IDs
        if (selectedBookmark) {
          const bookmarks = loadBatches();
          const bookmark = bookmarks.find((b) => b.name === selectedBookmark);
          if (bookmark) {
            bookmark.instanceIds.forEach((id: string) => instanceIds.add(id));
          }
        }
      }

      if (instanceIds.size > 0) {
        return {
          processInstanceIds: Array.from(instanceIds),
          states: selectedStates.length > 0 ? selectedStates : undefined,
        };
      }

      // No instances selected in instance mode - return empty filter
      return {processInstanceIds: []};
    }

    // Batch mode (after starting instances)
    if (batchInstanceIds.length > 0) {
      return {
        processInstanceIds: batchInstanceIds,
        states: selectedStates.length > 0 ? selectedStates : undefined,
      };
    }

    // Definition mode: use definition/version filters
    return {
      processDefinitionId: selectedDefinitionId,
      version: selectedVersion,
      states: selectedStates.length > 0 ? selectedStates : undefined,
      startTimeFrom: startTimeFrom,
      startTimeTo: startTimeTo,
      endTimeFrom: endTimeFrom,
      endTimeTo: endTimeTo,
      businessKey: businessKey || null,
      tag: tag || null,
    };
  }, [filterMode, instanceSelectionMode, manualInstanceIds, selectedBookmark, selectedDefinitionId, selectedVersion, selectedStates, batchInstanceIds, startTimeFrom, startTimeTo, endTimeFrom, endTimeTo, businessKey, tag]);

  // Overlay settings - start with defaults to avoid hydration mismatch, load from localStorage after mount
  const [overlaySettings, setOverlaySettings] = useState<OverlaySettingsState>(DEFAULT_OVERLAY_SETTINGS);

  // Load overlay settings from localStorage after component mounts (client-side only)
  useEffect(() => {
    setOverlaySettings(loadOverlaySettings());
  }, []);

  // Handler for start time range changes
  const handleStartTimeRangeChange = useCallback((from: Date | null, to: Date | null) => {
    setStartTimeFrom(from);
    setStartTimeTo(to);
  }, []);

  // Handler for end time range changes
  const handleEndTimeRangeChange = useCallback((from: Date | null, to: Date | null) => {
    setEndTimeFrom(from);
    setEndTimeTo(to);
  }, []);

  // Handle filter mode changes - restore saved state for the selected mode
  useEffect(() => {
    if (filterMode === 'definition') {
      // Restore definition filter state
      const savedState = getDefinitionFilterState();
      setSelectedDefinitionId(savedState.processDefinitionId);
      setSelectedVersion(savedState.version);
      setSelectedStates(savedState.states);
      setStartTimeFrom(savedState.startTimeFrom);
      setStartTimeTo(savedState.startTimeTo);
      setEndTimeFrom(savedState.endTimeFrom);
      setEndTimeTo(savedState.endTimeTo);
      setBatchInstanceIds([]); // Clear batch results when switching to definition mode
    } else if (filterMode === 'instance') {
      // Restore instance IDs state (but keep existing values if they're already set)
      const instanceIdsState = getInstanceIdsState();

      // Restore the sub-tab mode
      if (instanceIdsState.mode) {
        setInstanceSelectionMode(instanceIdsState.mode);
      }

      if (manualInstanceIds.length === 0 && instanceIdsState.manualInstanceIds.length > 0) {
        setManualInstanceIds(instanceIdsState.manualInstanceIds);
      }

      // Restore bookmark state (but keep existing selection if set)
      const bookmarkState = getBookmarkState();
      if (!selectedBookmark && bookmarkState.selectedBookmark) {
        setSelectedBookmark(bookmarkState.selectedBookmark);
      }
    }
  }, [filterMode, manualInstanceIds.length, selectedBookmark]);

  // Save definition filter state when values change
  useEffect(() => {
    if (filterMode === 'definition') {
      saveDefinitionFilterState({
        processDefinitionId: selectedDefinitionId,
        version: selectedVersion,
        states: selectedStates,
        startTimeFrom,
        startTimeTo,
        endTimeFrom,
        endTimeTo,
      });
    }
  }, [filterMode, selectedDefinitionId, selectedVersion, selectedStates, startTimeFrom, startTimeTo, endTimeFrom, endTimeTo]);

  // Save instance IDs state when values change
  useEffect(() => {
    if (filterMode === 'instance') {
      saveInstanceIdsState({
        manualInstanceIds,
        mode: instanceSelectionMode,
      });
    }
  }, [filterMode, manualInstanceIds, instanceSelectionMode]);

  // Save bookmark state when values change
  useEffect(() => {
    if (filterMode === 'instance') {
      saveBookmarkState({
        selectedBookmark,
      });
    }
  }, [filterMode, selectedBookmark]);

  // Auto-switch to definition mode when a definition is selected
  // This handles selections from both FilterPanel and GlobalProcessOverview
  useEffect(() => {
    if (selectedDefinitionId && filterMode === 'instance') {
      // User selected a definition while in instance mode - switch back to definition mode
      setFilterMode('definition');
      // Clear instance selections
      setManualInstanceIds([]);
      setSelectedBookmark(null);
      setBatchInstanceIds([]);
    }
  }, [selectedDefinitionId, filterMode]);

  // Close detail pane when bookmark changes
  useEffect(() => {
    setSelectedInstanceId(null);
  }, [selectedBookmark]);

  // Close detail pane when manual instance IDs change
  useEffect(() => {
    setSelectedInstanceId(null);
  }, [manualInstanceIds]);

  // Debug trigger state
  const [debugTrigger] = useState<{
    requestId: number;
    elementId?: string;
    eventType?: string
  } | null>(null);


  // Single WebSocket connection for the currently viewed BPMN
  // Use viewedBpmn (not filters) so WebSocket works when instance is selected without filters
  // Disable animations when a process instance is selected or overlay is disabled
  const {
    animationTriggers,
    aggregateState,
    instanceState,
    wsStatus,
    forceFallback,
    processInstanceHeatmap,
    globalSummary
  } = useBpmnHeatmap(
      viewedBpmnDefinition,
      viewedBpmnVersion,
      selectedInstanceId,
      // enableAnimations only when realtime highlights is enabled and no instance is selected
      (!selectedInstanceId) && realtimeHighlightsEnabled
  );

  // outside click to close overlay panel
  useEffect(() => {
    const onDocClick = (ev: MouseEvent) => {
      if (!overlayOpen) return;
      if (!overlayRef.current) return;
      if (!overlayRef.current.contains(ev.target as Node)) setOverlayOpen(false);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setOverlayOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [overlayOpen]);

  // outside click to close badge settings panel
  useEffect(() => {
    const onDocClick = (ev: MouseEvent) => {
      if (!badgeSettingsOpen) return;
      if (!badgeSettingsRef.current) return;
      if (!badgeSettingsRef.current.contains(ev.target as Node)) setBadgeSettingsOpen(false);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setBadgeSettingsOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [badgeSettingsOpen]);

  // Focus management: when overlay opens, save previous focus and poll briefly for the first focusable
  useEffect(() => {
    let intervalId: number | null = null;
    if (!overlayOpen) {
      try {
        if (prevFocusRef.current && typeof prevFocusRef.current.focus === 'function') prevFocusRef.current.focus();
      } catch {
      }
      return;
    }

    try {
      prevFocusRef.current = document.activeElement as HTMLElement | null;
    } catch {
    }

    let attempts = 0;
    const maxAttempts = 12; // 12 * 50ms = 600ms
    intervalId = globalThis.setInterval(() => {
      try {
        attempts += 1;
        const root = overlayRef.current;
        if (!root) return;
        const selector = 'button, a[href], input, select, textarea, [role="slider"], [tabindex]:not([tabindex="-1"])';
        const candidates = Array.from(root.querySelectorAll<HTMLElement>(selector));
        const first = candidates.find(el => {
          try {
            const style = window.getComputedStyle(el);
            return style && style.visibility !== 'hidden' && style.display !== 'none' && (el.offsetWidth > 0 || el.offsetHeight > 0);
          } catch {
            return true;
          }
        }) || null;
        if (first) {
          try {
            first.focus({preventScroll: true} as any);
          } catch {
            try {
              first.focus();
            } catch {
            }
          }
          if (intervalId != null) try {
            globalThis.clearInterval(intervalId);
          } catch {
          }
        } else if (attempts >= maxAttempts) {
          // fallback: focus container itself
          try {
            overlayRef.current?.focus();
          } catch {
          }
          if (intervalId != null) try {
            globalThis.clearInterval(intervalId);
          } catch {
          }
        }
      } catch {
      }
    }, 50) as unknown as number;

    return () => {
      try {
        if (intervalId != null) globalThis.clearInterval(intervalId);
      } catch {
      }
      try {
        if (prevFocusRef.current && typeof prevFocusRef.current.focus === 'function') prevFocusRef.current.focus();
      } catch {
      }
    };
  }, [overlayOpen]);

  // Generate clickable links for BPMN diagram navigation
  const clickableLinks = useMemo((): ClickableLink[] => {
    // For now, we return empty array since we don't have call activity element detection yet
    // In the future, we would identify the specific call activity element in the parent process
    // that invoked this instance and make that element clickable

    // TODO: Implement call activity element detection when backend provides this information
    return [];
  }, []);


  // Handle instance row click - toggle selection and ensure correct BPMN diagram is loaded
  const handleInstanceClick = (row: { processInstanceId: string; processDefinitionId: string; version: number }) => {
    const {processInstanceId, processDefinitionId, version} = row;

    if (selectedInstanceId === processInstanceId) {
      // Closing - trigger animation then clear
      handleCloseDetail();
      setSelectedInstance(null);
    } else {
      // Open detail pane for the selected instance
      // DO NOT modify filters - instance selection is independent!
      setIsClosing(false);
      setSelectedInstanceId(processInstanceId);
      setSelectedInstance(row as ProcessInstanceRow);

      // Set the viewed BPMN to match this instance (for diagram display)
      // This does NOT affect filter state - it only controls what BPMN we show
      setViewedBpmnDefinition(processDefinitionId);
      setViewedBpmnVersion(version);

      // Load versions for this definition if not already loaded
      // This ensures BPMN XML can be loaded even when filters aren't set
      if (versionsOwner !== processDefinitionId) {
        loadVersions(processDefinitionId);
      }

      // Load incident info for the selected instance
      loadSelectedInstanceIncident(processInstanceId).catch((e) => {
        // non-fatal - keep selectedIncident null on errors
        console.warn('[RunwayPage] failed to load incident for', processInstanceId, e);
      });
    }
  };

  // Fetch incident information for a given process instance id and set it into state
  const loadSelectedInstanceIncident = async (instanceId: string | null) => {
    if (!instanceId) {
      setSelectedIncident(null);
      return;
    }
    try {
      const pi = await getProcessInstance(instanceId);
      // Backend may include incidentInfo in the process instance payload
      // Use null when not present to avoid undefined handling
      setSelectedIncident((pi as any)?.incidentInfo ?? null);
    } catch (err) {
      console.warn('[RunwayPage] getProcessInstance failed', err);
      setSelectedIncident(null);
    }
  };

  // Handle closing detail panel with animation
  const handleCloseDetail = () => {
    setIsClosing(true);
    // Wait for animation to complete before unmounting
    setTimeout(() => {
      setSelectedInstanceId(null);
      setSelectedInstance(null);
      // Clear any incident shown for the previously selected instance
      setSelectedIncident(null);
      setIsClosing(false);
    }, 300); // Match animation duration
  };

  // Navigate to a specific process instance by ID
  const navigateToInstance = useCallback(async (instanceId: string) => {
    console.log('[RunwayPage] Navigating to instance:', instanceId);

    // Switch to instance mode
    setFilterMode('instance');

    // Set the manual instance ID
    setManualInstanceIds([instanceId]);

    // Clear other instance filters
    setSelectedBookmark(null);
    setBatchInstanceIds([]);

    // Clear definition filters
    setSelectedDefinitionId(null);
    setSelectedVersion(null);

    // Close any open detail pane
    if (selectedInstanceId) {
      setSelectedInstanceId(null);
      setSelectedInstance(null);
      setIsClosing(false);
      setSelectedIncident(null);
    }

    // Auto-select the instance when table loads
    autoSelectFirstInstanceRef.current = true;

    // Force table refresh
    setTableRefreshToken(t => t + 1);

    message.info(`Loading instance: ${instanceId.substring(0, 8)}...`);
  }, [selectedInstanceId, message, setSelectedIncident]);


  // Handle opening start modal
  const handleOpenStartModal = () => {
    console.log('[RunwayPage] Opening start modal', {
      selectedDefinitionId,
      selectedVersion,
      viewedBpmnDefinition,
      viewedBpmnVersion,
      versionsLength: versions.length
    });
    // Prefill with selected filter values (works even if only definition selected, no version)
    // Falls back to viewed BPMN if filters are empty but BPMN is loaded
    const prefillDef = selectedDefinitionId || viewedBpmnDefinition || undefined;
    const prefillVer = selectedVersion !== null ? selectedVersion : (viewedBpmnVersion !== null ? viewedBpmnVersion : undefined);

    setStartModalPrefill({
      definitionId: prefillDef,
      version: prefillVer,
    });
    setShowStartModal(true);
  };

  // Handle successful instance start
  const handleStartSuccess = (instanceIds: string[], bookmarkName: string | null) => {
    if (bookmarkName) {
      // Save bookmark to localStorage
      try {
        saveBatch({
          name: bookmarkName,
          instanceIds,
          timestamp: new Date().toISOString(),
        });
        message.success(`Started ${instanceIds.length} instance${instanceIds.length !== 1 ? 's' : ''} - Bookmark '${bookmarkName}' saved`);

        // Force bookmark list refresh
        setBookmarkRefreshTrigger(prev => prev + 1);

        // Switch to instance mode and select the new bookmark
        setFilterMode('instance');
        setSelectedBookmark(bookmarkName);

        // Clear manual IDs and batch IDs since we're using bookmark now
        setManualInstanceIds([]);
        setBatchInstanceIds([]);
      } catch (error) {
        console.error('Failed to save bookmark:', error);
        message.success(`Started ${instanceIds.length} instance${instanceIds.length !== 1 ? 's' : ''}`);
      }
    } else {
      // No bookmark name - put instance IDs in manual IDs (temporary)
      message.success(`Started ${instanceIds.length} instance${instanceIds.length !== 1 ? 's' : ''}`);

      // Switch to instance mode and populate manual IDs
      setFilterMode('instance');
      setManualInstanceIds(instanceIds);
      setSelectedBookmark(null);
      setBatchInstanceIds([]);
    }

    // Clear definition filters when showing instances
    setSelectedDefinitionId(null);
    setSelectedVersion(null);

    // Force table refresh
    setTableRefreshToken(t => t + 1);

    // Set flag to auto-select first instance when table loads
    autoSelectFirstInstanceRef.current = true;
  };

  // Handle when bookmark is saved from manual IDs
  const handleBookmarkSavedFromManualIds = () => {
    // Trigger bookmark list refresh
    setBookmarkRefreshTrigger(prev => prev + 1);
    // Clear manual IDs since they're now saved in a bookmark
    setManualInstanceIds([]);
  };

  // Ref so handleRowsLoaded (empty deps) always calls the latest handleInstanceClick
  const handleInstanceClickRef = useRef(handleInstanceClick);
  handleInstanceClickRef.current = handleInstanceClick;

  // Handle when rows are loaded in the table
  const handleRowsLoaded = useCallback((rows: ProcessInstanceRow[]) => {
    // Check if we should auto-select the first instance
    if (autoSelectFirstInstanceRef.current && rows.length > 0) {
      autoSelectFirstInstanceRef.current = false; // Reset flag
      const firstRow = rows[0];
      // Use ref to always call the latest handleInstanceClick (avoids stale closure)
      handleInstanceClickRef.current({
        processInstanceId: firstRow.processInstanceId,
        processDefinitionId: firstRow.processDefinitionId,
        version: firstRow.version,
      });
    }
  }, []);

  // Load process definition IDs on mount
  useEffect(() => {
    loadProcessDefinitionIds();
  }, []);

  // Load versions when definition ID changes
  useEffect(() => {
    if (selectedDefinitionId) {
      // Clear previous version and xml immediately to avoid trying to load
      // the old version for a newly-selected definition while async fetch runs.
      setVersions([]);
      setVersionsOwner(null);
      setSelectedVersion(null);
      setBpmnXml(null);
      // If we have a pending version (from instance click), it will be applied
      // after versions load in the pendingVersion useEffect
      loadVersions(selectedDefinitionId);
    } else {
      setVersions([]);
      setVersionsOwner(null);
      setSelectedVersion(null);
      setBpmnXml(null);
      pendingVersionRef.current = null;
    }
  }, [selectedDefinitionId]);

  // Sync viewed BPMN with filter changes
  useEffect(() => {
    if (selectedDefinitionId && selectedVersion !== null) {
      // Filters are set - update viewed BPMN to match filters
      setViewedBpmnDefinition(selectedDefinitionId);
      setViewedBpmnVersion(selectedVersion);
    } else {
      // No filters - clear viewed BPMN (unless set by instance selection)
      // Only clear if there's no selected instance
      if (!selectedInstanceId) {
        setViewedBpmnDefinition(null);
        setViewedBpmnVersion(null);
      }
    }
  }, [selectedDefinitionId, selectedVersion, selectedInstanceId]);

  // Load BPMN XML when viewed BPMN changes OR when versions are loaded
  const loadBpmnXml = useCallback(async (definitionId: string, version: number) => {
    if (!versions.some(v => v.version === version) || versionsOwner !== definitionId) {
      console.warn('[RunwayPage] requested BPMN XML for version not in versions list; skipping', {
        definitionId,
        version,
        versions: versions.map(v => v.version)
      });
      setBpmnXml(null);
      return;
    }
    if (viewedBpmnDefinition !== definitionId) {
      console.warn('[RunwayPage] requested BPMN XML for a stale definitionId; skipping', {
        requested: definitionId,
        current: viewedBpmnDefinition
      });
      return;
    }
    const token = ++bpmnRequestTokenRef.current;
    try {
      setLoading(true);
      setError(null);
      const xml = await getProcessDefinitionXml(
          definitionId,
          version
      );
      if (bpmnRequestTokenRef.current !== token) {
        console.warn('[RunwayPage] ignoring stale BPMN XML response', {definitionId, version});
        return;
      }
      if (!versions.some(v => v.version === version) || versionsOwner !== definitionId || viewedBpmnDefinition !== definitionId) {
        console.warn('[RunwayPage] BPMN XML response stale or version missing after fetch; ignoring', {
          definitionId,
          version,
          versions: versions.map(v => v.version)
        });
        return;
      }
      setBpmnXml(xml);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('status 404')) {
        console.warn('[RunwayPage] BPMN XML not found (404)', {definitionId, version});
        setBpmnXml(null);
      } else {
        setError('Failed to load BPMN diagram');
        console.error('Error loading BPMN XML:', err);
        setBpmnXml(null);
      }
    } finally {
      if (bpmnRequestTokenRef.current === token) setLoading(false);
    }
  }, [versions, versionsOwner, viewedBpmnDefinition]);

  useEffect(() => {
    if (viewedBpmnDefinition && viewedBpmnVersion !== null) {
      loadBpmnXml(viewedBpmnDefinition, viewedBpmnVersion);
    } else {
      setBpmnXml(null);
    }
  }, [viewedBpmnDefinition, viewedBpmnVersion, versions, versionsOwner, loadBpmnXml]);

  useEffect(() => {
    dmnRequestTokenRef.current += 1;
    setSelectedDmnDecisionId(null);
    setDmnXml(null);
    setDmnLoading(false);
  }, [viewedBpmnDefinition, viewedBpmnVersion]);

  // Apply pending version after versions are loaded (from instance selection)
  useEffect(() => {
    if (pendingVersionRef.current !== null && versions.length > 0 && versionsOwner === selectedDefinitionId) {
      const pendingVersion = pendingVersionRef.current;
      // Check if the pending version exists in the loaded versions
      if (versions.some(v => v.version === pendingVersion)) {
        console.log('[RunwayPage] Applying pending version', pendingVersion);
        setSelectedVersion(pendingVersion);
        pendingVersionRef.current = null; // Clear the pending version
      } else {
        console.warn('[RunwayPage] Pending version not found in loaded versions', {
          pending: pendingVersion,
          available: versions.map(v => v.version)
        });
        // No fallback auto-selection - clear pending and let user select manually
        pendingVersionRef.current = null;
      }
    }
  }, [versions, versionsOwner, selectedDefinitionId]);

  // Apply pending instance ID after BPMN diagram loads (for highlighting)
  useEffect(() => {
    if (pendingInstanceIdRef.current !== null && bpmnXml !== null) {
      const pendingInstanceId = pendingInstanceIdRef.current;
      console.log('[RunwayPage] Applying pending instance ID after diagram load', pendingInstanceId);
      setSelectedInstanceId(pendingInstanceId);
      pendingInstanceIdRef.current = null;
    }
  }, [bpmnXml]);

  // Close detail pane when definition or version changes (but only for manual changes, not auto-switch)
  useEffect(() => {
    // If either the definition or version changed, close any open detail panel
    // BUT: don't close if this is an automatic switch from instance selection
    if (selectedInstanceId && !isAutoSwitchRef.current) {
      // Close immediately without animation since we're changing context
      console.log('[RunwayPage] Closing detail panel due to manual filter change');
      setSelectedInstanceId(null);
      setIsClosing(false);
      setSelectedIncident(null);
    }

    // Reset the auto-switch flag after handling
    // Use a timeout to ensure this happens after state updates settle
    if (isAutoSwitchRef.current) {
      const timer = setTimeout(() => {
        isAutoSwitchRef.current = false;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [selectedDefinitionId, selectedVersion]); // eslint-disable-line react-hooks/exhaustive-deps -- selection changes must not retrigger this close-on-filter-change effect


  const loadProcessDefinitionIds = async () => {
    try {
      setError(null);
      const ids = await getProcessDefinitionIds();
      setProcessDefinitionIds(ids);
    } catch (err) {
      setError('Failed to load process definitions');
      console.error('Error loading process definition IDs:', err);
    }
  };

  const loadVersions = async (definitionId: string) => {
    try {
      setError(null);
      const vers = await getProcessDefinitionVersions(
          definitionId
      );
      // Normalize/sort versions so UI shows newest first
      const sorted = Array.from(vers).slice().sort((a, b) => b.version - a.version);
      setVersions(sorted);
      // mark these versions as belonging to this definitionId
      setVersionsOwner(definitionId);
      // No auto-selection - user must manually select a version
    } catch (err) {
      setError('Failed to load versions');
      console.error('Error loading versions:', err);
    }
  };


  return (
      <div ref={containerRef} style={{height: '100%', display: 'flex', flexDirection: 'column'}}>

        {error && (
            <Alert
                message="Error"
                description={error}
                type="error"
                closable
                onClose={() => setError(null)}
                style={{marginBottom: '8px', flexShrink: 0}}
            />
        )}

        <div style={{flex: 1, overflow: 'hidden', display: 'flex'}}>
              {/* Filter Panel - fixed width on the left */}
              <div style={{
                width: filterPanelCollapsed ? '48px' : '350px',
                transition: 'width 0.3s ease',
                flexShrink: 0,
              }}>
                <Card
                    style={{height: '100%', display: 'flex', flexDirection: 'column'}}
                    styles={{body: {padding: 0, flex: 1, overflow: 'hidden'}}}
                >
                  <FilterPanel
                      processDefinitionIds={processDefinitionIds}
                      selectedDefinitionId={selectedDefinitionId}
                      onDefinitionChange={setSelectedDefinitionId}
                      versions={versions}
                      selectedVersion={selectedVersion}
                      onVersionChange={setSelectedVersion}
                      selectedStates={selectedStates}
                      onStatesChange={setSelectedStates}
                      overlaySettings={overlaySettings}
                      versionsDisabled={!selectedDefinitionId || versions.length === 0}
                      collapsed={filterPanelCollapsed}
                      onCollapsedChange={setFilterPanelCollapsed}
                      filterMode={filterMode}
                      onFilterModeChange={setFilterMode}
                      instanceSelectionMode={instanceSelectionMode}
                      onInstanceSelectionModeChange={setInstanceSelectionMode}
                      manualInstanceIds={manualInstanceIds}
                      onManualInstanceIdsChange={setManualInstanceIds}
                      selectedBookmark={selectedBookmark}
                      onSelectedBookmarkChange={setSelectedBookmark}
                      bookmarkRefreshTrigger={bookmarkRefreshTrigger}
                      onBookmarkSaved={handleBookmarkSavedFromManualIds}
                      startTimeFrom={startTimeFrom}
                      startTimeTo={startTimeTo}
                      onStartTimeRangeChange={handleStartTimeRangeChange}
                      endTimeFrom={endTimeFrom}
                      endTimeTo={endTimeTo}
                      onEndTimeRangeChange={handleEndTimeRangeChange}
                      businessKey={businessKey}
                      onBusinessKeyChange={setBusinessKey}
                      tag={tag}
                      onTagChange={setTag}
                  />
                </Card>
              </div>

              {/* Main content area - now takes full width, Jobs panel overlays */}
              <div style={{flex: 1, height: '100%', overflow: 'hidden', position: 'relative'}}>
                {/* Main content area */}
                <div style={{height: '100%', overflow: 'hidden'}}>
                  <VerticalSplit
                      initialTopRatio={0.50}
                      storageKey="runway-split-top-ratio"
                      top={
                        !viewedBpmnDefinition || viewedBpmnVersion === null ? (
                            // Show Global Process Overview when no BPMN is being viewed
                            <Card
                                title="Process Definitions Overview"
                                style={{height: '100%', display: 'flex', flexDirection: 'column'}}
                                extra={
                                  <DiagramCardHeader
                                      realtimeHighlightsEnabled={realtimeHighlightsEnabled}
                                      onToggleRealtimeHighlights={() => setRealtimeHighlightsEnabled(v => !v)}
                                      overlayOpen={overlayOpen}
                                      onToggleOverlay={() => setOverlayOpen(s => !s)}
                                      wsStatus={wsStatus}
                                      onForceFallback={forceFallback}
                                      onStartInstance={handleOpenStartModal}
                                      showStartInstance={true}
                                      jobsPanelCollapsed={jobsPanelCollapsed}
                                      onToggleJobsPanel={() => setJobsPanelCollapsed(v => !v)}
                                      activeJobsCount={activeJobsCount}
                                  />
                                }
                                styles={{
                                  body: {
                                    padding: 0,
                                    flex: 1,
                                    height: '100%',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    overflow: 'hidden'
                                  }
                                }}
                            >
                              <GlobalProcessOverview
                                  globalSummary={globalSummary}
                                  processDefinitionIds={processDefinitionIds}
                                  overlaySettings={overlaySettings}
                                  onFilterChange={(selection) => {
                                    // Update filters based on selection
                                    setSelectedDefinitionId(selection.definitionId);
                                    setSelectedStates(selection.states);

                                    // If a version is being selected
                                    if (selection.version !== null && selection.definitionId) {
                                      // Check if versions are already loaded for this definition
                                      if (versionsOwner === selection.definitionId && versions.some(v => v.version === selection.version)) {
                                        // Versions already loaded, set immediately
                                        setSelectedVersion(selection.version);
                                        pendingVersionRef.current = null;
                                      } else {
                                        // Versions not loaded yet, store pending version
                                        pendingVersionRef.current = selection.version;
                                      }
                                    } else {
                                      // No version selected, clear pending
                                      pendingVersionRef.current = null;
                                      setSelectedVersion(selection.version);
                                    }
                                  }}
                              />
                            </Card>
                        ) : (
                            // Show BPMN Diagram when a definition is selected
                            <Card
                                title={
                                  isViewingDmn && selectedDmnDecisionId
                                      ? `DMN Decision: ${selectedDmnDecisionId}`
                                      : selectedInstanceId
                                      ? `Process Instance: ${selectedInstanceId}`
                                      : viewedBpmnDefinition && viewedBpmnVersion !== null
                                          ? (() => {
                                            const versionInfo = versions.find(v => v.version === viewedBpmnVersion);
                                            const versionTag = versionInfo?.versionTag;
                                            return (
                                                <span>
                                {viewedBpmnDefinition} (v{viewedBpmnVersion})
                                                  {versionTag && (
                                                      <span style={{
                                                        display: 'inline-block',
                                                        padding: '2px 8px',
                                                        fontSize: '11px',
                                                        fontWeight: 500,
                                                        color: '#1890ff',
                                                        background: '#e6f7ff',
                                                        border: '1px solid #91d5ff',
                                                        borderRadius: '10px',
                                                        marginLeft: '8px',
                                                      }}>
                                    {versionTag}
                                  </span>
                                                  )}
                              </span>
                                            );
                                          })()
                                          : 'BPMN Diagram'
                                }
                                style={{height: '100%', display: 'flex', flexDirection: 'column'}}
                                extra={
                                  <DiagramCardHeader
                                      realtimeHighlightsEnabled={realtimeHighlightsEnabled}
                                      onToggleRealtimeHighlights={() => setRealtimeHighlightsEnabled(v => !v)}
                                      overlayOpen={overlayOpen}
                                      onToggleOverlay={() => setOverlayOpen(s => !s)}
                                      badgeSettingsOpen={badgeSettingsOpen}
                                      onToggleBadgeSettings={() => setBadgeSettingsOpen(s => !s)}
                                      wsStatus={wsStatus}
                                      onForceFallback={forceFallback}
                                      onShareLink={handleShareLink}
                                      showShareLink
                                      showBadgeSettings
                                      onStartInstance={handleOpenStartModal}
                                      showStartInstance={true}
                                      jobsPanelCollapsed={jobsPanelCollapsed}
                                      onToggleJobsPanel={() => setJobsPanelCollapsed(v => !v)}
                                       onBackToBpmn={isViewingDmn ? handleBackToBpmn : undefined}
                                      activeJobsCount={activeJobsCount}
                                  />
                                }
                                styles={{
                                  body: {
                                    padding: '8px',
                                    flex: 1,
                                    height: '100%',
                                    display: 'flex',
                                    flexDirection: 'column'
                                  }
                                }}
                            >
                              {!isViewingDmn && selectedIncident && (
                                  <IncidentAlertBanner
                                      incident={selectedIncident}
                                      onShowStacktrace={() => setShowIncidentModal(true)}
                                  />
                              )}

                              {/* Parent Instance Info Banner */}
                              {!isViewingDmn && selectedInstanceId && selectedInstance?.parentProcessInstanceId && (
                                  <div style={{
                                    padding: '8px 12px',
                                    background: '#e6f7ff',
                                    border: '1px solid #91d5ff',
                                    borderRadius: '4px',
                                    marginBottom: '8px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                  }}>
                                    <CallActivityIcon size={16} stroke="#1677ff"/>
                                    <span style={{fontSize: '13px', color: '#0958d9'}}>
                      Called from:
                    </span>
                                    <Button
                                        type="link"
                                        size="small"
                                        icon={<LinkOutlined/>}
                                        onClick={() => navigateToInstance(selectedInstance.parentProcessInstanceId!)}
                                        style={{
                                          padding: 0,
                                          height: 'auto',
                                          fontSize: '13px',
                                          fontWeight: 500,
                                        }}
                                    >
                                      {selectedInstance.parentProcessInstanceId}
                                    </Button>
                                  </div>
                              )}

                              {/* BPMN Viewer Container - positioned relative for popup */}
                              <div style={{
                                position: 'relative',
                                flex: 1,
                                display: 'flex',
                                flexDirection: 'column',
                                overflow: 'hidden'
                              }}>
                                {isViewingDmn ? (
                                    <DmnViewerComponent
                                        dmnXml={dmnXml}
                                        loading={dmnLoading}
                                        activeDecisionId={selectedDmnDecisionId}
                                    />
                                ) : (
                                    <>
                                      <BpmnViewerComponent
                                          bpmnXml={bpmnXml}
                                          loading={loading}
                                          showLiveOverlay={true}
                                          animationTriggers={animationTriggers}
                                          overlaySettings={overlaySettings}
                                          overlayEnabled={realtimeHighlightsEnabled}
                                          debugTrigger={debugTrigger}
                                          selectedDefinitionId={viewedBpmnDefinition}
                                          selectedVersion={viewedBpmnVersion}
                                          processInstanceId={selectedInstanceId}
                                          showBadges={true}
                                          aggregateBadgeSettings={aggregateBadgeSettings}
                                          instanceBadgeSettings={instanceBadgeSettings}
                                          aggregateState={aggregateState}
                                          instanceState={instanceState}
                                          processInstanceHeatmap={processInstanceHeatmap}
                                          clickableLinks={clickableLinks}
                                          onLinkClick={(link) => {
                                            if (link.targetInstanceId) {
                                              navigateToInstance(link.targetInstanceId);
                                            }
                                          }}
                                          onElementClick={handleDiagramElementClick}
                                          selectedElementId={selectedElementId}
                                          onViewerReady={(viewer) => {
                                            viewerRef.current = viewer;
                                          }}
                                      />

                                      {/* Flow Node Detail Popup - positioned within BPMN viewer area */}
                                      {selectedInstanceId && selectedElementId && flowNodeInstances.length > 0 && viewerRef.current && (
                                          <FlowNodeDetailPopup
                                              elementId={selectedElementId}
                                              flowNodeInstances={flowNodeInstances}
                                              overlaySettings={overlaySettings}
                                              onClose={handlePopupClose}
                                              viewer={viewerRef.current}
                                              selectedFlowNodeInstanceKey={selectedFlowNodeInstanceKey}
                                              onInstanceSelect={handlePopupInstanceChange}
                                              calledDecisionId={selectedCalledDecision?.decisionId ?? null}
                                              onViewDecision={handleViewDecision}
                                          />
                                      )}
                                    </>
                                )}

                              </div>

                              <IncidentModal
                                  open={showIncidentModal}
                                  onClose={() => setShowIncidentModal(false)}
                                  incident={selectedIncident}
                                  wrapLines={stacktraceWrap}
                                  onWrapChange={setStacktraceWrap}
                                  onCopyMessage={copyIncidentTitle}
                                  onCopyStacktrace={copyIncidentStacktrace}
                              />
                            </Card>
                        )
                      }
                      bottom={({heightPx}) => (
                          <Card ref={bottomCardRef}
                                style={{height: '100%', display: 'flex', flexDirection: 'column', position: 'relative'}}
                                styles={{
                                  body: {
                                    height: '100%',
                                    padding: 8,
                                    flex: 1,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    overflow: 'hidden'
                                  }
                                }}>
                            {/* Always render the table - never unmount it */}
                            <ProcessInstanceTable
                                key={`${selectedDefinitionId || 'all'}-${selectedVersion ?? 'all'}-${tableRefreshToken}`}
                                filters={filters}
                                heightPx={heightPx}
                                compact
                                fullHeight
                                onRowClick={handleInstanceClick}
                                selectedInstanceId={selectedInstanceId ?? undefined}
                                overlaySettings={overlaySettings}
                                versions={versions}
                                onRowsLoaded={handleRowsLoaded}
                                onNavigateToInstance={navigateToInstance}
                                onBookmarkSaved={() => setBookmarkRefreshTrigger(prev => prev + 1)}
                                onJobCreated={() => {
                                  setJobsPanelCollapsed(false);
                                  setActiveJobsCount(getActiveJobCount());
                                }}
                            />

                            {/* Detail panel overlays on the right with slide animation */}
                            {selectedInstanceId && (
                                <div
                                    style={{
                                      position: 'absolute',
                                      top: 0,
                                      right: 0,
                                      bottom: 0,
                                      background: 'white',
                                      borderLeft: '1px solid #d9d9d9',
                                      boxShadow: '-4px 0 12px rgba(0, 0, 0, 0.08)',
                                      zIndex: 10,
                                      animation: isClosing
                                          ? 'slideOutRight 0.3s ease-in forwards'
                                          : 'slideInRight 0.3s ease-out forwards',
                                      willChange: 'transform, opacity',
                                      overflow: 'hidden',
                                      minWidth: 260,
                                      width: detailWidthPx !== null ? `${detailWidthPx}px` : '75%',
                                    }}
                                    onKeyDown={onHandleKeyDown}
                                    role="region"
                                    aria-label="Process instance detail panel"
                                    tabIndex={-1}
                                >
                                  {/* Scoped keyframes for slide in/out animations */}
                                  <style>{`
                          @keyframes slideInRight {
                            from { transform: translateX(100%); opacity: 0; }
                            to { transform: translateX(0); opacity: 1; }
                          }
                          @keyframes slideOutRight {
                            from { transform: translateX(0); opacity: 1; }
                            to { transform: translateX(100%); opacity: 0; }
                          }
                        `}</style>

                                  {/* Resize handle positioned at left edge of panel */}
                                  <div
                                      role="separator"
                                      aria-orientation="vertical"
                                      tabIndex={0}
                                      onKeyDown={onHandleKeyDown}
                                      onMouseDown={(e) => {
                                        if (e.button === 0) {
                                          e.stopPropagation();
                                          onStartDrag(e.clientX);
                                        }
                                      }}
                                      style={{
                                        position: 'absolute',
                                        left: 0,
                                        top: 0,
                                        bottom: 0,
                                        width: 14,
                                        transform: 'translateX(-7px)',
                                        cursor: 'col-resize',
                                        zIndex: 12
                                      }}
                                  />
                                  <ProcessInstanceDetail
                                      instanceId={selectedInstanceId}
                                      processDefinitionId={viewedBpmnDefinition!}
                                      version={viewedBpmnVersion!}
                                      onClose={handleCloseDetail}
                                      incidentInfo={selectedIncident}
                                      overlaySettings={overlaySettings}
                                      parentProcessInstanceId={selectedInstance?.parentProcessInstanceId}
                                      onNavigateToInstance={navigateToInstance}
                                      selectedElementId={selectedElementId}
                                      selectedFlowNodeInstanceKey={selectedFlowNodeInstanceKey}
                                      onRowClick={handleTableRowClick}
                                      onFlowNodeInstancesUpdate={handleFlowNodeInstancesUpdate}
                                  />
                                </div>
                            )}
                          </Card>
                      ) as React.ReactNode}
                  />
                </div>

                {/* Jobs Panel - overlays on the right side */}
                <div style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  bottom: 0,
                  width: '400px',
                  transform: jobsPanelCollapsed ? 'translateX(100%)' : 'translateX(0)',
                  transition: 'transform 0.3s ease',
                  zIndex: 100,
                  boxShadow: jobsPanelCollapsed ? 'none' : '-2px 0 8px rgba(0,0,0,0.15)',
                  pointerEvents: jobsPanelCollapsed ? 'none' : 'auto',
                }}>
                  <JobsPanel
                      collapsed={jobsPanelCollapsed}
                      onCollapsedChange={setJobsPanelCollapsed}
                      onJobUpdate={() => setActiveJobsCount(getActiveJobCount())}
                  />
                </div>
              </div>

              {/* Overlay settings panel */}
              {overlayOpen && (
                  <div ref={overlayRef} style={{
                    position: 'absolute',
                    top: 56,
                    right: 24,
                    zIndex: 100,
                    width: 320,
                    maxHeight: '80vh',
                    overflowY: 'auto',
                    background: '#fff',
                    boxShadow: '0 2px 16px rgba(0,0,0,0.18)',
                    borderRadius: 12,
                    padding: 24,
                  }}>
                    <OverlaySettings
                        onSettingsChange={setOverlaySettings}
                    />
                  </div>
              )}

              {/* Badge settings panel */}
              {badgeSettingsOpen && (
                  <div ref={badgeSettingsRef} style={{
                    position: 'absolute',
                    top: 56,
                    right: 24,
                    zIndex: 100,
                    width: 320,
                    maxHeight: '80vh',
                    overflowY: 'auto',
                    background: '#fff',
                    boxShadow: '0 2px 16px rgba(0,0,0,0.18)',
                    borderRadius: 12,
                    padding: 24,
                  }}>
                    <BadgeSettings
                        mode={selectedInstanceId ? 'instance' : 'aggregated'}
                        onSettingsChange={(settings) => {
                          if (selectedInstanceId) {
                            console.log('[Page] Instance settings changed:', settings);
                            setInstanceBadgeSettings(settings as InstanceBadgeSettings);
                          } else {
                            console.log('[Page] Aggregate settings changed:', settings);
                            setAggregateBadgeSettings(settings as AggregateBadgeSettings);
                          }
                        }}
                    />
                  </div>
              )}

              {/* Start Process Modal - Always rendered so it's available from any view */}
              <StartProcessModal
                  open={showStartModal}
                  onClose={() => setShowStartModal(false)}
                  processDefinitionIds={processDefinitionIds}
                  versions={versions}
                  prefillDefinitionId={startModalPrefill.definitionId}
                  prefillVersion={startModalPrefill.version}
                  onStartSuccess={handleStartSuccess}
              />
            </div>

      </div>
  );
}

// Wrap the component with Suspense to handle useSearchParams() properly
export default function RunwayPage() {
  return (
    <Suspense fallback={<div style={{ padding: '20px' }}>Loading...</div>}>
      <RunwayPageContent />
    </Suspense>
  );
}

