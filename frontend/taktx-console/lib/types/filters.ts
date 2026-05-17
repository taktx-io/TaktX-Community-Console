/**
 * Generic filter types for process instances
 */

/**
 * Process instance execution states (from backend ExecutionState enum)
 * Note: INCIDENT is a special state that represents instances with active incidents
 */
export const EXECUTION_STATES = {
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  ABORTED: 'ABORTED',
  INCIDENT: 'INCIDENT',
} as const;

export type ExecutionState = typeof EXECUTION_STATES[keyof typeof EXECUTION_STATES];

export interface ProcessInstanceFilters {
  /** Filter by process definition ID (optional) */
  processDefinitionId?: string | null;
  /** Filter by version (optional, requires processDefinitionId) */
  version?: number | null;
  /** Filter by execution states - can select multiple (optional) */
  states?: string[];
  /** Filter by specific process instance IDs (optional, takes precedence over other filters) */
  processInstanceIds?: string[];
  /** Filter by start time range - from date (inclusive, optional) */
  startTimeFrom?: Date | null;
  /** Filter by start time range - to date (exclusive, optional) */
  startTimeTo?: Date | null;
  /** Filter by end time range - from date (inclusive, optional) */
  endTimeFrom?: Date | null;
  /** Filter by end time range - to date (exclusive, optional) */
  endTimeTo?: Date | null;
  /** Filter by exact business key (community: exact match only, no wildcard) */
  businessKey?: string | null;
  /** Filter by a single tag (community: exact match, one tag at a time) */
  tag?: string | null;
}

/**
 * Check if filters are empty (no filtering applied)
 */
export function areFiltersEmpty(filters: ProcessInstanceFilters): boolean {
  return !filters.processDefinitionId
    && filters.version == null
    && !filters.startTimeFrom
    && !filters.startTimeTo
    && !filters.endTimeFrom
    && !filters.endTimeTo
    && !filters.businessKey
    && !filters.tag;
}

/**
 * Check if filters have process definition but no version
 */
export function hasPartialFilters(filters: ProcessInstanceFilters): boolean {
  return !!filters.processDefinitionId && filters.version == null;
}

/**
 * Check if filters are complete (both definition and version)
 */
export function hasCompleteFilters(filters: ProcessInstanceFilters): boolean {
  return !!filters.processDefinitionId && filters.version != null;
}

/**
 * Create URL query parameters from filters
 */
export function filtersToQueryParams(filters: ProcessInstanceFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.processDefinitionId) {
    params.set('processDefinitionId', filters.processDefinitionId);
  }

  if (filters.version != null) {
    params.set('version', String(filters.version));
  }

  if (filters.states && filters.states.length > 0) {
    params.set('states', filters.states.join(','));
  }

  if (filters.startTimeFrom) {
    params.set('startTimeFrom', filters.startTimeFrom.toISOString());
  }

  if (filters.startTimeTo) {
    params.set('startTimeTo', filters.startTimeTo.toISOString());
  }

  if (filters.businessKey) {
    params.set('businessKey', filters.businessKey);
  }

  if (filters.tag) {
    params.set('tag', filters.tag);
  }

  return params;
}

