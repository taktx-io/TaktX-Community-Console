/**
 * API functions for process instance details
 *
 * Phase 3: BFF Architecture
 * All requests now route through Platform Service (port 8080).
 * Platform Service handles authentication, authorization, and proxying.
 */

import { authFetch } from '../authFetch';
import { PLATFORM_SERVICE_URL } from '../config/env';

const BACKEND_URL = PLATFORM_SERVICE_URL;

export interface ProcessInstance {
  processInstanceId: string;
  processDefinitionId: string;
  version: number;
  startTime: string;
  endTime?: string;
  state: string;
  parentProcessInstanceId?: string | null;
  incidentInfo?: any;
}

export interface CommandTrustMetadata {
  authMethod?: 'JWT' | 'ED25519' | 'JWT_AND_ED25519' | 'NONE' | string | null;
  verificationResult?:
    | 'JWT_AUTHORIZED'
    | 'SIGNATURE_VERIFIED'
    | 'AUTHORIZATION_DISABLED'
    | 'LICENSE_BYPASSED'
    | string
    | null;
  trusted?: boolean | null;
  userId?: string | null;
  issuer?: string | null;
  signerKeyId?: string | null;
  signerOwner?: string | null;
  signerAlgorithm?: string | null;
}

export interface FlowNodeInstanceUpdatePayload {
  flowNodeInstance: FlowNodeInstance;
  currentTrustMetadata?: CommandTrustMetadata | null;
  originTrustMetadata?: CommandTrustMetadata | null;
  commandTrustMetadata?: CommandTrustMetadata | null;
  [key: string]: any;
}

export interface TimedFlowNodeUpdate {
  timestamp: number | string;
  flowNodeInstanceUpdate: FlowNodeInstanceUpdatePayload;
}

export interface FlowNodeInstance {
  elementInstanceId: number;
  parentElementInstanceId: number;
  elementIndex: number;
  elementId: string;
  state: string | { name?: string | null } | null;
  passedCnt: number;
}

export interface TimedFlowNodeInstance {
  timestamp: number | string; // epoch millis or ISO string from backend
  flowNodeInstanceUpdate: FlowNodeInstanceUpdatePayload;
  elementId?: string | null;
  elementName?: string | null;
  elementType?: string | null;
  mergedVariables?: Record<string, any> | null; // Accumulated variables from all updates
  updateHistory?: TimedFlowNodeUpdate[] | null;
}

export interface FlowNodeInstancePage {
  items: TimedFlowNodeInstance[];
  total: number;
  start: number;
  limit: number;
}

/**
 * Get single process instance details
 * GET /api/runway/processinstances/{id}
 */
export async function getProcessInstance(
  processInstanceId: string
): Promise<ProcessInstance> {
  const res = await authFetch(
    `${BACKEND_URL}/api/runway/processinstances/${processInstanceId}`,
    { cache: 'no-store', credentials: 'include' }
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch process instance: ${res.status}`);
  }

  return res.json();
}

/**
 * Get flow node instances for a process instance (all deduplicated instances, no pagination)
 * GET /api/runway/processinstances/{id}/flownodes
 */
export async function getFlowNodeInstances(
  processInstanceId: string
): Promise<TimedFlowNodeInstance[]> {
  const res = await authFetch(
    `${BACKEND_URL}/api/runway/processinstances/${processInstanceId}/flownodes`,
    { cache: 'no-store' }
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch flow node instances: ${res.status}`);
  }

  return res.json();
}

/**
 * Get process variables
 * GET /api/runway/processinstances/{id}/variables
 */
export async function getProcessVariables(
  processInstanceId: string
): Promise<Record<string, any>> {
  const res = await authFetch(
    `${BACKEND_URL}/api/runway/processinstances/${processInstanceId}/variables`,
    { cache: 'no-store' }
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch process variables: ${res.status}`);
  }

  return res.json();
}

// ============================================================================
// Cancel Process Instances
// ============================================================================

export interface CancelInstancesRequest {
  processInstanceIds: string[];
}

export interface CancelFailure {
  instanceId: string;
  reason: string;
}

export interface CancelInstancesResponse {
  succeededCount: number;
  skippedCount: number;
  failedCount: number;
  succeededIds: string[];
  skippedIds: string[];
  failures: CancelFailure[];
}

/**
 * Cancel (abort) a single process instance
 * POST /api/runway/processinstances/{id}/cancel
 *
 * Routes through Platform Service BFF which handles authorization.
 * Returns status "cancel_sent" on success, or "skipped" if the instance
 * was no longer ACTIVE at the time of the call (a normal race condition).
 */
export async function cancelProcessInstance(
  instanceId: string
): Promise<{instanceId: string; status: string; currentState?: string; message: string}> {
  const response = await authFetch(
    `${BACKEND_URL}/api/runway/processinstances/${instanceId}/cancel`,
    {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      credentials: 'include',
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to cancel instance: ${response.statusText}${errorText ? ` - ${errorText}` : ''}`);
  }

  return response.json();
}

/**
 * Cancel (abort) multiple process instances
 * NOTE: This function cancels instances one-by-one using the BFF endpoint.
 * Instances that are no longer ACTIVE are counted as skipped, not failed.
 */
export async function cancelProcessInstances(
  instanceIds: string[]
): Promise<CancelInstancesResponse> {
  const succeededIds: string[] = [];
  const skippedIds: string[] = [];
  const failures: CancelFailure[] = [];

  // Cancel each instance individually through the BFF
  for (const instanceId of instanceIds) {
    try {
      const result = await cancelProcessInstance(instanceId);
      if (result.status === 'skipped') {
        skippedIds.push(instanceId);
      } else {
        succeededIds.push(instanceId);
      }
    } catch (error) {
      failures.push({
        instanceId,
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return {
    succeededCount: succeededIds.length,
    skippedCount: skippedIds.length,
    failedCount: failures.length,
    succeededIds,
    skippedIds,
    failures,
  };
}

// ============================================================================
// Verify Instance States
// ============================================================================

export interface InstanceStateInfo {
  instanceId: string;
  state: string;
  timestamp: number;
}

export interface VerifyInstancesResponse {
  states: InstanceStateInfo[];
}

/**
 * Verify current states of process instances
 * POST /api/runway/processinstances/verify
 */
export async function verifyInstanceStates(
  instanceIds: string[]
): Promise<VerifyInstancesResponse> {
  const response = await authFetch(
    `${BACKEND_URL}/api/runway/processinstances/verify`,
    {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({instanceIds})
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to verify instance states: ${response.statusText}`);
  }

  return response.json();
}
