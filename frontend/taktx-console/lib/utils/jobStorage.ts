/**
 * Job storage utilities for managing background jobs in localStorage
 * Supports tracking async operations like bulk cancellations
 */

export type JobType = 'cancel-instances' | 'cancel-by-filter';
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface JobInstanceState {
  instanceId: string;
  currentState: string;
  lastChecked: number;
}

export interface CancelJobFailure {
  instanceId: string;
  reason: string;
}

export interface CancelJobData {
  instanceIds: string[];
  commandsSent: number;
  commandsSkipped: number;
  commandsFailed: number;
  skippedIds: string[];
  failedCommands: CancelJobFailure[];
  instanceStates: Record<string, JobInstanceState>;
  abortedCount: number;
  stillActiveCount: number;
  completedCount: number;
  notFoundCount: number;
}

/**
 * Data for filter-based cancel operations (no instance IDs stored)
 * Much more efficient for large batches (1000+ instances)
 */
export interface CancelByFilterJobData {
  // Filter criteria used
  filter: any; // ProcessInstanceFilters type
  filterSnapshot: string; // JSON snapshot for audit trail

  // Aggregate counts (no individual IDs stored!)
  estimatedTotal: number;
  processedCount: number;
  succeededCount: number;
  failedCount: number;
  skippedCount: number; // Already completed/aborted

  // Only store FAILED instance IDs (should be small list)
  failures: Array<{
    instanceId: string;
    reason: string;
    timestamp: number;
  }>;

  // Optional: Sample of first 10 succeeded IDs (for verification)
  succeededSample: string[];

  // Progress tracking
  startedAt: number;
  lastUpdateAt: number;
  estimatedCompletionTime?: number;
  throughputPerSecond?: number; // For time estimates
}

export interface Job {
  id: string;
  type: JobType;
  status: JobStatus;
  title: string;
  description: string;
  totalItems: number;
  processedItems: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  data?: CancelJobData | CancelByFilterJobData | any;
  error?: string;
  warnings?: string[];
}

const STORAGE_KEY = 'taktx-jobs';
const MAX_JOBS = 50;
const JOB_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Dispatch a custom event to notify listeners of job updates
 */
function dispatchJobUpdateEvent(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('taktx-job-updated'));
  }
}

/**
 * Load all jobs from localStorage, removing expired ones
 */
export function loadJobs(): Job[] {
  // Check if we're in the browser (not SSR)
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return [];
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const jobs = JSON.parse(stored) as Job[];

    // Remove expired jobs (older than 24 hours)
    const now = Date.now();
    const validJobs = jobs.filter(job => {
      const age = now - job.createdAt;
      return age < JOB_RETENTION_MS;
    });

    // If we filtered any, save the cleaned list
    if (validJobs.length !== jobs.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(validJobs));
    }

    // Sort by createdAt descending (newest first)
    return validJobs.sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    console.error('Failed to load jobs from localStorage:', error);
    return [];
  }
}

/**
 * Save or update a job
 */
export function saveJob(job: Job): void {
  // Check if we're in the browser (not SSR)
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return;
  }

  try {
    let jobs = loadJobs();

    // Find existing job
    const existingIndex = jobs.findIndex(j => j.id === job.id);

    if (existingIndex >= 0) {
      // Update existing
      jobs[existingIndex] = { ...job, updatedAt: Date.now() };
    } else {
      // Add new job at beginning
      jobs.unshift(job);

      // Enforce max limit
      if (jobs.length > MAX_JOBS) {
        jobs = jobs.slice(0, MAX_JOBS);
      }
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
    dispatchJobUpdateEvent(); // Notify listeners
  } catch (error) {
    console.error('Failed to save job to localStorage:', error);
    throw error;
  }
}

/**
 * Get a specific job by ID
 */
export function getJob(id: string): Job | null {
  const jobs = loadJobs();
  return jobs.find(j => j.id === id) || null;
}

/**
 * Update job status
 */
export function updateJobStatus(id: string, status: JobStatus, data?: Partial<Job>): void {
  const job = getJob(id);
  if (!job) return;

  const updatedJob: Job = {
    ...job,
    status,
    ...data,
    updatedAt: Date.now(),
  };

  if (status === 'completed' || status === 'failed') {
    updatedJob.completedAt = Date.now();
  }

  saveJob(updatedJob);
}

/**
 * Update job progress
 */
export function updateJobProgress(id: string, processedItems: number, data?: any): void {
  const job = getJob(id);
  if (!job) return;

  saveJob({
    ...job,
    processedItems,
    data: data ? { ...job.data, ...data } : job.data,
    updatedAt: Date.now(),
  });
}

/**
 * Add warning to job
 */
export function addJobWarning(id: string, warning: string): void {
  const job = getJob(id);
  if (!job) return;

  saveJob({
    ...job,
    warnings: [...(job.warnings || []), warning],
    updatedAt: Date.now(),
  });
}

/**
 * Delete a job by ID
 */
export function deleteJob(id: string): void {
  // Check if we're in the browser (not SSR)
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return;
  }

  try {
    const jobs = loadJobs();
    const filtered = jobs.filter(j => j.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    dispatchJobUpdateEvent(); // Notify listeners
  } catch (error) {
    console.error('Failed to delete job from localStorage:', error);
    throw error;
  }
}

/**
 * Clear all completed jobs
 */
export function clearCompletedJobs(): void {
  // Check if we're in the browser (not SSR)
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return;
  }

  try {
    const jobs = loadJobs();
    const activeJobs = jobs.filter(j => j.status !== 'completed' && j.status !== 'failed');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(activeJobs));
    dispatchJobUpdateEvent(); // Notify listeners
  } catch (error) {
    console.error('Failed to clear completed jobs from localStorage:', error);
    throw error;
  }
}

/**
 * Clear all jobs
 */
export function clearAllJobs(): void {
  // Check if we're in the browser (not SSR)
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return;
  }

  try {
    localStorage.removeItem(STORAGE_KEY);
    dispatchJobUpdateEvent(); // Notify listeners
  } catch (error) {
    console.error('Failed to clear all jobs from localStorage:', error);
    throw error;
  }
}

/**
 * Get count of active jobs (not completed or failed)
 */
export function getActiveJobCount(): number {
  const jobs = loadJobs();
  return jobs.filter(j => j.status !== 'completed' && j.status !== 'failed').length;
}

/**
 * Create a new cancel instances job
 */
export function createCancelJob(instanceIds: string[]): Job {
  return {
    id: crypto.randomUUID(),
    type: 'cancel-instances',
    status: 'pending',
    title: `Cancel ${instanceIds.length} Process Instance${instanceIds.length !== 1 ? 's' : ''}`,
    description: `Cancelling ${instanceIds.length} active process instance${instanceIds.length !== 1 ? 's' : ''}`,
    totalItems: instanceIds.length,
    processedItems: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    data: {
      instanceIds,
      commandsSent: 0,
      commandsSkipped: 0,
      commandsFailed: 0,
      skippedIds: [],
      failedCommands: [],
      instanceStates: {},
      abortedCount: 0,
      stillActiveCount: 0,
      completedCount: 0,
      notFoundCount: 0,
    } as CancelJobData,
  };
}

/**
 * Create a new filter-based cancel job (efficient for large batches)
 * Stores filter criteria instead of all instance IDs
 */
export function createCancelByFilterJob(
  filter: any,
  estimatedTotal: number,
  filterDescription: string
): Job {
  return {
    id: crypto.randomUUID(),
    type: 'cancel-by-filter',
    status: 'pending',
    title: `Cancel ${estimatedTotal} Process Instances`,
    description: filterDescription || `Cancelling instances matching filter`,
    totalItems: estimatedTotal,
    processedItems: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    data: {
      filter,
      filterSnapshot: JSON.stringify(filter),
      estimatedTotal,
      processedCount: 0,
      succeededCount: 0,
      failedCount: 0,
      skippedCount: 0,
      failures: [],
      succeededSample: [],
      startedAt: Date.now(),
      lastUpdateAt: Date.now(),
    } as CancelByFilterJobData,
  };
}

/**
 * Update progress for filter-based cancel job
 * Much more efficient than tracking individual instance states
 */
export function updateCancelByFilterProgress(
  jobId: string,
  update: {
    processedCount?: number;
    succeededCount?: number;
    failedCount?: number;
    skippedCount?: number;
    failure?: { instanceId: string; reason: string };
    succeededId?: string; // Add to sample
    estimatedCompletionTime?: number;
    throughputPerSecond?: number;
  }
): void {
  const job = getJob(jobId);
  if (!job || job.type !== 'cancel-by-filter') return;

  const data = job.data as CancelByFilterJobData;
  const now = Date.now();

  const updatedData: CancelByFilterJobData = {
    ...data,
    processedCount: update.processedCount ?? data.processedCount,
    succeededCount: update.succeededCount ?? data.succeededCount,
    failedCount: update.failedCount ?? data.failedCount,
    skippedCount: update.skippedCount ?? data.skippedCount,
    lastUpdateAt: now,
    estimatedCompletionTime: update.estimatedCompletionTime,
    throughputPerSecond: update.throughputPerSecond,
  };

  // Add failure (keep all failures - should be small list)
  if (update.failure) {
    updatedData.failures = [
      ...data.failures,
      { ...update.failure, timestamp: now },
    ];
  }

  // Add to succeeded sample (keep first 10 only)
  if (update.succeededId && data.succeededSample.length < 10) {
    updatedData.succeededSample = [...data.succeededSample, update.succeededId];
  }

  saveJob({
    ...job,
    processedItems: updatedData.processedCount,
    data: updatedData,
    updatedAt: now,
  });
}

/**
 * Update instance state in cancel job based on real-time WebSocket state change
 * This replaces polling-based state verification
 */
export function updateInstanceStateInJob(
  jobId: string,
  processInstanceId: string,
  newState: 'ACTIVE' | 'COMPLETED' | 'ABORTED' | 'INITIALIZED'
): boolean {
  const job = getJob(jobId);
  if (!job || job.type !== 'cancel-instances') return false;

  const data = job.data as CancelJobData;

  // Check if this instance is in our tracking list
  if (!data.instanceIds.includes(processInstanceId)) return false;

  // Get old state
  const oldStateInfo = data.instanceStates[processInstanceId];
  const oldState = oldStateInfo?.currentState;

  // If state hasn't changed, skip update
  if (oldState === newState) return false;

  // Update state
  data.instanceStates[processInstanceId] = {
    instanceId: processInstanceId,
    currentState: newState,
    lastChecked: Date.now(),
  };

  // Decrement old state counter
  if (oldState === 'ACTIVE') data.stillActiveCount = Math.max(0, data.stillActiveCount - 1);
  else if (oldState === 'ABORTED') data.abortedCount = Math.max(0, data.abortedCount - 1);
  else if (oldState === 'COMPLETED') data.completedCount = Math.max(0, data.completedCount - 1);

  // Increment new state counter
  if (newState === 'ACTIVE') data.stillActiveCount++;
  else if (newState === 'ABORTED') data.abortedCount++;
  else if (newState === 'COMPLETED') data.completedCount++;

  // Check if job is complete (no more ACTIVE instances)
  if (data.stillActiveCount === 0 && job.status === 'running') {
    updateJobStatus(jobId, 'completed', {
      data,
      completedAt: Date.now(),
    });
  } else {
    saveJob({ ...job, data, updatedAt: Date.now() });
  }

  return true;
}


