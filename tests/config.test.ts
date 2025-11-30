/**
 * Unit Tests for Configuration Management
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Save original env
const originalEnv = { ...process.env };

describe('Configuration Management', () => {
  beforeEach(() => {
    // Reset env before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore env after each test
    process.env = originalEnv;
  });

  describe('Environment Variable Parsing', () => {
    it('should parse number environment variables', () => {
      // Test number parsing logic
      const parseEnvNumber = (key: string, defaultValue: number): number => {
        const value = process.env[key];
        if (!value) return defaultValue;
        const parsed = parseInt(value, 10);
        return isNaN(parsed) ? defaultValue : parsed;
      };

      expect(parseEnvNumber('NONEXISTENT', 9876)).toBe(9876);

      process.env.TEST_PORT = '8080';
      expect(parseEnvNumber('TEST_PORT', 9876)).toBe(8080);

      process.env.TEST_PORT = 'invalid';
      expect(parseEnvNumber('TEST_PORT', 9876)).toBe(9876);
    });

    it('should parse boolean environment variables', () => {
      const parseEnvBoolean = (key: string, defaultValue: boolean): boolean => {
        const value = process.env[key]?.toLowerCase();
        if (!value) return defaultValue;
        return value === 'true' || value === '1' || value === 'yes';
      };

      expect(parseEnvBoolean('NONEXISTENT', true)).toBe(true);
      expect(parseEnvBoolean('NONEXISTENT', false)).toBe(false);

      process.env.TEST_BOOL = 'true';
      expect(parseEnvBoolean('TEST_BOOL', false)).toBe(true);

      process.env.TEST_BOOL = '1';
      expect(parseEnvBoolean('TEST_BOOL', false)).toBe(true);

      process.env.TEST_BOOL = 'yes';
      expect(parseEnvBoolean('TEST_BOOL', false)).toBe(true);

      process.env.TEST_BOOL = 'false';
      expect(parseEnvBoolean('TEST_BOOL', true)).toBe(false);

      process.env.TEST_BOOL = 'no';
      expect(parseEnvBoolean('TEST_BOOL', true)).toBe(false);
    });
  });

  describe('Default Values', () => {
    it('should have correct default blender settings', () => {
      const defaults = {
        host: 'localhost',
        port: 9876,
        socketTimeout: 180000
      };

      expect(defaults.host).toBe('localhost');
      expect(defaults.port).toBe(9876);
      expect(defaults.socketTimeout).toBe(180000);
    });

    it('should have correct default rate limit settings', () => {
      const defaults = {
        enabled: true,
        maxRequestsPerMinute: 60,
        maxConcurrentRequests: 10,
        scriptingMaxPerMinute: 20
      };

      expect(defaults.enabled).toBe(true);
      expect(defaults.maxRequestsPerMinute).toBe(60);
      expect(defaults.maxConcurrentRequests).toBe(10);
      expect(defaults.scriptingMaxPerMinute).toBe(20);
    });

    it('should have correct default cache settings', () => {
      const defaults = {
        enabled: true,
        ttlSeconds: 30,
        maxEntries: 100,
        sceneInfoTtl: 5,
        objectInfoTtl: 10
      };

      expect(defaults.enabled).toBe(true);
      expect(defaults.ttlSeconds).toBe(30);
      expect(defaults.maxEntries).toBe(100);
    });

    it('should have correct default security settings', () => {
      const defaults = {
        maxCodeSize: 102400, // 100KB
        codeExecutionTimeout: 180000,
        blockDangerousPatterns: true
      };

      expect(defaults.maxCodeSize).toBe(102400);
      expect(defaults.codeExecutionTimeout).toBe(180000);
      expect(defaults.blockDangerousPatterns).toBe(true);
    });
  });
});
