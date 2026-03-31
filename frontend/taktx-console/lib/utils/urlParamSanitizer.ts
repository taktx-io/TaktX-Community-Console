/**
 * URL Parameter Sanitization and Validation
 *
 * Provides security-focused validation and sanitization for URL parameters
 * used in shareable links. Prevents XSS, injection attacks, and unauthorized access.
 */

import { EXECUTION_STATES, type ExecutionState } from '@/lib/types/filters';

/**
 * Security validation results
 */
export interface ValidationResult<T> {
  isValid: boolean;
  value: T | null;
  error?: string;
}

/**
 * Sanitized runway parameters
 */
export interface SanitizedRunwayParams {
  definitionId: string | null;
  version: number | null;
  instanceId: string | null;
  states: string[];
}

/**
 * Maximum lengths for various parameters to prevent buffer overflow attacks
 */
const MAX_LENGTHS = {
  DEFINITION_ID: 128,
  INSTANCE_ID: 128,
  STATE: 20,
  STATES_ARRAY: 10,
} as const;

/**
 * Allowed patterns for various parameters
 */
const PATTERNS = {
  // Process definition IDs: alphanumeric, hyphens, underscores
  DEFINITION_ID: /^[a-zA-Z0-9_-]+$/,
  // Instance IDs: alphanumeric, hyphens (UUIDs and similar)
  INSTANCE_ID: /^[a-zA-Z0-9-]+$/,
  // Version: positive integers only
  VERSION: /^\d+$/,
} as const;

/**
 * Sanitize a string by removing potentially dangerous characters
 */
function sanitizeString(input: string | null | undefined): string {
  if (!input) return '';

  // Remove any HTML tags
  let cleaned = input.replaceAll(/<[^>]*>/g, '');

  // Remove any script-related content
  cleaned = cleaned.replaceAll(/javascript:/gi, '');
  cleaned = cleaned.replaceAll(/on\w+\s*=/gi, '');

  // Trim whitespace
  cleaned = cleaned.trim();

  return cleaned;
}

/**
 * Validate and sanitize process definition ID
 */
export function validateDefinitionId(input: string | null | undefined): ValidationResult<string> {
  if (!input) {
    return { isValid: false, value: null, error: 'Definition ID is required' };
  }

  const sanitized = sanitizeString(input);

  if (sanitized.length === 0) {
    return { isValid: false, value: null, error: 'Definition ID cannot be empty' };
  }

  if (sanitized.length > MAX_LENGTHS.DEFINITION_ID) {
    return {
      isValid: false,
      value: null,
      error: `Definition ID too long (max ${MAX_LENGTHS.DEFINITION_ID} characters)`
    };
  }

  if (!PATTERNS.DEFINITION_ID.test(sanitized)) {
    return {
      isValid: false,
      value: null,
      error: 'Definition ID contains invalid characters'
    };
  }

  return { isValid: true, value: sanitized };
}

/**
 * Validate and sanitize version number
 */
export function validateVersion(input: string | null | undefined): ValidationResult<number> {
  if (!input) {
    return { isValid: false, value: null, error: 'Version is required' };
  }

  const sanitized = sanitizeString(input);

  if (!PATTERNS.VERSION.test(sanitized)) {
    return { isValid: false, value: null, error: 'Version must be a positive integer' };
  }

  const version = Number.parseInt(sanitized, 10);

  if (Number.isNaN(version) || version < 1 || version > 99999) {
    return {
      isValid: false,
      value: null,
      error: 'Version must be between 1 and 99999'
    };
  }

  return { isValid: true, value: version };
}

/**
 * Validate and sanitize instance ID
 */
export function validateInstanceId(input: string | null | undefined): ValidationResult<string> {
  if (!input) {
    return { isValid: true, value: null }; // Instance ID is optional
  }

  const sanitized = sanitizeString(input);

  if (sanitized.length === 0) {
    return { isValid: true, value: null };
  }

  if (sanitized.length > MAX_LENGTHS.INSTANCE_ID) {
    return {
      isValid: false,
      value: null,
      error: `Instance ID too long (max ${MAX_LENGTHS.INSTANCE_ID} characters)`
    };
  }

  if (!PATTERNS.INSTANCE_ID.test(sanitized)) {
    return {
      isValid: false,
      value: null,
      error: 'Instance ID contains invalid characters'
    };
  }

  return { isValid: true, value: sanitized };
}

/**
 * Validate and sanitize execution states
 */
export function validateStates(input: string | null | undefined): ValidationResult<string[]> {
  if (!input) {
    // Return all states if none specified
    return { isValid: true, value: Object.values(EXECUTION_STATES) };
  }

  const sanitized = sanitizeString(input);

  if (sanitized.length === 0) {
    return { isValid: true, value: Object.values(EXECUTION_STATES) };
  }

  const stateArray = sanitized.split(',').map(s => s.trim().toUpperCase());

  if (stateArray.length > MAX_LENGTHS.STATES_ARRAY) {
    return {
      isValid: false,
      value: null,
      error: `Too many states (max ${MAX_LENGTHS.STATES_ARRAY})`
    };
  }

  // Validate each state
  const validStates = Object.values(EXECUTION_STATES);
  const invalidStates = stateArray.filter(state => !validStates.includes(state as ExecutionState));

  if (invalidStates.length > 0) {
    return {
      isValid: false,
      value: null,
      error: `Invalid states: ${invalidStates.join(', ')}`
    };
  }

  // Remove duplicates
  const uniqueStates = Array.from(new Set(stateArray));

  return { isValid: true, value: uniqueStates };
}

/**
 * Sanitize all runway URL parameters
 * Returns sanitized values and collects all validation errors
 */
export function sanitizeRunwayParams(searchParams: URLSearchParams): {
  params: SanitizedRunwayParams;
  errors: string[];
  hasErrors: boolean;
} {
  const errors: string[] = [];

  const definitionId = searchParams.get('definitionId');
  const version = searchParams.get('version');
  const instanceId = searchParams.get('instanceId');
  const states = searchParams.get('states');

  // Validate definition ID
  const defResult = validateDefinitionId(definitionId);
  if (!defResult.isValid && definitionId) {
    errors.push(defResult.error || 'Invalid definition ID');
  }

  // Validate version
  const verResult = validateVersion(version);
  if (!verResult.isValid && version) {
    errors.push(verResult.error || 'Invalid version');
  }

  // Validate instance ID
  const instResult = validateInstanceId(instanceId);
  if (!instResult.isValid && instanceId) {
    errors.push(instResult.error || 'Invalid instance ID');
  }

  // Validate states
  const statesResult = validateStates(states);
  if (!statesResult.isValid && states) {
    errors.push(statesResult.error || 'Invalid states');
  }

  return {
    params: {
      definitionId: defResult.value,
      version: verResult.value,
      instanceId: instResult.value,
      states: statesResult.value || Object.values(EXECUTION_STATES),
    },
    errors,
    hasErrors: errors.length > 0,
  };
}

/**
 * Log security validation issues (for monitoring)
 */
export function logSecurityValidation(
  params: URLSearchParams,
  errors: string[]
): void {
  if (errors.length === 0) return;

  const sanitizedParams = Array.from(params.entries()).map(([key, value]) => {
    // Only log first 20 chars of values to avoid logging sensitive data
    return `${key}=${value.substring(0, 20)}${value.length > 20 ? '...' : ''}`;
  }).join('&');

  console.warn('[Security] Invalid URL parameters detected:', {
    params: sanitizedParams,
    errors,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Create safe URL with validated parameters
 */
export function createSafeRunwayUrl(params: SanitizedRunwayParams): string {
  const urlParams = new URLSearchParams();


  if (params.definitionId) {
    urlParams.set('definitionId', params.definitionId);
  }

  if (params.version !== null) {
    urlParams.set('version', params.version.toString());
  }

  if (params.instanceId) {
    urlParams.set('instanceId', params.instanceId);
  }

  // Only add states if not all states are selected
  if (params.states.length > 0 && params.states.length < Object.values(EXECUTION_STATES).length) {
    urlParams.set('states', params.states.join(','));
  }

  const queryString = urlParams.toString();
  return queryString ? `/runway?${queryString}` : '/runway';
}

