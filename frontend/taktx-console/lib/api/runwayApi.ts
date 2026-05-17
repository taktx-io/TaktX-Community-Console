import { authFetch } from '../authFetch';
import type { ProcessInstanceFilters } from '@/lib/types/filters';
import { PLATFORM_SERVICE_URL } from '../config/env';

/**
 * Runway API - Process Definitions and Instances
 *
 * Phase 3: BFF Architecture Implementation
 * All requests go through Platform Service (port 8080) which acts as a BFF.
 * Platform Service handles request routing to the community backend endpoints.
 *
 * Community mode uses a single backend scope.
 */

export interface ProcessDefinition {
  id: string;
  version: number;
  bpmnXml: string;
}

export interface ProcessDefinitionVersionInfo {
  version: number;
  versionTag: string | null;
}

export interface ProcessInstanceRow {
  processInstanceId: string;
  processDefinitionId: string;
  version: number;
  startTime: string | null;
  endTime: string | null;
  state: string | null;
  parentProcessInstanceId?: string | null;
  /** Immutable after process start. Null if not provided. */
  businessKey?: string | null;
  /** Immutable after process start. Empty array if not provided. */
  tags?: string[] | null;
}

export interface ProcessInstancePage {
  items: ProcessInstanceRow[];
  total: number;
}

export interface StartProcessInstanceRequest {
  variables: Record<string, any>;
  businessKey?: string | null;
  tags?: string[];
}

/**
 * Fetch all process definition IDs
 * GET /api/runway/processdefinitions
 *
 * Routes through Platform Service BFF which proxies to the correct ingester.
 */
export async function getProcessDefinitionIds(
): Promise<string[]> {
  const url = `${PLATFORM_SERVICE_URL}/api/runway/processdefinitions`;
  const response = await authFetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch process definition IDs: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch all versions for a specific process definition ID
 * GET /api/runway/processdefinitions/{id}/versions
 * Returns version information including version tags
 *
 * Routes through Platform Service BFF.
 */
export async function getProcessDefinitionVersions(
  processDefinitionId: string
): Promise<ProcessDefinitionVersionInfo[]> {
  const url = `${PLATFORM_SERVICE_URL}/api/runway/processdefinitions/${processDefinitionId}/versions`;
  const response = await authFetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch process definition versions: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch BPMN XML for a specific process definition version
 * GET /api/runway/processdefinitions/{id}/version/{version}/xml
 *
 * Routes through Platform Service BFF.
 */
export async function getProcessDefinitionXml(
  processDefinitionId: string,
  version: number
): Promise<string> {
  const url = `${PLATFORM_SERVICE_URL}/api/runway/processdefinitions/${processDefinitionId}/version/${version}/xml`;
  const response = await authFetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch process definition XML: ${response.statusText}`);
  }

  return response.text();
}

/**
 * Fetch process instances for a definition/version with sorting and pagination (paged response)
 * GET /api/runway/processinstances/{processDefinitionId}/{version}?...
 *
 * Routes through Platform Service BFF.
 */
export async function getProcessInstancesPage(
  processDefinitionId: string,
  version: number,
  params?: { start?: number; limit?: number; orderBy?: string; orderDirection?: 'ASC' | 'DESC' }
): Promise<ProcessInstancePage> {
  const q = new URLSearchParams();
  if (params?.start != null) q.set('start', String(params.start));
  if (params?.limit != null) q.set('limit', String(params.limit));
  if (params?.orderBy) q.set('orderBy', params.orderBy);
  if (params?.orderDirection) q.set('orderDirection', params.orderDirection);
  const qs = q.toString();

  const url = `${PLATFORM_SERVICE_URL}/api/runway/processinstances/${processDefinitionId}/${version}?${qs}`;
  const response = await authFetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch process instances: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch process instances with optional filters (supports partial or no filtering)
 * GET /api/runway/processinstances?...
 * This is the new generic function that supports:
 * - All instances (no filters)
 * - Instances for a specific definition (all versions)
 * - Instances for a specific definition and version
 *
 * Routes through Platform Service BFF.
 */
export async function getProcessInstancesPageWithFilters(
  filters: ProcessInstanceFilters,
  params?: { start?: number; limit?: number; orderBy?: string; orderDirection?: 'ASC' | 'DESC' }
): Promise<ProcessInstancePage> {
  const q = new URLSearchParams();

  // Add filter parameters
  if (filters.processDefinitionId) {
    q.set('processDefinitionId', filters.processDefinitionId);
  }
  if (filters.version != null) {
    q.set('version', String(filters.version));
  }

  // Add state filters - send each state as a separate parameter
  if (filters.states && filters.states.length > 0) {
    filters.states.forEach(state => {
      q.append('states', state);
    });
  }

  // Add process instance IDs filter - send each ID as a separate parameter
  if (filters.processInstanceIds && filters.processInstanceIds.length > 0) {
    filters.processInstanceIds.forEach(id => {
      q.append('processInstanceIds', id);
    });
  }

  // Add date range filters (ISO-8601 format)
  if (filters.startTimeFrom) {
    q.set('startTimeFrom', filters.startTimeFrom.toISOString());
  }
  if (filters.startTimeTo) {
    q.set('startTimeTo', filters.startTimeTo.toISOString());
  }
  if (filters.endTimeFrom) {
    q.set('endTimeFrom', filters.endTimeFrom.toISOString());
  }
  if (filters.endTimeTo) {
    q.set('endTimeTo', filters.endTimeTo.toISOString());
  }

  if (filters.businessKey) {
    q.set('businessKey', filters.businessKey);
  }

  if (filters.tag) {
    q.set('tag', filters.tag);
  }

  // Add pagination and sorting parameters
  if (params?.start != null) q.set('start', String(params.start));
  if (params?.limit != null) q.set('limit', String(params.limit));
  if (params?.orderBy) q.set('orderBy', params.orderBy);
  if (params?.orderDirection) q.set('orderDirection', params.orderDirection);

  const qs = q.toString();
  const url = `${PLATFORM_SERVICE_URL}/api/runway/processinstances?${qs}`;
  const response = await authFetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch process instances with filters: ${response.statusText}`);
  }

  return response.json();
}

// Deprecated: older function returning array only (kept for compatibility)
export async function getProcessInstances(
  processDefinitionId: string,
  version: number,
  params?: { start?: number; limit?: number; orderBy?: string; orderDirection?: 'ASC' | 'DESC' }
): Promise<ProcessInstanceRow[]> {
  const page = await getProcessInstancesPage(processDefinitionId, version, params);
  return page.items;
}

/**
 * Fetch DMN XML for a given DMN definition ID (latest version).
 * GET /api/runway/dmn/{dmnDefinitionId}/xml
 *
 * Routes through Platform Service BFF.
 */
export async function getDmnDefinitionXml(dmnDefinitionId: string): Promise<string> {
  const url = `${PLATFORM_SERVICE_URL}/api/runway/dmn/${encodeURIComponent(dmnDefinitionId)}/xml`;
  const response = await authFetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch DMN XML for '${dmnDefinitionId}': ${response.statusText}`);
  }

  return response.text();
}

/**
 * Start process instance(s) for a specific version of a process definition
 * POST /api/runway/processdefinitions/{id}/version/{version}/start
 * Accepts an array of per-instance start requests.
 *
 * Routes through Platform Service BFF.
 * Platform Service proxies the start command to the backend runtime.
 */
export async function startProcessInstanceVersion(
  processDefinitionId: string,
  version: number,
  startRequests: StartProcessInstanceRequest[]
): Promise<string[]> {
  const url = `${PLATFORM_SERVICE_URL}/api/runway/processdefinitions/${processDefinitionId}/version/${version}/start`;

  const response = await authFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(startRequests),
    credentials: 'include', // Send cookies (session)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to start process instance: ${response.status} ${errorText}`);
  }

  return response.json();
}

