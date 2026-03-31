/**
 * Tests for URL parameter sanitization
 */

import {
  validateDefinitionId,
  validateVersion,
  validateInstanceId,
  validateStates,
  sanitizeRunwayParams,
} from '../urlParamSanitizer';
import { EXECUTION_STATES } from '@/lib/types/filters';

describe('URL Parameter Sanitization', () => {
  describe('validateDefinitionId', () => {
    it('should accept valid definition IDs', () => {
      expect(validateDefinitionId('servicetasks')).toEqual({
        isValid: true,
        value: 'servicetasks',
      });

      expect(validateDefinitionId('my-process_123')).toEqual({
        isValid: true,
        value: 'my-process_123',
      });
    });

    it('should reject empty or null definition IDs', () => {
      expect(validateDefinitionId(null)).toMatchObject({ isValid: false });
      expect(validateDefinitionId('')).toMatchObject({ isValid: false });
      expect(validateDefinitionId('   ')).toMatchObject({ isValid: false });
    });

    it('should reject definition IDs with invalid characters', () => {
      // After sanitization, these should still fail pattern validation
      expect(validateDefinitionId('process;DROP TABLE')).toMatchObject({ isValid: false });
      expect(validateDefinitionId('process/path')).toMatchObject({ isValid: false });
      expect(validateDefinitionId('process space')).toMatchObject({ isValid: false });
      expect(validateDefinitionId('process@email')).toMatchObject({ isValid: false });
    });

    it('should reject definition IDs that are too long', () => {
      const tooLong = 'a'.repeat(200);
      expect(validateDefinitionId(tooLong)).toMatchObject({ isValid: false });
    });

    it('should sanitize HTML and scripts', () => {
      expect(validateDefinitionId('<script>alert(1)</script>')).toMatchObject({
        isValid: false, // Will fail pattern check after sanitization
      });
    });
  });

  describe('validateVersion', () => {
    it('should accept valid version numbers', () => {
      expect(validateVersion('1')).toEqual({ isValid: true, value: 1 });
      expect(validateVersion('42')).toEqual({ isValid: true, value: 42 });
      expect(validateVersion('99999')).toEqual({ isValid: true, value: 99999 });
    });

    it('should reject invalid version formats', () => {
      expect(validateVersion('abc')).toMatchObject({ isValid: false });
      expect(validateVersion('1.5')).toMatchObject({ isValid: false });
      expect(validateVersion('-1')).toMatchObject({ isValid: false });
      expect(validateVersion('0')).toMatchObject({ isValid: false });
    });

    it('should reject versions outside valid range', () => {
      expect(validateVersion('0')).toMatchObject({ isValid: false });
      expect(validateVersion('100000')).toMatchObject({ isValid: false });
    });

    it('should reject null or empty versions', () => {
      expect(validateVersion(null)).toMatchObject({ isValid: false });
      expect(validateVersion('')).toMatchObject({ isValid: false });
    });
  });

  describe('validateInstanceId', () => {
    it('should accept valid instance IDs (UUIDs)', () => {
      expect(validateInstanceId('123e4567-e89b-12d3-a456-426614174000')).toEqual({
        isValid: true,
        value: '123e4567-e89b-12d3-a456-426614174000',
      });

      expect(validateInstanceId('abc123-def456')).toEqual({
        isValid: true,
        value: 'abc123-def456',
      });
    });

    it('should accept null or empty (optional parameter)', () => {
      expect(validateInstanceId(null)).toEqual({ isValid: true, value: null });
      expect(validateInstanceId('')).toEqual({ isValid: true, value: null });
    });

    it('should reject instance IDs with invalid characters', () => {
      // After sanitization, these should still fail pattern validation
      expect(validateInstanceId('instance/path')).toMatchObject({ isValid: false });
      expect(validateInstanceId('instance space')).toMatchObject({ isValid: false });
      expect(validateInstanceId('instance@email')).toMatchObject({ isValid: false });
    });

    it('should reject instance IDs that are too long', () => {
      const tooLong = 'a'.repeat(200);
      expect(validateInstanceId(tooLong)).toMatchObject({ isValid: false });
    });
  });

  describe('validateStates', () => {
    it('should accept valid states', () => {
      expect(validateStates('ACTIVE,COMPLETED')).toEqual({
        isValid: true,
        value: ['ACTIVE', 'COMPLETED'],
      });

      expect(validateStates('active,completed')).toEqual({
        isValid: true,
        value: ['ACTIVE', 'COMPLETED'],
      });
    });

    it('should return all states when null or empty', () => {
      expect(validateStates(null)).toEqual({
        isValid: true,
        value: Object.values(EXECUTION_STATES),
      });

      expect(validateStates('')).toEqual({
        isValid: true,
        value: Object.values(EXECUTION_STATES),
      });
    });

    it('should reject invalid states', () => {
      expect(validateStates('ACTIVE,INVALID')).toMatchObject({ isValid: false });
      expect(validateStates('HACKED')).toMatchObject({ isValid: false });
    });

    it('should remove duplicates', () => {
      expect(validateStates('ACTIVE,ACTIVE,COMPLETED')).toEqual({
        isValid: true,
        value: ['ACTIVE', 'COMPLETED'],
      });
    });

    it('should reject too many states', () => {
      const tooMany = Array(20).fill('ACTIVE').join(',');
      expect(validateStates(tooMany)).toMatchObject({ isValid: false });
    });
  });

  describe('sanitizeRunwayParams', () => {
    it('should sanitize valid parameters', () => {
      const params = new URLSearchParams({
        definitionId: 'servicetasks',
        version: '1',
        instanceId: '123e4567-e89b-12d3-a456-426614174000',
        states: 'ACTIVE,COMPLETED',
      });

      const result = sanitizeRunwayParams(params);

      expect(result.hasErrors).toBe(false);
      expect(result.params).toEqual({
        definitionId: 'servicetasks',
        version: 1,
        instanceId: '123e4567-e89b-12d3-a456-426614174000',
        states: ['ACTIVE', 'COMPLETED'],
      });
    });

    it('should detect and report XSS attempts', () => {
      const params = new URLSearchParams({
        definitionId: '<script>alert(1)</script>',
        version: '1',
      });

      const result = sanitizeRunwayParams(params);

      expect(result.hasErrors).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.params.definitionId).toBeNull();
    });

    it('should detect and report SQL injection attempts', () => {
      const params = new URLSearchParams({
        definitionId: "'; DROP TABLE processes; --",
        version: '1',
      });

      const result = sanitizeRunwayParams(params);

      expect(result.hasErrors).toBe(true);
      expect(result.params.definitionId).toBeNull();
    });

    it('should detect and report path traversal attempts', () => {
      const params = new URLSearchParams({
        definitionId: '../../etc/passwd',
        version: '1',
      });

      const result = sanitizeRunwayParams(params);

      expect(result.hasErrors).toBe(true);
      expect(result.params.definitionId).toBeNull();
    });

    it('should handle multiple invalid parameters', () => {
      const params = new URLSearchParams({
        definitionId: '<script>',
        version: 'abc',
        instanceId: '../../../etc',
        states: 'INVALID,HACKED',
      });

      const result = sanitizeRunwayParams(params);

      expect(result.hasErrors).toBe(true);
      expect(result.errors.length).toBe(4); // All parameters are invalid
    });

    it('should handle missing optional parameters', () => {
      const params = new URLSearchParams({
        definitionId: 'servicetasks',
        version: '1',
      });

      const result = sanitizeRunwayParams(params);

      expect(result.hasErrors).toBe(false);
      expect(result.params.instanceId).toBeNull();
      expect(result.params.states).toEqual(Object.values(EXECUTION_STATES));
    });

    it('should sanitize some parameters while rejecting others', () => {
      const params = new URLSearchParams({
        definitionId: 'servicetasks', // valid
        version: 'not-a-number', // invalid
      });

      const result = sanitizeRunwayParams(params);

      expect(result.hasErrors).toBe(true);
      expect(result.params.definitionId).toBe('servicetasks');
      expect(result.params.version).toBeNull();
    });
  });
});

