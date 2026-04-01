"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Card, Table, Button, Breadcrumb, Tooltip, App, Modal, Spin, Tabs, Tag, Empty } from 'antd';
import { CloseOutlined, UpOutlined, CodeOutlined, DownloadOutlined, ReloadOutlined, CopyOutlined, LinkOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { BpmnIcon, CallActivityIcon } from './BpmnIcons';
import HorizontalSplit from '@/components/layout/HorizontalSplit';
import { getFlowNodeInstances, getProcessVariables, TimedFlowNodeInstance } from '@/lib/api/processInstanceApi';
import type { OverlaySettingsState } from './OverlaySettings';
import { getStateColor } from '@/lib/utils/stateColors';
import { findInstanceByKey } from '@/lib/utils/flowNodeInstanceUtils';
import {
  buildSelectedFlowNodeActivityRows,
} from '@/lib/utils/processInstanceTrust';
import type { ActivityRow } from '@/lib/utils/processInstanceTrust';

interface ProcessInstanceDetailProps {
  instanceId: string;
  processDefinitionId: string;
  version: number;
  onClose: () => void;
  // Optional incident info passed from parent (may be null)
  incidentInfo?: any;
  // Overlay settings for consistent state colors
  overlaySettings?: OverlaySettingsState;
  // Parent process instance ID (for call activities)
  parentProcessInstanceId?: string | null;
  // Callback to navigate to a specific instance
  onNavigateToInstance?: (instanceId: string) => void;
  // Clean selection props (from parent)
  selectedElementId?: string | null;
  selectedFlowNodeInstanceKey?: string | null;
  onRowClick?: (elementId: string, instanceKey: string) => void;
  // Callback when flow node instances are updated (for popup synchronization)
  onFlowNodeInstancesUpdate?: (instances: TimedFlowNodeInstance[]) => void;
}

interface FlowNodeInstanceRow {
  id: string; // unique per row
  elementInstanceId?: number; // underlying element instance id
  elementId: string;
  elementName?: string;
  elementType?: string;
  state: string;
  // Single occurrence time for this flow node instance (ISO string or undefined)
  time?: string;
  children?: FlowNodeInstanceRow[];
  level?: number; // computed nesting level
  originalIndex?: number; // index in the original flowNodeInstances array
  path?: string[]; // hierarchical path of element instance IDs for sorting
}

interface VariableRowBrowse {
  key: string;
  name: string;
  type: string;
  value: any;
  isComposite: boolean;
  pathKey: string | number;
  preview: string;
}

export default function ProcessInstanceDetail({
  instanceId,
  onClose,
  overlaySettings,
  parentProcessInstanceId,
  onNavigateToInstance,
  selectedElementId,
  selectedFlowNodeInstanceKey,
  onRowClick,
  onFlowNodeInstancesUpdate,
}: Readonly<ProcessInstanceDetailProps>) {
  const { message } = App.useApp();
  const [flowNodeInstances, setFlowNodeInstances] = useState<TimedFlowNodeInstance[]>([]);
  const [flowNodesLoading, setFlowNodesLoading] = useState(false);
  const [refreshToken, setRefreshToken] = useState<number>(0);
  const [allVariables, setAllVariables] = useState<Record<string, any>>({ process: {} });
  const [variablesLoading, setVariablesLoading] = useState(false);
  const [activeInspectorTab, setActiveInspectorTab] = useState<'activity' | 'variables'>('variables');

  // Keep refs to callback and message so effects only re-run on real data changes
  const messageRef = useRef(message);
  messageRef.current = message;
  const onFlowNodeInstancesUpdateRef = useRef(onFlowNodeInstancesUpdate);
  onFlowNodeInstancesUpdateRef.current = onFlowNodeInstancesUpdate;

  // Compute selected instance from key (no local state!)
  const selectedFlowNodeInstance = useMemo(() => {
    return findInstanceByKey(selectedFlowNodeInstanceKey || null, flowNodeInstances);
  }, [selectedFlowNodeInstanceKey, flowNodeInstances]);

  // Ref and state for virtual scrolling
  const flowTableContainerRef = useRef<HTMLDivElement>(null);
  const [flowTableScrollHeight, setFlowTableScrollHeight] = useState<number>(400);

  const loadFlowNodesPage = useCallback(async () => {
    try {
      setFlowNodesLoading(true);
      const instances = await getFlowNodeInstances(instanceId);
      setFlowNodeInstances(instances ?? []);
      // Notify parent component of updated instances
      onFlowNodeInstancesUpdateRef.current?.(instances ?? []);
    } catch (error) {
      console.error('Failed to fetch flow node instances:', error);
      messageRef.current.error('Failed to load flow node instances');
    } finally {
      setFlowNodesLoading(false);
    }
  }, [instanceId]); // no longer depends on message or onFlowNodeInstancesUpdate

  // Fetch flow node instances when instance or refreshToken changes
  useEffect(() => {
    if (!instanceId) return;
    loadFlowNodesPage();
  }, [instanceId, refreshToken, loadFlowNodesPage]);

  useEffect(() => {
    if (!selectedFlowNodeInstance && activeInspectorTab === 'activity') {
      setActiveInspectorTab('variables');
    }
  }, [activeInspectorTab, selectedFlowNodeInstance]);

  // Auto-scroll to selected element when selectedElementId changes
  useEffect(() => {
    if (!selectedElementId || !flowNodeInstances.length) return;

    // Small delay to ensure table has rendered
    const timeoutId = setTimeout(() => {
      // Find the first row with matching elementId
      const rows = document.querySelectorAll('[data-row-key]');
      for (const row of rows) {
        const rowElement = row as HTMLElement;
        const rowKey = rowElement.getAttribute('data-row-key');

        // Check if this row matches by looking at the row's data attribute or content
        // Since we can't easily access dataSource here, we'll use a simpler approach
        // by adding a data attribute to the row during rendering
        if (rowKey) {
          // The row will be highlighted by rowClassName, so we scroll to highlighted row
          if (rowElement.classList.contains('flow-node-row-selected')) {
            rowElement.scrollIntoView({
              behavior: 'smooth',
              block: 'nearest',
            });
            break;
          }
        }
      }
    }, 150);

    return () => clearTimeout(timeoutId);
  }, [selectedElementId, flowNodeInstances]);

  // Fetch process-level variables only
  useEffect(() => {
    const fetchVariables = async () => {
      try {
        setVariablesLoading(true);
        const vars = await getProcessVariables(instanceId);
        setAllVariables({ process: vars ?? {} });
      } catch (error) {
        console.error('Failed to fetch variables:', error);
        messageRef.current.error('Failed to load variables');
      } finally {
        setVariablesLoading(false);
      }
    };

    fetchVariables();
  }, [instanceId]); // message excluded via ref to avoid extra fetches

  // Track container height for virtual scrolling
  useEffect(() => {
    const container = flowTableContainerRef.current;
    if (!container) return;

    const updateHeight = () => {
      const height = container.clientHeight;
      if (height > 0) {
        setFlowTableScrollHeight(height);
      }
    };

    updateHeight();

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Browsing state for variables
  const [varPath, setVarPath] = useState<(string | number)[]>([]);
  const [varsAnimClass, setVarsAnimClass] = useState<string>('');
  const [showJsonModal, setShowJsonModal] = useState<boolean>(false);
  const prevDepthRef = useRef<number>(0);

  // When selection changes, reset browsing path
  useEffect(() => {
    setVarPath([]);
    setVarsAnimClass('');
    prevDepthRef.current = 0;
  }, [selectedFlowNodeInstanceKey]);

  // Animate on path change (drill in/out)
  useEffect(() => {
    // Skip animation on initial mount
    const prev = prevDepthRef.current;
    const next = varPath.length;
    if (prev === 0 && next === 0) return;
    if (next > prev) setVarsAnimClass('vars-slide-in-left');
    else if (next < prev) setVarsAnimClass('vars-slide-in-right');
    prevDepthRef.current = next;
    const t = setTimeout(() => setVarsAnimClass(''), 220);
    return () => clearTimeout(t);
  }, [varPath]);

  // Helper: extract variables from a TimedFlowNodeInstance's DTO
  const getNodeVariables = (node: TimedFlowNodeInstance | null | undefined): any | null => {
    if (!node) return null;
    const anyNode = node as any;

    // Prioritize mergedVariables if available (contains accumulated variables from all updates)
    if (anyNode.mergedVariables && typeof anyNode.mergedVariables === 'object') {
      return anyNode.mergedVariables;
    }

    // Fallback to extracting from the flowNodeInstanceUpdate DTO
    const update = anyNode.flowNodeInstanceUpdate ?? anyNode.flowNodeInstanceUpdateDTO ?? anyNode.update ?? anyNode;
    if (!update) return null;
    const raw = update.variables ?? null;
    if (raw && typeof raw === 'object' && !Array.isArray(raw) && raw.variables && typeof raw.variables === 'object') {
      // Unwrap one extra { variables: { ... } } level
      return raw.variables;
    }
    return raw;
  };

  const nodeVars = getNodeVariables(selectedFlowNodeInstance);
  const hasNodeVars = nodeVars && Object.keys(nodeVars).length > 0;

  const rootVars = hasNodeVars ? nodeVars : allVariables.process;
  const rootVarsJson = JSON.stringify(rootVars ?? {}, null, 2);

  const downloadJson = () => {
    try {
      const blob = new Blob([rootVarsJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `variables-${selectedFlowNodeInstanceKey || 'process'}-${instanceId}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      message.success('Downloaded');
    } catch {
      message.error('Download failed');
    }
  };

  const syntaxHighlight = (json: string | undefined | null) => {
    const safe = typeof json === 'string' ? json : '';
    return safe.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, (match) => {
      let cls = 'json-number';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'json-key';
        } else {
          cls = 'json-string';
        }
      } else if (/true|false/.test(match)) {
        cls = 'json-boolean';
      } else if (/null/.test(match)) {
        cls = 'json-null';
      }
      return `<span class="${cls}">${match}</span>`;
    });
  };

  const getNodeAtPath = (root: any, path: (string | number)[]) => {
    let node = root;
    for (const seg of path) {
      if (node == null) return undefined;
      node = node[seg as any];
    }
    return node;
  };

  const node = getNodeAtPath(rootVars, varPath) ?? rootVars;

  const typeOf = (v: any): string => {
    if (v === null || v === undefined) return 'Null';
    if (Array.isArray(v)) return `Array(${v.length})`;
    const t = typeof v;
    if (t === 'object') return 'Object';
    if (t === 'number') return Number.isInteger(v) ? 'Integer' : 'Double';
    if (t === 'boolean') return 'Boolean';
    if (t === 'string') return 'String';
    return t;
  };

  const preview = (v: any): string => {
    if (Array.isArray(v)) return `[Array ${v.length}]`;
    if (v && typeof v === 'object') return '{Object}';
    if (typeof v === 'string') return v.length > 60 ? v.slice(0, 57) + '…' : v;
    return String(v);
  };

  const buildRows = (n: any): VariableRowBrowse[] => {
    const rows: VariableRowBrowse[] = [];
    if (Array.isArray(n)) {
      n.forEach((item, idx) => {
        rows.push({
          key: `idx-${idx}`,
          name: `[${idx}]`,
          type: typeOf(item),
          value: item,
          isComposite: Array.isArray(item) || (item && typeof item === 'object'),
          pathKey: idx,
          preview: preview(item)
        });
      });
    } else if (n && typeof n === 'object') {
      Object.entries(n).forEach(([k, v]) => {
        rows.push({
          key: `key-${k}`,
          name: k,
          type: typeOf(v),
          value: v,
          isComposite: (Array.isArray(v) || (v !== null && typeof v === 'object')),
          pathKey: k,
          preview: preview(v)
        });
      });
    }
    return rows;
  };

  const variableRows = buildRows(node);

  const variableColumns: ColumnsType<VariableRowBrowse> = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      width: 220,
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      width: 120
    },
    {
      title: 'Value',
      dataIndex: 'preview',
      key: 'value'
    }
  ];

  // Compute levels for clearer indentation in the name column
  const addLevels = (nodes: FlowNodeInstanceRow[], level = 0): FlowNodeInstanceRow[] =>
    nodes.map(n => ({
      ...n,
      level,
      children: n.children ? addLevels(n.children, level + 1) : undefined
    }));

  // Build a tree of FlowNodeInstanceRow from a flat list using flowNodeInstancePath from the backend
  const buildTreeFromPath = (rows: FlowNodeInstanceRow[], pathMap: Map<string, string[]>): FlowNodeInstanceRow[] => {
    const byPathKey = new Map<string, FlowNodeInstanceRow>();
    const roots: FlowNodeInstanceRow[] = [];

    // Clone rows into map keyed by path
    rows.forEach((row) => {
      const pathKey = row.path?.join('/') ?? row.id;
      byPathKey.set(pathKey, { ...row, children: [] });
    });

    // Create synthetic parent nodes for missing intermediate paths
    // This handles cases where subprocess containers don't have their own flow node instance entry
    pathMap.forEach((path) => {
      // For each path, ensure all parent paths exist
      for (let i = 1; i < path.length; i++) {
        const parentPath = path.slice(0, i);
        const parentKey = parentPath.join('/');

        // If no row exists for this intermediate path, create a synthetic parent
        if (!byPathKey.has(parentKey)) {
          const lastSegment = parentPath[parentPath.length - 1];
          const syntheticRow: FlowNodeInstanceRow = {
            id: `synthetic-${parentKey}`,
            elementInstanceId: parseInt(lastSegment, 10) || undefined,
            elementId: `Subprocess (${lastSegment})`,
            elementName: `Subprocess`,
            elementType: 'subProcess',
            state: 'ACTIVE', // Assume active since children are executing
            time: undefined,
            children: [],
            path: parentPath.map(String),
          };
          byPathKey.set(parentKey, syntheticRow);
        }
      }
    });

    // Helper to find parent path key
    const getParentPathKey = (path: string[]): string | null => {
      if (!path || path.length <= 1) return null;
      return path.slice(0, -1).join('/');
    };

    // Build parent-child relationships using paths
    byPathKey.forEach((row, pathKey) => {
      const path = row.path ?? pathKey.split('/');
      const parentPathKey = getParentPathKey(path);

      if (!parentPathKey) {
        roots.push(row);
        return;
      }

      const parentRow = byPathKey.get(parentPathKey);
      if (parentRow) {
        if (!parentRow.children) parentRow.children = [];
        parentRow.children.push(row);
      } else {
        // Fallback: if parent not found, treat as root
        roots.push(row);
      }
    });

    return roots;
  };

  // Convert backend TimedFlowNodeInstance to FlowNodeInstanceRow
  const convertToRows = (flowNodes: TimedFlowNodeInstance[]): FlowNodeInstanceRow[] => {
    const flat: FlowNodeInstanceRow[] = [];
    const pathMap = new Map<string, string[]>();

    flowNodes.forEach((fn, idx) => {
      // Backend shape: { timestamp, flowNodeInstanceUpdate, elementId, elementName, elementType }
      const innerUpdate: any = (fn as any).flowNodeInstanceUpdate ?? (fn as any).flowNodeInstanceUpdateDTO ?? (fn as any).update ?? fn;
      const innerInstance: any = innerUpdate.flowNodeInstance ?? innerUpdate.flowNode ?? innerUpdate.node ?? {};

      // Backend now provides elementId, elementName, and elementType at the top level of TimedFlowNodeInstance
      const elementId: string | undefined = (fn as any).elementId ?? innerInstance.elementId ?? innerInstance.element_id;
      const elementName: string | undefined = (fn as any).elementName ?? innerInstance.elementName ?? innerInstance.name;
      const elementType: string | undefined = (fn as any).elementType ?? innerInstance.elementType ?? innerInstance.type;
      const elementInstanceId: number | undefined = innerInstance.elementInstanceId ?? innerInstance.eid ?? innerInstance.id;


      const rawTs = (fn as any).timestamp;
      const timestamp = typeof rawTs === 'number' ? new Date(rawTs).toISOString() : rawTs;
      const stateVal = innerInstance.state?.name ?? innerInstance.state ?? innerUpdate.state ?? 'UNKNOWN';

      // Path is provided by the DTO to represent the hierarchy of element instances
      // Backend returns flowNodeInstancePath as number[], so we convert to string[]
      const rawPath =
        (innerUpdate.flowNodeInstancePath as (string | number)[] | undefined) ??
        (innerUpdate.instancePath as (string | number)[] | undefined) ??
        (Array.isArray((innerUpdate as any).path)
          ? ((innerUpdate as any).path as (string | number)[])
          : null);

      // Normalize path to string[] - this ensures consistent key generation for tree building
      const path: string[] = rawPath
        ? rawPath.map(segment => String(segment))
        : [String(elementInstanceId ?? idx)];

      // Use path as the unique ID to avoid collisions when multiple flow nodes share elementInstanceId
      // (e.g., subprocess containers and their children may have overlapping IDs)
      const uniqueId = `path-${path.join('/')}`;

      flat.push({
        id: uniqueId,
        elementInstanceId,
        elementId: elementId ?? `node-${idx}`,
        elementName: elementName,
        elementType: elementType ?? inferElementType(elementId),
        state: String(stateVal),
        time: timestamp,
        originalIndex: idx,
        path: path,
      });

      pathMap.set(uniqueId, path);
    });

    const tree = buildTreeFromPath(flat, pathMap);
    return addLevels(tree);
  };

  // Infer element type from elementId (temporary until backend provides it)
  const inferElementType = (elementId?: string): string => {
    if (!elementId || typeof elementId !== 'string') return 'task';
    const lc = elementId.toLowerCase();
    if (lc.includes('start')) return 'startEvent';
    if (lc.includes('end')) return 'endEvent';
    if (lc.includes('gateway')) return 'exclusiveGateway';
    if (lc.includes('task')) return 'serviceTask';
    return 'task';
  };

  const dataSource = convertToRows(flowNodeInstances);


  const flowColumns: ColumnsType<FlowNodeInstanceRow> = [
    {
      title: '',
      key: 'type',
      dataIndex: 'elementType',
      width: 32,
      align: 'center',
      render: (_: any, n) => (
        <span className="iconCell">
          <BpmnIcon type={n.elementType} size={16} color={stateColor(n.state)} />
        </span>
      ),
    },
    {
      title: '',
      key: 'expander',
      width: 28,
      align: 'center',
      render: () => null,
    },
    {
      title: 'Flow Node',
      key: 'name',
      dataIndex: 'elementName',
      ellipsis: true,
      onHeaderCell: () => ({
        style: { whiteSpace: 'nowrap' }
      }),
      sorter: (a, b) => {
        // Hierarchical sorting: compare paths level by level
        const pathA = a.path || [];
        const pathB = b.path || [];

        // Compare each level of the path hierarchy
        const maxLength = Math.max(pathA.length, pathB.length);
        for (let i = 0; i < maxLength; i++) {
          const segA = pathA[i] || '';
          const segB = pathB[i] || '';

          // Try to parse as numbers for numeric comparison
          const numA = parseInt(segA, 10);
          const numB = parseInt(segB, 10);

          if (!isNaN(numA) && !isNaN(numB)) {
            // Both are numbers, compare numerically
            if (numA !== numB) {
              return numA - numB;
            }
          } else {
            // String comparison
            const cmp = segA.localeCompare(segB);
            if (cmp !== 0) {
              return cmp;
            }
          }
        }

        // If all path segments are equal, compare by element instance ID
        return (a.elementInstanceId ?? 0) - (b.elementInstanceId ?? 0);
      },
      defaultSortOrder: 'ascend' as const,
      render: (_: any, n) => {
        const displayName = n.elementName || n.elementId;
        const tooltipText = n.elementName
          ? `${n.elementName} (${n.elementId})`
          : n.elementId;
        return (
          <Tooltip title={tooltipText} placement="topLeft">
            <span style={{ fontSize: 12, paddingLeft: Math.max(0, (n.level ?? 0) * 12), cursor: 'help' }}>
              {displayName}
            </span>
          </Tooltip>
        );
      },
    },
    {
      title: 'Time',
      key: 'time',
      width: 180,
      onHeaderCell: () => ({
        style: { whiteSpace: 'nowrap' }
      }),
      sorter: (a, b) => {
        const timeA = a.time ? new Date(a.time).getTime() : 0;
        const timeB = b.time ? new Date(b.time).getTime() : 0;

        // Primary sort: by timestamp
        const timeDiff = timeA - timeB;
        if (timeDiff !== 0) {
          return timeDiff;
        }

        // Secondary sort: by hierarchical path (same logic as Flow Node column)
        const pathA = a.path || [];
        const pathB = b.path || [];

        const maxLength = Math.max(pathA.length, pathB.length);
        for (let i = 0; i < maxLength; i++) {
          const segA = pathA[i] || '';
          const segB = pathB[i] || '';

          const numA = parseInt(segA, 10);
          const numB = parseInt(segB, 10);

          if (!isNaN(numA) && !isNaN(numB)) {
            if (numA !== numB) {
              return numA - numB;
            }
          } else {
            const cmp = segA.localeCompare(segB);
            if (cmp !== 0) {
              return cmp;
            }
          }
        }

        // Tertiary sort: by element instance ID
        return (a.elementInstanceId ?? 0) - (b.elementInstanceId ?? 0);
      },
      render: (_: any, n) => {
        if (!n.time) return '—';
        const date = new Date(n.time);
        // Format with milliseconds: "12/29/2025, 10:30:45.123"
        const dateStr = date.toLocaleString();
        const ms = date.getMilliseconds().toString().padStart(3, '0');
        return `${dateStr}.${ms}`;
      },
    },
  ];

  const stateColor = (state: string): string => {
    return getStateColor(state, overlaySettings);
  };

  const selectedElementLabel = useMemo(() => {
    if (selectedFlowNodeInstance?.elementName || selectedFlowNodeInstance?.elementId) {
      return selectedFlowNodeInstance.elementName || selectedFlowNodeInstance.elementId || null;
    }
    if (!selectedElementId) return null;
    const match = dataSource.find(row => row.elementId === selectedElementId);
    return match?.elementName || match?.elementId || selectedElementId;
  }, [dataSource, selectedElementId, selectedFlowNodeInstance]);

  const activityRows = useMemo(
    () => buildSelectedFlowNodeActivityRows({ selectedFlowNodeInstance }),
    [selectedFlowNodeInstance]
  );

  const activityColumns: ColumnsType<ActivityRow> = [
    {
      title: 'Time',
      dataIndex: 'timeLabel',
      key: 'time',
      width: 180,
      onHeaderCell: () => ({ style: { whiteSpace: 'nowrap' } }),
    },
    {
      title: 'State',
      dataIndex: 'activity',
      key: 'activity',
      width: 100,
      render: (_: unknown, row) => (
        <Tooltip title={row.activity} placement="topLeft">
          <div
            style={{
              fontSize: 12,
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {row.activity}
          </div>
        </Tooltip>
      ),
    },
  ];

  return (
    <div data-testid="process-instance-detail" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        padding: '6px 10px',
        borderBottom: '1px solid #f0f0f0',
        background: '#fafafa',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, minWidth: 0 }}>
            <span style={{ fontWeight: 600, color: '#262626', fontSize: 12 }}>Instance:</span>
            <span style={{ color: '#8c8c8c', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}>{instanceId}</span>
            <Tooltip title="Copy instance ID" placement="right">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(instanceId);
                  message.success('Instance ID copied to clipboard');
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '1';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '0.6';
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  padding: '2px',
                  lineHeight: 0,
                  cursor: 'pointer',
                  opacity: 0.6,
                  transition: 'opacity 0.2s ease',
                }}
              >
                <CopyOutlined style={{ fontSize: 11, color: '#8c8c8c' }} />
              </button>
            </Tooltip>
          </div>

        </div>
        <Tooltip title="Close detail panel" placement="left">
          <Button
            type="text"
            size="small"
            icon={<CloseOutlined />}
            onClick={onClose}
            style={{ padding: 4 }}
          />
        </Tooltip>
      </div>

      {/* Parent Instance Info Banner */}
      {parentProcessInstanceId && (
        <div style={{
          padding: '8px 12px',
          background: '#f0f5ff',
          borderBottom: '1px solid #d6e4ff',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexShrink: 0,
        }}>
          <CallActivityIcon size={14} stroke="#1677ff" />
          <span style={{ fontSize: '12px', color: '#595959' }}>
            Called from:
          </span>
          <Button
            type="link"
            size="small"
            icon={<LinkOutlined />}
            onClick={() => onNavigateToInstance?.(parentProcessInstanceId)}
            style={{
              padding: 0,
              height: 'auto',
              fontSize: '12px',
            }}
          >
            {parentProcessInstanceId}
          </Button>
        </div>
      )}

      {/* Content - Horizontal Split */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <HorizontalSplit
          storageKey="process-instance-detail-split"
          initialLeftRatio={0.3}
          minLeftPx={250}
          minRightPx={200}
          left={
            <Card
              title={<span style={{ fontSize: 12, fontWeight: 600 }}>Flow Node Instances</span>}
              size="small"
              styles={{
                body: { padding: 4, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' },
                header: { minHeight: 32, padding: '4px 10px', borderBottom: 'none' }
              }}
              style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 0, border: 'none' }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: 11,
                  color: '#8c8c8c',
                  marginBottom: 6,
                  flexShrink: 0,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>
                    {dataSource.length} flow node{dataSource.length === 1 ? '' : 's'}
                  </span>
                  <Button
                    type="text"
                    size="small"
                    icon={<ReloadOutlined />}
                    loading={flowNodesLoading}
                    onClick={() => setRefreshToken((x) => x + 1)}
                    style={{ padding: '0 4px', height: 18 }}
                  />
                </div>
              </div>

              <div ref={flowTableContainerRef} style={{ flex: 1, overflow: 'hidden' }}>
                {flowNodesLoading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                    <Spin />
                  </div>
                ) : (
                  <Table
                    className="compactTable treeCompact"
                    size="small"
                    rowKey="id"
                    columns={flowColumns}
                    dataSource={dataSource}
                    pagination={false}
                    scroll={{ y: flowTableScrollHeight }}
                    expandable={{
                      defaultExpandAllRows: true,
                      indentSize: 20,
                      expandIcon: ({ expanded, onExpand, record }) => {
                        // Only show expand icon if the record has children
                        if (!record.children || record.children.length === 0) {
                          return null;
                        }
                        return (
                          <button
                            onClick={(e) => {
                              onExpand(record, e);
                            }}
                            style={{
                              border: 'none',
                              background: 'transparent',
                              cursor: 'pointer',
                              padding: 0,
                              width: 17,
                              height: 17,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 12,
                              color: '#8c8c8c',
                            }}
                          >
                            <span style={{
                              display: 'inline-block',
                              width: 14,
                              height: 14,
                              lineHeight: '12px',
                              textAlign: 'center',
                              border: '1px solid #d9d9d9',
                              borderRadius: 2,
                              backgroundColor: '#fff',
                            }}>
                              {expanded ? '−' : '+'}
                            </span>
                          </button>
                        );
                      },
                    }}
                    expandIconColumnIndex={1}
                    rowClassName={(record) => {
                      // Check if this specific row is selected (deep highlight)
                      const isSelected = record.id === selectedFlowNodeInstanceKey;
                      // Check if this row matches the selected element but isn't the selected row (light highlight)
                      const isElementMatched = selectedElementId && record.elementId === selectedElementId && !isSelected;

                      if (isSelected) {
                        return 'flow-node-row-selected';
                      } else if (isElementMatched) {
                        return 'flow-node-row-element-matched';
                      }
                      return '';
                    }}
                    onRow={(record) => ({
                      onClick: () => {
                        // Call parent callback with elementId and instance key
                        if (onRowClick && record.elementId) {
                          onRowClick(record.elementId, record.id);
                        }
                      },
                      style: { cursor: 'pointer' },
                    })}
                  />
                )}
              </div>
            </Card>
          }
          right={
            <Card
              size="small"
              styles={{
                body: { padding: 0, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' },
                header: { minHeight: 32, padding: '4px 10px', borderBottom: 'none' }
              }}
              style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 0, border: 'none' }}
            >
              <Tabs
                activeKey={activeInspectorTab}
                onChange={(key) => setActiveInspectorTab(key as 'activity' | 'variables')}
                size="small"
                items={[
                  ...(selectedFlowNodeInstance ? [{
                    key: 'activity',
                    label: 'Activity',
                    children: (
                      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 8, gap: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <span style={{ fontSize: 11, color: '#8c8c8c' }}>
                              Shows the trust result for the command processed at each update and, when different, the original command provenance.
                            </span>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                              <Tag color="blue" style={{ marginInlineEnd: 0 }}>
                                {selectedElementLabel || 'Selected flow node'}
                              </Tag>
                              <span style={{ fontSize: 11, color: '#8c8c8c' }}>
                                {activityRows.length} update{activityRows.length === 1 ? '' : 's'} captured for this instance path.
                              </span>
                              <Tooltip
                                title="Current shows per-update verification. Origin is only shown when the command that started the chain differs from the command processed on that update."
                                placement="topLeft"
                              >
                                <span style={{ fontSize: 11, color: '#8c8c8c', textDecoration: 'underline dotted', cursor: 'help' }}>
                                  How trust is shown
                                </span>
                              </Tooltip>
                            </div>
                          </div>
                        </div>

                        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                          {activityRows.length === 0 ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                              <Empty
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                description="No update history recorded yet for this flow-node instance."
                              />
                            </div>
                          ) : (
                            <Table
                              className="compactTable"
                              size="small"
                              rowKey="key"
                              columns={activityColumns}
                              dataSource={activityRows}
                              pagination={false}
                              tableLayout="fixed"
                              scroll={{ x: 710, y: flowTableScrollHeight }}
                            />
                          )}
                        </div>
                      </div>
                    ),
                  }] : []),
                  {
                    key: 'variables',
                    label: hasNodeVars ? 'Variables (Flow Node)' : 'Variables (Process)',
                    children: (
                      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 8 }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: 6
                        }}>
                          <Breadcrumb
                            style={{ fontSize: 11 }}
                            items={[{ title: <span style={{ color: '#8c8c8c' }}>root</span>, onClick: () => setVarPath([]) }, ...varPath.map((seg, i) => ({
                              title: String(seg),
                              onClick: () => setVarPath(varPath.slice(0, i + 1))
                            }))]}
                          />
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                            {varPath.length > 0 && (
                              <Tooltip title="Up">
                                <Button
                                  size="small"
                                  type="text"
                                  aria-label="Up"
                                  icon={<UpOutlined style={{ fontSize: 11 }} />}
                                  onClick={() => setVarPath(varPath.slice(0, -1))}
                                  style={{ padding: 3 }}
                                />
                              </Tooltip>
                            )}
                            <Tooltip title="JSON">
                              <Button
                                size="small"
                                type="text"
                                aria-label="View JSON"
                                icon={<CodeOutlined style={{ fontSize: 11 }} />}
                                onClick={() => setShowJsonModal(true)}
                                style={{ padding: 3 }}
                              />
                            </Tooltip>
                          </div>
                        </div>
                        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                          {variablesLoading ? (
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 40 }}>
                              <Spin />
                            </div>
                          ) : (
                            <Table
                              className={`compactTable ${varsAnimClass}`}
                              size="small"
                              rowKey="key"
                              columns={variableColumns}
                              dataSource={variableRows}
                              pagination={false}
                              onRow={(record) => ({
                                onClick: () => {
                                  if (record.isComposite) setVarPath([...varPath, record.pathKey]);
                                },
                                style: { cursor: record.isComposite ? 'pointer' : 'default' }
                              })}
                            />
                          )}
                        </div>
                      </div>
                    ),
                  },
                ]}
                style={{ height: '100%' }}
                tabBarStyle={{ paddingInline: 8, marginBottom: 0 }}
              />
              <Modal
                open={showJsonModal}
                title={selectedFlowNodeInstanceKey ? 'Variables JSON (Flow Node Scope)' : 'Variables JSON (Process Scope)'}
                onCancel={() => setShowJsonModal(false)}
                footer={null}
                width={720}
                styles={{ body: { paddingTop: 8 } }}
              >
                <pre
                  style={{ maxHeight: 480, overflow: 'auto', background: '#0d1117', color: '#e6edf3', padding: 12, borderRadius: 6, fontSize: 12, lineHeight: '18px' }}
                  dangerouslySetInnerHTML={{ __html: syntaxHighlight(rootVarsJson) }}
                />
                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <Button icon={<DownloadOutlined />} onClick={downloadJson}>Download</Button>
                  <Button onClick={() => { try { navigator.clipboard.writeText(rootVarsJson); message.success('Copied'); } catch {} }}>Copy</Button>
                  <Button type="primary" onClick={() => setShowJsonModal(false)}>Close</Button>
                </div>
              </Modal>
            </Card>
          }
        />
      </div>
    </div>
  );
}
