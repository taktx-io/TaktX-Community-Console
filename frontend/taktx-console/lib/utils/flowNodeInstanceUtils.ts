/**
 * Flow Node Instance Utilities
 *
 * Helper functions for working with flow node instance data
 */

import type { TimedFlowNodeInstance } from '@/lib/api/processInstanceApi';

/**
 * Filter flow node instances by element ID and sort by timestamp descending (newest first)
 */
export function filterFlowNodeInstancesByElementId(
  instances: TimedFlowNodeInstance[],
  elementId: string
): TimedFlowNodeInstance[] {
  if (!instances || !elementId) {
    return [];
  }

  return instances
    .filter(instance => instance.elementId === elementId)
    .sort((a, b) => {
      const timeA = typeof a.timestamp === 'number' ? a.timestamp : new Date(a.timestamp).getTime();
      const timeB = typeof b.timestamp === 'number' ? b.timestamp : new Date(b.timestamp).getTime();
      return timeB - timeA; // Descending order (newest first)
    });
}

/**
 * Check if a BPMN element type is a flow node (has instance data)
 */
export function isFlowNodeType(elementType: string): boolean {
  const flowNodeTypes = [
    'bpmn:Task',
    'bpmn:ServiceTask',
    'bpmn:UserTask',
    'bpmn:ScriptTask',
    'bpmn:SendTask',
    'bpmn:ReceiveTask',
    'bpmn:ManualTask',
    'bpmn:BusinessRuleTask',
    'bpmn:CallActivity',
    'bpmn:SubProcess',
    'bpmn:StartEvent',
    'bpmn:EndEvent',
    'bpmn:IntermediateCatchEvent',
    'bpmn:IntermediateThrowEvent',
    'bpmn:BoundaryEvent',
    'bpmn:ExclusiveGateway',
    'bpmn:ParallelGateway',
    'bpmn:InclusiveGateway',
    'bpmn:EventBasedGateway',
    'bpmn:ComplexGateway',
  ];

  return flowNodeTypes.includes(elementType);
}

/**
 * Format timestamp for display with milliseconds
 */
export function formatTimestampWithMs(timestamp: number | string | undefined): string {
  if (!timestamp) return '—';

  const date = typeof timestamp === 'number' ? new Date(timestamp) : new Date(String(timestamp));
  if (Number.isNaN(date.getTime())) return '—';

  const dateStr = date.toLocaleString();
  const ms = date.getMilliseconds().toString().padStart(3, '0');
  return `${dateStr}.${ms}`;
}

/**
 * Generate a unique key for a flow node instance
 * Uses flowNodeInstancePath as the primary identifier (unique per instance in hierarchy)
 * Falls back to elementInstanceId, then timestamp if path is unavailable
 */
export function generateFlowNodeInstanceKey(
  instance: TimedFlowNodeInstance
): string {
  const innerUpdate = instance.flowNodeInstanceUpdate || {};
  const innerInstance = innerUpdate.flowNodeInstance || {};

  // Primary: use flowNodeInstancePath for unique hierarchical identification
  const flowNodeInstancePath = (innerUpdate as any).flowNodeInstancePath;
  if (Array.isArray(flowNodeInstancePath) && flowNodeInstancePath.length > 0) {
    return `path-${flowNodeInstancePath.map(String).join('/')}`;
  }

  // Fallback 1: use elementInstanceId
  const elementInstanceId = innerInstance.elementInstanceId;
  if (elementInstanceId != null) {
    return `path-${elementInstanceId}`;
  }

  // Fallback 2: use timestamp-based key
  const elementId = (instance as any).elementId ?? innerInstance.elementId;
  const rawTs = instance.timestamp;
  const timestamp = typeof rawTs === 'number' ? rawTs : new Date(String(rawTs)).getTime();
  return `ts-${elementId}-${timestamp}`;
}

/**
 * Find a flow node instance by its unique key
 * Searches through all instances to find the one with matching key
 */
export function findInstanceByKey(
  key: string | null,
  instances: TimedFlowNodeInstance[]
): TimedFlowNodeInstance | null {
  if (!key || !instances.length) return null;

  // Search for instance with matching key
  for (const instance of instances) {
    const generatedKey = generateFlowNodeInstanceKey(instance);

    if (generatedKey === key) {
      return instance;
    }
  }

  return null;
}

/**
 * Get the first instance for a given element ID
 */
export function getFirstInstanceForElement(
  elementId: string,
  instances: TimedFlowNodeInstance[]
): TimedFlowNodeInstance | null {
  return instances.find(inst => inst.elementId === elementId) || null;
}

