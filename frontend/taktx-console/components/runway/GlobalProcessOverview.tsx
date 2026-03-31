'use client';

import { useMemo, useState, useEffect } from 'react';
import { Table, Card, Statistic, Empty } from 'antd';
import { getProcessDefinitionVersions, type ProcessDefinitionVersionInfo } from '@/lib/api/runwayApi';
import type { ColumnsType } from 'antd/es/table';
import type { ProcessDefinitionsWithVersionsSummary } from '@/lib/hooks/useBpmnHeatmap';
import type { OverlaySettingsState } from '@/components/runway/OverlaySettings';
import { hexToDarkText } from '@/lib/utils/colorUtils';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';

interface ProcessDefinitionRow {
  key: string;
  processDefinitionId: string;
  version?: number;
  versionTag?: string | null;
  active: number;
  completed: number;
  aborted: number;
  incident: number;
  total: number;
  children?: ProcessDefinitionRow[];
}

export interface FilterSelection {
  definitionId: string | null;
  version: number | null;
  states: string[];
}

interface GlobalProcessOverviewProps {
  globalSummary: ProcessDefinitionsWithVersionsSummary | null;
  processDefinitionIds: string[]; // All available process definitions
  overlaySettings: OverlaySettingsState; // Use configured colors
  onFilterChange?: (selection: FilterSelection) => void; // Updates filter and potentially switches view
}

export default function GlobalProcessOverview({
  globalSummary,
  processDefinitionIds,
  overlaySettings,
  onFilterChange,
}: Readonly<GlobalProcessOverviewProps>) {

  // State to store all version info for each definition (includes version tags)
  const [allVersions, setAllVersions] = useState<Record<string, ProcessDefinitionVersionInfo[]>>({});

  // Fetch all versions for all process definitions
  useEffect(() => {
    const fetchAllVersions = async () => {
      const versionsMap: Record<string, ProcessDefinitionVersionInfo[]> = {};

      for (const defId of processDefinitionIds) {
        try {
          const versionInfos = await getProcessDefinitionVersions(defId);
          versionsMap[defId] = versionInfos; // Already sorted descending from backend
        } catch (error) {
          console.error(`Failed to fetch versions for ${defId}:`, error);
          versionsMap[defId] = [];
        }
      }

      setAllVersions(versionsMap);
    };

    if (processDefinitionIds.length > 0) {
      fetchAllVersions();
    }
  }, [processDefinitionIds]);

  const dataSource = useMemo<ProcessDefinitionRow[]>(() => {
    const versionsData = globalSummary?.definitions || {};

    return processDefinitionIds.map((defId) => {
      const versionCounts = versionsData[defId] || {};
      const availableVersions = allVersions[defId] || [];

      // Only show versions the user is permitted to see (BFF-filtered list).
      // WebSocket counts for non-permitted versions are silently dropped.
      const permittedVersionNumbers = availableVersions.map(v => v.version);

      // Calculate aggregated counts for parent row
      let totalActive = 0;
      let totalCompleted = 0;
      let totalAborted = 0;
      let totalIncident = 0;

      // Create child rows for permitted versions only, sorted descending
      const sortedVersions = [...permittedVersionNumbers].sort((a, b) => b - a);
      const children: ProcessDefinitionRow[] = sortedVersions.map((version) => {
        const states = versionCounts[version] || {};
        const active = states['ACTIVE'] || 0;
        const completed = states['COMPLETED'] || 0;
        const aborted = states['ABORTED'] || 0;
        const incident = states['INCIDENT'] || 0;

        const versionInfo = availableVersions.find(v => v.version === version);
        const versionTag = versionInfo?.versionTag ?? null;

        totalActive += active;
        totalCompleted += completed;
        totalAborted += aborted;
        totalIncident += incident;

        return {
          key: `${defId}-v${version}`,
          processDefinitionId: defId,
          version,
          versionTag,
          active,
          completed,
          aborted,
          incident,
          total: active + completed + aborted,
        };
      });

      return {
        key: defId,
        processDefinitionId: defId,
        active: totalActive,
        completed: totalCompleted,
        aborted: totalAborted,
        incident: totalIncident,
        total: totalActive + totalCompleted + totalAborted,
        children: children.length > 0 ? children : undefined,
      };
    }).sort((a, b) => b.total - a.total);
  }, [processDefinitionIds, globalSummary, allVersions]);

  const totals = useMemo(() => {
    if (dataSource.length === 0) {
      return { active: 0, completed: 0, aborted: 0, incident: 0, total: 0 };
    }
    return dataSource.reduce((acc, row) => ({
      active: acc.active + row.active,
      completed: acc.completed + row.completed,
      aborted: acc.aborted + row.aborted,
      incident: acc.incident + row.incident,
      total: acc.total + row.total,
    }), { active: 0, completed: 0, aborted: 0, incident: 0, total: 0 });
  }, [dataSource]);

  const columns: ColumnsType<ProcessDefinitionRow> = [
    {
      title: 'Process Definition / Version',
      dataIndex: 'processDefinitionId',
      key: 'processDefinitionId',
      width: '35%',
      sorter: (a, b) => {
        // Only sort parent rows, skip children to preserve version ordering
        if (a.version !== undefined || b.version !== undefined) return 0;
        return a.processDefinitionId.localeCompare(b.processDefinitionId);
      },
      render: (text: string, record: ProcessDefinitionRow) => {
        const isParent = record.version === undefined;
        const isClickable = !!onFilterChange;
        const color = isClickable ? '#1890ff' : (isParent ? '#262626' : '#595959');

        return (
          <span
            style={{ fontWeight: isParent ? 600 : 400, color, cursor: isClickable ? 'pointer' : 'default' }}
            onClick={() => {
              if (!onFilterChange) return;
              if (isParent) {
                onFilterChange({ definitionId: text, version: null, states: ['ACTIVE', 'COMPLETED', 'ABORTED', 'INCIDENT'] });
              } else {
                onFilterChange({ definitionId: record.processDefinitionId, version: record.version!, states: ['ACTIVE', 'COMPLETED', 'ABORTED', 'INCIDENT'] });
              }
            }}
          >
            {isParent ? text : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', maxWidth: '100%' }}>
                <span style={{ flexShrink: 0 }}>Version {record.version}</span>
                {record.versionTag && (
                  <span
                    title={record.versionTag}
                    style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      fontSize: '11px',
                      fontWeight: 500,
                      color: '#1890ff',
                      background: '#e6f7ff',
                      border: '1px solid #91d5ff',
                      borderRadius: '10px',
                      maxWidth: '300px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flexShrink: 1,
                    }}>
                    {record.versionTag}
                  </span>
                )}
              </span>
            )}
          </span>
        );
      },
    },
    {
      title: 'Active',
      dataIndex: 'active',
      key: 'active',
      width: '14%',
      align: 'right',
      sorter: (a, b) => {
        if (a.version !== undefined || b.version !== undefined) return 0;
        return a.active - b.active;
      },
      render: (value: number, record: ProcessDefinitionRow) => {
        const isClickable = !!onFilterChange;
        return (
          <span
            style={{ fontWeight: 500, color: hexToDarkText(overlaySettings.incomingColor), cursor: isClickable ? 'pointer' : 'default' }}
            onClick={() => { if (!onFilterChange) return; onFilterChange({ definitionId: record.processDefinitionId, version: record.version ?? null, states: ['ACTIVE'] }); }}
          >{value.toLocaleString()}</span>
        );
      },
    },
    {
      title: 'In Incident',
      dataIndex: 'incident',
      key: 'incident',
      width: '14%',
      align: 'right',
      sorter: (a, b) => {
        if (a.version !== undefined || b.version !== undefined) return 0;
        return a.incident - b.incident;
      },
      render: (value: number, record: ProcessDefinitionRow) => {
        const isClickable = !!onFilterChange;
        return (
          <span
            style={{ fontWeight: 500, color: hexToDarkText(overlaySettings.incidentColor), cursor: isClickable ? 'pointer' : 'default' }}
            onClick={() => { if (!onFilterChange) return; onFilterChange({ definitionId: record.processDefinitionId, version: record.version ?? null, states: ['INCIDENT'] }); }}
          >{value.toLocaleString()}</span>
        );
      },
    },
    {
      title: 'Completed',
      dataIndex: 'completed',
      key: 'completed',
      width: '14%',
      align: 'right',
      sorter: (a, b) => {
        if (a.version !== undefined || b.version !== undefined) return 0;
        return a.completed - b.completed;
      },
      render: (value: number, record: ProcessDefinitionRow) => {
        const isClickable = !!onFilterChange;
        return (
          <span
            style={{ fontWeight: 500, color: hexToDarkText(overlaySettings.outgoingColor), cursor: isClickable ? 'pointer' : 'default' }}
            onClick={() => { if (!onFilterChange) return; onFilterChange({ definitionId: record.processDefinitionId, version: record.version ?? null, states: ['COMPLETED'] }); }}
          >{value.toLocaleString()}</span>
        );
      },
    },
    {
      title: 'Aborted',
      dataIndex: 'aborted',
      key: 'aborted',
      width: '14%',
      align: 'right',
      sorter: (a, b) => {
        if (a.version !== undefined || b.version !== undefined) return 0;
        return a.aborted - b.aborted;
      },
      render: (value: number, record: ProcessDefinitionRow) => {
        const isClickable = !!onFilterChange;
        return (
          <span
            style={{ fontWeight: 500, color: hexToDarkText(overlaySettings.abortedColor), cursor: isClickable ? 'pointer' : 'default' }}
            onClick={() => { if (!onFilterChange) return; onFilterChange({ definitionId: record.processDefinitionId, version: record.version ?? null, states: ['ABORTED'] }); }}
          >{value.toLocaleString()}</span>
        );
      },
    },
    {
      title: 'Total',
      dataIndex: 'total',
      key: 'total',
      width: '14%',
      align: 'right',
      sorter: (a, b) => {
        if (a.version !== undefined || b.version !== undefined) return 0;
        return a.total - b.total;
      },
      defaultSortOrder: 'descend',
      render: (value: number, record: ProcessDefinitionRow) => {
        const isClickable = !!onFilterChange;
        return (
          <span
            style={{ fontWeight: 600, fontSize: 15, cursor: isClickable ? 'pointer' : 'default' }}
            onClick={() => { if (!onFilterChange) return; onFilterChange({ definitionId: record.processDefinitionId, version: record.version ?? null, states: ['ACTIVE', 'COMPLETED', 'ABORTED', 'INCIDENT'] }); }}
          >{value.toLocaleString()}</span>
        );
      },
    },
  ];

  // Show data immediately using process definitions list
  // Even if globalSummary hasn't arrived yet, we can show definitions with 0 counts
  if (processDefinitionIds.length === 0) {
    return (
      <div style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 48
      }}>
        <Empty
          description="Loading process definitions..."
          style={{ fontSize: 16 }}
        />
      </div>
    );
  }

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      padding: '16px 24px',
      overflow: 'auto' // Enable scrolling when content overflows
    }}>
      {/* Statistics Summary Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: 12,
        marginBottom: 24
      }}>
        <Card
          size="small"
          styles={{ body: { padding: '12px 16px', cursor: onFilterChange ? 'pointer' : 'default' } }}
          onClick={() => {
            if (!onFilterChange) return;
            onFilterChange({
              definitionId: null,
              version: null,
              states: ['ACTIVE'],
            });
          }}
        >
          <Statistic
            title="Active"
            value={totals.active}
            valueStyle={{ color: hexToDarkText(overlaySettings.incomingColor), fontWeight: 600 }}
            prefix={<SyncOutlined />}
            formatter={(value) => value.toLocaleString()}
          />
        </Card>
        <Card
          size="small"
          styles={{ body: { padding: '12px 16px', cursor: onFilterChange ? 'pointer' : 'default' } }}
          onClick={() => {
            if (!onFilterChange) return;
            onFilterChange({
              definitionId: null,
              version: null,
              states: ['INCIDENT'],
            });
          }}
        >
          <Statistic
            title="In Incident"
            value={totals.incident}
            valueStyle={{ color: hexToDarkText(overlaySettings.incidentColor), fontWeight: 600 }}
            prefix={<ExclamationCircleOutlined />}
            formatter={(value) => value.toLocaleString()}
          />
        </Card>
        <Card
          size="small"
          styles={{ body: { padding: '12px 16px', cursor: onFilterChange ? 'pointer' : 'default' } }}
          onClick={() => {
            if (!onFilterChange) return;
            onFilterChange({
              definitionId: null,
              version: null,
              states: ['COMPLETED'],
            });
          }}
        >
          <Statistic
            title="Completed"
            value={totals.completed}
            valueStyle={{ color: hexToDarkText(overlaySettings.outgoingColor), fontWeight: 600 }}
            prefix={<CheckCircleOutlined />}
            formatter={(value) => value.toLocaleString()}
          />
        </Card>
        <Card
          size="small"
          styles={{ body: { padding: '12px 16px', cursor: onFilterChange ? 'pointer' : 'default' } }}
          onClick={() => {
            if (!onFilterChange) return;
            onFilterChange({
              definitionId: null,
              version: null,
              states: ['ABORTED'],
            });
          }}
        >
          <Statistic
            title="Aborted"
            value={totals.aborted}
            valueStyle={{ color: hexToDarkText(overlaySettings.abortedColor), fontWeight: 600 }}
            prefix={<CloseCircleOutlined />}
            formatter={(value) => value.toLocaleString()}
          />
        </Card>
        <Card
          size="small"
          styles={{ body: { padding: '12px 16px', cursor: onFilterChange ? 'pointer' : 'default' } }}
          onClick={() => {
            if (!onFilterChange) return;
            onFilterChange({
              definitionId: null,
              version: null,
              states: ['ACTIVE', 'COMPLETED', 'ABORTED', 'INCIDENT'],
            });
          }}
        >
          <Statistic
            title="Total Instances"
            value={totals.total}
            valueStyle={{ color: '#262626', fontWeight: 600 }}
            formatter={(value) => value.toLocaleString()}
          />
        </Card>
      </div>

      {/* Process Definitions Table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <Table<ProcessDefinitionRow>
          columns={columns}
          dataSource={dataSource}
          rowKey="key"
          pagination={false}
          size="middle"
          bordered
          expandable={{
            defaultExpandAllRows: false,
            indentSize: 20,
            childrenColumnName: 'children',
          }}
          locale={{
            emptyText: (
              <Empty
                description="No process definitions found"
                style={{ padding: 48 }}
              />
            )
          }}
          scroll={{ y: 'calc(100vh - 400px)' }}
        />
      </div>

    </div>
  );
}
