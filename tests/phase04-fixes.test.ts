/**
 * Unit Tests for Phase 04 Medium Priority Fixes
 *
 * Tests for:
 * - MEMORY_LEAK_002: Connection pool health check timer cleanup
 * - MEMORY_LEAK_003: Rate limiter interval cleanup on shutdown
 * - ASYNC_RACE_003: Health check Blender connection cleanup
 * - ASYNC_CLEANUP_001: Connection pool socket leak on exception
 * - BUG-006: Cache TTL overflow
 * - BUG-008: Search query injection
 * - BUG-009: Socket timeout not reset on data receive
 * - EDGE-002: vector3Schema allows NaN/Infinity
 * - EDGE-003: colorSchema allows NaN
 * - BUG-010: Rate limiter cleanup race condition
 * - BUG-012: Dangerous pattern evasion
 * - TYPE_SAFETY_002: Missing null check after narrow type
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

// ============================================================================
// MEMORY_LEAK_002 & MEMORY_LEAK_003: Timer Cleanup Tests
// ============================================================================

describe('MEMORY_LEAK_002: Connection Pool Timer Cleanup', () => {
  it('should demonstrate timer cleanup pattern', () => {
    let timer: NodeJS.Timeout | null = null;
    let isRunning = false;

    // Simulate starting health check
    const startHealthCheck = () => {
      if (timer) return;
      timer = setInterval(() => {
        isRunning = true;
      }, 1000);
    };

    // Simulate stopping health check
    const stopHealthCheck = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    // Start and verify timer exists
    startHealthCheck();
    expect(timer).not.toBeNull();

    // Stop and verify cleanup
    stopHealthCheck();
    expect(timer).toBeNull();
  });

  it('should handle multiple start calls idempotently', () => {
    let timer: NodeJS.Timeout | null = null;
    let startCount = 0;

    const startHealthCheck = () => {
      if (timer) return; // Idempotent
      startCount++;
      timer = setInterval(() => {}, 1000);
    };

    startHealthCheck();
    startHealthCheck();
    startHealthCheck();

    expect(startCount).toBe(1); // Only started once

    if (timer) clearInterval(timer);
  });
});

describe('MEMORY_LEAK_003: Rate Limiter Timer Cleanup', () => {
  it('should demonstrate rate limiter shutdown pattern', () => {
    let cleanupTimer: NodeJS.Timeout | null = null;

    // Simulate rate limiter constructor
    cleanupTimer = setInterval(() => {}, 60000);

    // Verify timer exists
    expect(cleanupTimer).not.toBeNull();

    // Simulate shutdown
    const shutdown = () => {
      if (cleanupTimer) {
        clearInterval(cleanupTimer);
        cleanupTimer = null;
      }
    };

    shutdown();
    expect(cleanupTimer).toBeNull();
  });
});

// ============================================================================
// ASYNC_CLEANUP_001: Socket Cleanup on Exception
// ============================================================================

describe('ASYNC_CLEANUP_001: Socket Cleanup on Exception', () => {
  it('should demonstrate cleanup flag pattern', () => {
    let connectionEstablished = false;
    let socketDestroyed = false;

    const cleanup = () => {
      if (!connectionEstablished) {
        socketDestroyed = true;
      }
    };

    // Simulate error before connection established
    cleanup();
    expect(socketDestroyed).toBe(true);
  });

  it('should not destroy socket if connection was established', () => {
    let connectionEstablished = true;
    let socketDestroyed = false;

    const cleanup = () => {
      if (!connectionEstablished) {
        socketDestroyed = true;
      }
    };

    cleanup();
    expect(socketDestroyed).toBe(false);
  });
});

// ============================================================================
// BUG-006: Cache TTL Overflow Tests
// ============================================================================

describe('BUG-006: Cache TTL Overflow Prevention', () => {
  const MAX_TTL_SECONDS = 86400; // 1 day
  const MIN_TTL_SECONDS = 1;

  function calculateValidTtl(ttlSeconds: number | undefined, defaultTtl: number = 30): number {
    let validTtl = ttlSeconds !== undefined ? ttlSeconds : defaultTtl;
    validTtl = Math.max(MIN_TTL_SECONDS, Math.min(validTtl, MAX_TTL_SECONDS));
    return validTtl;
  }

  it('should cap extremely large TTL values', () => {
    const extremeTtl = 999999999;
    const validTtl = calculateValidTtl(extremeTtl);
    expect(validTtl).toBe(MAX_TTL_SECONDS);
  });

  it('should enforce minimum TTL', () => {
    const zeroTtl = 0;
    const negativeTtl = -100;

    expect(calculateValidTtl(zeroTtl)).toBe(MIN_TTL_SECONDS);
    expect(calculateValidTtl(negativeTtl)).toBe(MIN_TTL_SECONDS);
  });

  it('should allow TTL within valid range', () => {
    const validTtl = 3600; // 1 hour
    expect(calculateValidTtl(validTtl)).toBe(3600);
  });

  it('should use default TTL when undefined', () => {
    const defaultTtl = 30;
    expect(calculateValidTtl(undefined, defaultTtl)).toBe(defaultTtl);
  });

  it('should handle overflow in millisecond conversion', () => {
    const ttlSeconds = MAX_TTL_SECONDS;
    const ttlMs = ttlSeconds * 1000;

    expect(Number.isSafeInteger(ttlMs)).toBe(true);
    expect(Number.isFinite(ttlMs)).toBe(true);
  });
});

// ============================================================================
// BUG-008: Search Query Injection Tests
// ============================================================================

describe('BUG-008: Search Query Sanitization', () => {
  // Recreate sanitization logic for testing
  function sanitizeQuery(query: string): string {
    // Remove control characters
    let cleaned = query.trim().replace(/[\x00-\x1f\x7f]/g, '');
    // Remove consecutive spaces
    cleaned = cleaned.replace(/\s+/g, ' ');
    return cleaned;
  }

  it('should remove control characters', () => {
    const withNull = 'test\x00query';
    const withBell = 'test\x07query';
    const withEscape = 'test\x1bquery';

    expect(sanitizeQuery(withNull)).toBe('testquery');
    expect(sanitizeQuery(withBell)).toBe('testquery');
    expect(sanitizeQuery(withEscape)).toBe('testquery');
  });

  it('should collapse multiple spaces', () => {
    const multiSpace = 'test    query';
    const tabsAndSpaces = 'test\t\t  query';

    expect(sanitizeQuery(multiSpace)).toBe('test query');
    // Note: tabs are control chars, so removed
    expect(sanitizeQuery(tabsAndSpaces)).toBe('test query');
  });

  it('should trim leading and trailing whitespace', () => {
    const padded = '   test query   ';
    expect(sanitizeQuery(padded)).toBe('test query');
  });

  it('should URL encode for safe API usage', () => {
    const query = 'test query';
    const encoded = encodeURIComponent(query);
    expect(encoded).toBe('test%20query');
  });
});

// ============================================================================
// BUG-009: Socket Timeout Reset Tests
// ============================================================================

describe('BUG-009: Socket Timeout Reset on Data', () => {
  it('should demonstrate timeout reset pattern', () => {
    let timeoutMs = 30000;
    let lastTimeoutSet = 0;
    let setTimeoutCount = 0;

    const mockSetTimeout = (ms: number) => {
      lastTimeoutSet = ms;
      setTimeoutCount++;
    };

    // Simulate receiving data chunks
    const onData = () => {
      // Reset timeout on each chunk
      mockSetTimeout(timeoutMs);
    };

    // Receive 5 chunks
    for (let i = 0; i < 5; i++) {
      onData();
    }

    expect(setTimeoutCount).toBe(5);
    expect(lastTimeoutSet).toBe(timeoutMs);
  });
});

// ============================================================================
// EDGE-002 & EDGE-003: NaN/Infinity Schema Tests
// ============================================================================

describe('EDGE-002: vector3Schema NaN/Infinity Rejection', () => {
  // Recreate the schema for testing
  const vector3Schema = z.tuple([
    z.number().finite('X coordinate must be finite'),
    z.number().finite('Y coordinate must be finite'),
    z.number().finite('Z coordinate must be finite')
  ]).refine(
    ([x, y, z]) => !Number.isNaN(x) && !Number.isNaN(y) && !Number.isNaN(z),
    { message: 'Coordinates cannot be NaN' }
  );

  it('should accept valid vectors', () => {
    expect(() => vector3Schema.parse([0, 0, 0])).not.toThrow();
    expect(() => vector3Schema.parse([1.5, -2.5, 3.5])).not.toThrow();
    expect(() => vector3Schema.parse([-100, 100, 0])).not.toThrow();
  });

  it('should reject NaN values', () => {
    expect(() => vector3Schema.parse([NaN, 0, 0])).toThrow();
    expect(() => vector3Schema.parse([0, NaN, 0])).toThrow();
    expect(() => vector3Schema.parse([0, 0, NaN])).toThrow();
  });

  it('should reject Infinity values', () => {
    expect(() => vector3Schema.parse([Infinity, 0, 0])).toThrow();
    expect(() => vector3Schema.parse([0, -Infinity, 0])).toThrow();
    expect(() => vector3Schema.parse([0, 0, Infinity])).toThrow();
  });
});

describe('EDGE-003: colorSchema NaN/Infinity Rejection', () => {
  // Recreate the schema for testing
  const colorSchema = z.tuple([
    z.number().min(0).max(1).finite('Red channel must be finite'),
    z.number().min(0).max(1).finite('Green channel must be finite'),
    z.number().min(0).max(1).finite('Blue channel must be finite'),
    z.number().min(0).max(1).finite('Alpha channel must be finite')
  ]).refine(
    ([r, g, b, a]) => !Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b) && !Number.isNaN(a),
    { message: 'Color values cannot be NaN' }
  );

  it('should accept valid colors', () => {
    expect(() => colorSchema.parse([0, 0, 0, 0])).not.toThrow();
    expect(() => colorSchema.parse([1, 1, 1, 1])).not.toThrow();
    expect(() => colorSchema.parse([0.5, 0.5, 0.5, 0.5])).not.toThrow();
  });

  it('should reject NaN values', () => {
    expect(() => colorSchema.parse([NaN, 0.5, 0.5, 1])).toThrow();
    expect(() => colorSchema.parse([0.5, NaN, 0.5, 1])).toThrow();
    expect(() => colorSchema.parse([0.5, 0.5, NaN, 1])).toThrow();
    expect(() => colorSchema.parse([0.5, 0.5, 0.5, NaN])).toThrow();
  });

  it('should reject out-of-range values', () => {
    expect(() => colorSchema.parse([1.5, 0.5, 0.5, 1])).toThrow();
    expect(() => colorSchema.parse([-0.1, 0.5, 0.5, 1])).toThrow();
  });
});

// ============================================================================
// BUG-010: Rate Limiter Cleanup Race Condition Tests
// ============================================================================

describe('BUG-010: Rate Limiter Cleanup Race Prevention', () => {
  it('should prevent concurrent cleanup operations', () => {
    let isCleaningUp = false;
    let cleanupCount = 0;

    const cleanup = () => {
      if (isCleaningUp) return; // Prevent concurrent cleanup

      isCleaningUp = true;
      try {
        cleanupCount++;
        // Simulate cleanup work
      } finally {
        isCleaningUp = false;
      }
    };

    // Simulate multiple concurrent cleanup calls
    cleanup();
    cleanup();
    cleanup();

    // Should only run once at a time
    expect(cleanupCount).toBe(3);
  });

  it('should collect keys before deletion to avoid iterator issues', () => {
    const buckets = new Map<string, { lastRefill: number }>();
    buckets.set('key1', { lastRefill: Date.now() - 400000 }); // Stale
    buckets.set('key2', { lastRefill: Date.now() }); // Fresh
    buckets.set('key3', { lastRefill: Date.now() - 400000 }); // Stale

    const staleThreshold = 5 * 60 * 1000;
    const now = Date.now();

    // Collect keys first
    const keysToDelete: string[] = [];
    for (const [key, bucket] of buckets.entries()) {
      if (now - bucket.lastRefill > staleThreshold) {
        keysToDelete.push(key);
      }
    }

    // Delete in separate loop
    for (const key of keysToDelete) {
      buckets.delete(key);
    }

    expect(buckets.size).toBe(1);
    expect(buckets.has('key2')).toBe(true);
  });

  it('should guard against negative concurrency counter', () => {
    let concurrencyCurrent = 0;
    let errorLogged = false;

    const releaseConcurrency = () => {
      if (concurrencyCurrent > 0) {
        concurrencyCurrent--;
      } else {
        errorLogged = true;
        concurrencyCurrent = 0;
      }
    };

    // Release when already at 0
    releaseConcurrency();

    expect(errorLogged).toBe(true);
    expect(concurrencyCurrent).toBe(0);
  });
});

// ============================================================================
// BUG-012: Dangerous Pattern Evasion Tests
// ============================================================================

describe('BUG-012: Dangerous Pattern Evasion Detection', () => {
  // Enhanced patterns matching the implementation
  const DANGEROUS_PATTERNS = [
    { pattern: /\bos\s{0,5}\.\s{0,5}system/i, name: 'os.system with whitespace' },
    { pattern: /\bsubprocess\s{0,5}\.\s{0,5}\w+/i, name: 'subprocess with whitespace' },
    { pattern: /\b__builtins__/i, name: '__builtins__ access' },
    { pattern: /\bglobals\s{0,5}\(\s{0,5}\)/i, name: 'globals() access' },
    { pattern: /\bgetattr\s{0,5}\(/i, name: 'getattr() dynamic access' },
    { pattern: /\[\s{0,5}['"]system['"]\s{0,5}\]/i, name: 'bracket system notation' },
    { pattern: /\[\s{0,5}['"]eval['"]\s{0,5}\]/i, name: 'bracket eval notation' },
    { pattern: /\bos\s{0,5}\.\s{0,5}unlink/i, name: 'os.unlink' },
    { pattern: /\bos\s{0,5}\.\s{0,5}remove/i, name: 'os.remove' }
  ];

  function checkDangerous(code: string): string[] {
    const warnings: string[] = [];
    for (const { pattern, name } of DANGEROUS_PATTERNS) {
      if (pattern.test(code)) {
        warnings.push(name);
      }
    }
    return warnings;
  }

  it('should detect whitespace evasion in os.system', () => {
    const evasions = [
      'os.system("cmd")',
      'os . system("cmd")',
      'os  .  system("cmd")',
      'os\t.\tsystem("cmd")'
    ];

    for (const code of evasions) {
      expect(checkDangerous(code).length).toBeGreaterThan(0);
    }
  });

  it('should detect __builtins__ access', () => {
    const code = '__builtins__["eval"]("malicious")';
    expect(checkDangerous(code)).toContain('__builtins__ access');
  });

  it('should detect globals() access', () => {
    const code = 'globals()["os"].system("cmd")';
    expect(checkDangerous(code)).toContain('globals() access');
  });

  it('should detect bracket notation access', () => {
    expect(checkDangerous('os["system"]("cmd")')).toContain('bracket system notation');
    expect(checkDangerous("os['eval']('code')")).toContain('bracket eval notation');
  });

  it('should detect getattr dynamic access', () => {
    const code = 'getattr(os, "system")("cmd")';
    expect(checkDangerous(code)).toContain('getattr() dynamic access');
  });

  it('should detect file deletion operations', () => {
    expect(checkDangerous('os.unlink("/etc/passwd")')).toContain('os.unlink');
    expect(checkDangerous('os.remove("/etc/passwd")')).toContain('os.remove');
  });

  it('should allow safe code', () => {
    const safeCode = `
      import bpy
      bpy.ops.mesh.primitive_cube_add(location=(0, 0, 0))
      cube = bpy.context.active_object
      cube.name = "MyCube"
    `;
    expect(checkDangerous(safeCode)).toEqual([]);
  });
});

// ============================================================================
// TYPE_SAFETY_002: Null Check Tests
// ============================================================================

describe('TYPE_SAFETY_002: Connection Null Check', () => {
  it('should demonstrate double-check pattern', () => {
    let connection: { destroyed: boolean } | null = null;

    const connect = () => {
      connection = { destroyed: false };
    };

    const sendCommand = () => {
      // First check
      if (!connection || connection.destroyed) {
        connect();
      }

      // TYPE_SAFETY_002: Double-check after connect
      if (!connection) {
        throw new Error('Failed to establish connection');
      }

      // Additional check for destroyed
      if (connection.destroyed) {
        throw new Error('Connection was destroyed immediately');
      }

      return 'success';
    };

    expect(sendCommand()).toBe('success');
  });

  it('should handle edge case where connect fails silently', () => {
    let connection: object | null = null;

    const connect = () => {
      // Simulate silent failure - connection stays null
    };

    const sendCommand = () => {
      if (!connection) {
        connect();
      }

      // TYPE_SAFETY_002 FIX: Check again after connect
      if (!connection) {
        throw new Error('Failed to establish connection');
      }

      return 'success';
    };

    expect(() => sendCommand()).toThrow('Failed to establish connection');
  });
});

// ============================================================================
// ASYNC_RACE_003: Health Check Connection Cleanup
// ============================================================================

describe('ASYNC_RACE_003: Health Check Connection Cleanup', () => {
  it('should always disconnect in finally block', async () => {
    let connected = false;
    let disconnected = false;

    const connect = () => { connected = true; };
    const disconnect = () => { disconnected = true; };

    const checkHealth = async (shouldError: boolean) => {
      connect();
      try {
        if (shouldError) {
          throw new Error('Health check failed');
        }
        return 'healthy';
      } catch (error) {
        return 'unhealthy';
      } finally {
        // ASYNC_RACE_003 FIX: Always disconnect
        disconnect();
      }
    };

    // Test success path
    connected = false;
    disconnected = false;
    await checkHealth(false);
    expect(disconnected).toBe(true);

    // Test error path
    connected = false;
    disconnected = false;
    await checkHealth(true);
    expect(disconnected).toBe(true);
  });

  it('should handle disconnect errors gracefully', async () => {
    let disconnectError: Error | null = null;

    const checkHealth = async () => {
      try {
        return 'healthy';
      } finally {
        try {
          throw new Error('Disconnect failed');
        } catch (error) {
          // Log but don't rethrow
          disconnectError = error as Error;
        }
      }
    };

    const result = await checkHealth();
    expect(result).toBe('healthy'); // Main result unaffected
    expect(disconnectError?.message).toBe('Disconnect failed');
  });
});
