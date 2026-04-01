'use client';

import { useState, useEffect } from 'react';
import { Badge, Button, Empty, Space, Progress, Card, Typography, Tag, Tooltip, Collapse, App } from 'antd';
import {
  UnorderedListOutlined,
  DeleteOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  LeftOutlined,
  RightOutlined,
} from '@ant-design/icons';
import {
  loadJobs,
  getActiveJobCount,
  clearCompletedJobs,
  deleteJob,
  type Job,
  type CancelJobData,
  type CancelByFilterJobData,
} from '@/lib/utils/jobStorage';

const { Text } = Typography;

interface JobsPanelProps {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onJobUpdate?: () => void;
}

export default function JobsPanel({ collapsed, onCollapsedChange, onJobUpdate }: JobsPanelProps) {
  const { message } = App.useApp();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [totalCompletedCount, setTotalCompletedCount] = useState(0);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Event-driven job updates - no polling needed!
  // Jobs are updated via WebSocket in ProcessInstanceTable, we just listen for changes
  useEffect(() => {
    if (collapsed) return;

    // Initial load
    refreshJobs();

    // Listen for storage changes (cross-tab updates)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'taktx-jobs' || e.key === null) {
        refreshJobs();
      }
    };

    // Listen for custom events from ProcessInstanceTable
    const handleJobUpdate = () => {
      refreshJobs();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('taktx-job-updated', handleJobUpdate);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('taktx-job-updated', handleJobUpdate);
    };
  }, [collapsed, refreshTrigger]);

  const refreshJobs = () => {
    const allJobs = loadJobs();

    // Separate active and completed jobs
    const activeJobs = allJobs.filter(j => j.status !== 'completed' && j.status !== 'failed');
    const completedJobs = allJobs.filter(j => j.status === 'completed' || j.status === 'failed');

    // Track total completed count
    setTotalCompletedCount(completedJobs.length);

    // Show all active jobs + only the 10 most recent completed jobs
    const recentCompletedJobs = completedJobs.slice(0, 10);

    setJobs([...activeJobs, ...recentCompletedJobs]);
  };

  const handleClearCompleted = () => {
    clearCompletedJobs();
    refreshJobs();
    onJobUpdate?.();
    message.success('Cleared completed jobs');
  };

  const handleDeleteJob = (id: string) => {
    deleteJob(id);
    refreshJobs();
    onJobUpdate?.();
    message.success('Job deleted');
  };

  const activeCount = getActiveJobCount();
  const completedJobs = jobs.filter(j => j.status === 'completed' || j.status === 'failed');

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircleOutlined style={{ color: 'green', fontSize: 18 }} />;
      case 'failed':
        return <CloseCircleOutlined style={{ color: 'red', fontSize: 18 }} />;
      default:
        return <LoadingOutlined style={{ color: '#1890ff', fontSize: 18 }} />;
    }
  };

  const getStatusTag = (status: string) => {
    const tagConfig: Record<string, { color: string; text: string }> = {
      'pending': { color: 'default', text: 'Pending' },
      'running': { color: 'processing', text: 'Running' },
      'completed': { color: 'success', text: 'Completed' },
      'failed': { color: 'error', text: 'Failed' },
    };
    const config = tagConfig[status] || tagConfig['pending'];
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  const renderCancelJobDetails = (job: Job) => {
    if (job.type !== 'cancel-instances' || !job.data) return null;

    const data = job.data as CancelJobData;

    return (
      <div style={{ marginTop: 12, fontSize: 12 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {data.abortedCount > 0 && (
            <Text type="success">✓ Aborted: {data.abortedCount}</Text>
          )}
          {data.stillActiveCount > 0 && (
            <Text type="warning">○ Still Active: {data.stillActiveCount}</Text>
          )}
          {data.completedCount > 0 && (
            <Text>✓ Completed: {data.completedCount}</Text>
          )}
          {data.notFoundCount > 0 && (
            <Text type="secondary">⊘ Not Found: {data.notFoundCount}</Text>
          )}
          {data.commandsSkipped > 0 && (
            <Text type="secondary">↷ Skipped (not active): {data.commandsSkipped}</Text>
          )}
          {data.commandsFailed > 0 && (
            <Text type="danger">✗ Failed: {data.commandsFailed}</Text>
          )}
        </div>

        {data.failedCommands && data.failedCommands.length > 0 && (
          <Collapse
            size="small"
            style={{ marginTop: 8 }}
            items={[
              {
                key: '1',
                label: `Failed Commands (${data.failedCommands.length})`,
                children: (
                  <div>
                    {data.failedCommands.map((failure, idx) => (
                      <div key={idx} style={{ fontSize: 11, marginBottom: 4 }}>
                        <Text code style={{ fontSize: 10 }}>
                          {failure.instanceId.substring(0, 8)}...
                        </Text>: {failure.reason}
                      </div>
                    ))}
                  </div>
                )
              }
            ]}
          />
        )}
      </div>
    );
  };

  const renderCancelByFilterJobDetails = (job: Job) => {
    if (job.type !== 'cancel-by-filter' || !job.data) return null;

    const data = job.data as CancelByFilterJobData;

    return (
      <div style={{ marginTop: 12, fontSize: 12 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {data.succeededCount > 0 && (
            <Text type="success">✓ Cancelled: {data.succeededCount}</Text>
          )}
          {data.skippedCount > 0 && (
            <Text>⊘ Skipped: {data.skippedCount}</Text>
          )}
          {data.failedCount > 0 && (
            <Text type="danger">✗ Failed: {data.failedCount}</Text>
          )}
        </div>

        {/* Show throughput and ETA if available */}
        {data.throughputPerSecond && data.estimatedCompletionTime && job.status === 'running' && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#666' }}>
            Processing: {Math.round(data.throughputPerSecond)}/sec
            {data.estimatedCompletionTime > Date.now() && (
              <> • ETA: {Math.round((data.estimatedCompletionTime - Date.now()) / 1000)}s</>
            )}
          </div>
        )}

        {/* Show filter summary */}
        {data.filter && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#888', fontStyle: 'italic' }}>
            Filter-based operation (no IDs stored)
          </div>
        )}

        {/* Show failures if any */}
        {data.failures && data.failures.length > 0 && (
          <Collapse
            size="small"
            style={{ marginTop: 8 }}
            items={[
              {
                key: '1',
                label: `Failed Instances (${data.failures.length})`,
                children: (
                  <div>
                    {data.failures.map((failure, idx) => (
                      <div key={idx} style={{ fontSize: 11, marginBottom: 4 }}>
                        <Text code style={{ fontSize: 10 }}>
                          {failure.instanceId.substring(0, 8)}...
                        </Text>: {failure.reason}
                      </div>
                    ))}
                  </div>
                )
              }
            ]}
          />
        )}

        {/* Show sample of succeeded IDs for verification */}
        {data.succeededSample && data.succeededSample.length > 0 && job.status === 'completed' && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#666' }}>
            Sample: {data.succeededSample.slice(0, 3).map(id => id.substring(0, 8)).join(', ')}...
          </div>
        )}
      </div>
    );
  };

  const renderJobCard = (job: Job) => {
    const isActive = job.status !== 'completed' && job.status !== 'failed';
    const progressPercent = job.totalItems > 0
      ? Math.round((job.processedItems / job.totalItems) * 100)
      : 0;

    return (
      <Card
        key={job.id}
        size="small"
        style={{
          borderLeft: `4px solid ${isActive ? '#1890ff' : job.status === 'completed' ? 'green' : 'red'}`,
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              {getStatusIcon(job.status)}
              <Text strong style={{ fontSize: 14 }}>{job.title}</Text>
              {getStatusTag(job.status)}
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>{job.description}</Text>

            {isActive && (
              <div style={{ marginTop: 8 }}>
                <Progress
                  percent={progressPercent}
                  size="small"
                  status={job.status === 'failed' ? 'exception' : 'active'}
                />
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {job.processedItems} / {job.totalItems}
                </Text>
              </div>
            )}

            {renderCancelJobDetails(job)}
            {renderCancelByFilterJobDetails(job)}

            {job.error && (
              <div style={{ marginTop: 8, padding: 8, background: '#fff2f0', borderRadius: 4 }}>
                <Text type="danger" style={{ fontSize: 11 }}>{job.error}</Text>
              </div>
            )}

            {job.warnings && job.warnings.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {job.warnings.map((warning, idx) => (
                  <div key={idx} style={{ fontSize: 11, color: '#fa8c16' }}>
                    ⚠ {warning}
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 8, fontSize: 11, color: '#999' }}>
              Created: {new Date(job.createdAt).toLocaleString()}
              {job.completedAt && (
                <span> • Completed: {new Date(job.completedAt).toLocaleString()}</span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
            {!isActive && (
              <Tooltip title="Delete Job">
                <Button
                  type="text"
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={() => handleDeleteJob(job.id)}
                />
              </Tooltip>
            )}
          </div>
        </div>
      </Card>
    );
  };

  return (
    <Card style={{ height: '100%', display: 'flex', flexDirection: 'column' }} styles={{ body: { padding: 0, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' } }}>
      {/* Collapse/Expand Header Bar - matches FilterPanel style */}
      <div
        style={{
          padding: '8px',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          background: '#fafafa',
        }}
        onClick={() => onCollapsedChange(!collapsed)}
      >
        <Space size="small">
          <UnorderedListOutlined style={{ fontSize: 16 }} />
          {!collapsed && <span style={{ fontWeight: 500 }}>Jobs</span>}
          {!collapsed && activeCount > 0 && <Badge count={activeCount} />}
        </Space>
        {collapsed ? <LeftOutlined style={{ fontSize: 12 }} /> : <RightOutlined style={{ fontSize: 12 }} />}
      </div>

      {/* Jobs Content */}
      {!collapsed && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* Action Buttons */}
          <div style={{ padding: '8px 16px', borderBottom: '1px solid #f0f0f0' }}>
            <Space size="small">
              <Tooltip title="Refresh">
                <Button
                  size="small"
                  icon={<ReloadOutlined />}
                  onClick={() => setRefreshTrigger(prev => prev + 1)}
                />
              </Tooltip>
              {completedJobs.length > 0 && (
                <Tooltip title="Clear completed jobs">
                  <Button
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={handleClearCompleted}
                  />
                </Tooltip>
              )}
            </Space>
          </div>

          {/* Job List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            {jobs.length === 0 ? (
              <Empty description="No jobs" style={{ marginTop: 60 }} />
            ) : (
              <>
                {totalCompletedCount > 10 && (
                  <div style={{
                    marginBottom: 12,
                    padding: '8px 12px',
                    background: '#f0f5ff',
                    borderRadius: 4,
                    fontSize: 12,
                    color: '#666'
                  }}>
                    Showing 10 most recent completed jobs. {totalCompletedCount - 10} older job{totalCompletedCount - 10 !== 1 ? 's' : ''} hidden.
                    <Button
                      type="link"
                      size="small"
                      style={{ padding: '0 4px', height: 'auto' }}
                      onClick={handleClearCompleted}
                    >
                      Clear all
                    </Button>
                  </div>
                )}
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                  {jobs.map(job => renderJobCard(job))}
                </Space>
              </>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

