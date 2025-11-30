# Phase 4: Medium Priority Fixes
## Memory Leaks, Race Conditions, Validation & Edge Cases

**Duration:** 2 days
**Priority:** MEDIUM
**Bugs Fixed:** 12
**Risk Level:** Medium

---

## Context

Phase 4 addresses 12 medium-severity issues including resource leaks, race conditions, validation gaps, and edge cases. While not critical, these bugs degrade system stability over time and create maintenance burden.

---

## Overview

Medium-priority bugs across multiple areas:
- **Memory Management:** Timer leaks, unbounded array growth
- **Resource Cleanup:** Unclosed connections, orphaned intervals
- **Validation:** TTL overflow, timeout issues, NaN/Infinity handling
- **Race Conditions:** Cleanup races, async state issues
- **Security:** Pattern evasion, injection vulnerabilities

---

## Bugs Addressed

### Group A: Memory & Resource Leaks

**MEMORY_LEAK_002:** Connection pool health check timer not cleared on init failure
**MEMORY_LEAK_003:** Rate limiter interval not cleared on process exit
**ASYNC_RACE_003:** Health check Blender connection not properly closed
**ASYNC_CLEANUP_001:** Connection pool socket orphaned on exception
**INDEX_MISSING_SHUTDOWN:** Periodic health check interval not unregistered

### Group B: Validation & Edge Cases

**BUG-006:** Cache TTL integer overflow
**BUG-008:** Search query injection
**BUG-009:** Socket timeout not reset on data receive
**EDGE-002:** vector3Schema allows NaN/Infinity
**EDGE-003:** colorSchema allows NaN

### Group C: Race Conditions & Security

**BUG-010:** Rate limiter cleanup race condition
**BUG-012:** Dangerous pattern evasion
**TYPE_SAFETY_002:** Missing null check after narrow type

---

## Implementation Steps

### Group A: Memory & Resource Leak Fixes

#### Fix 1: MEMORY_LEAK_002 - Connection Pool Health Check Timer

**File:** `src/utils/connection-pool.ts`

```typescript
class ConnectionPool {
  private healthCheckTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<ConnectionPoolConfig> = {}) {
    this.config = { ...DEFAULT_POOL_CONFIG, ...config };

    try {
      // Defer health check start until after construction
      this.startHealthCheck();
    } catch (error) {
      // Clean up timer if construction fails
      this.stopHealthCheck();
      throw error;
    }
  }

  private startHealthCheck(): void {
    if (this.healthCheckTimer) return;

    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckInterval);
  }

  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  async destroy(): Promise<void> {
    this.stopHealthCheck();
    // ... rest of cleanup
  }
}
```

---

#### Fix 2: MEMORY_LEAK_003 - Rate Limiter Interval Cleanup

**File:** `src/utils/rate-limiter.ts`

```typescript
class RateLimiter {
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_RATE_LIMIT_CONFIG, ...config };
    this.concurrency = {
      current: 0,
      max: this.config.maxConcurrentRequests
    };

    this.startCleanupTimer();

    // Register shutdown handler
    registerShutdownHandler('rate-limiter', () => this.shutdown());
  }

  private startCleanupTimer(): void {
    if (this.cleanupTimer) return;

    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  async shutdown(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    logger.debug('Rate limiter shutdown complete');
  }
}
```

---

#### Fix 3: ASYNC_RACE_003 - Health Check Connection Cleanup

**File:** `src/utils/health.ts`

```typescript
async function checkBlenderConnection(
  config: Config
): Promise<HealthCheckResult> {
  const client = new BlenderSocketClient(
    config.blender.port,
    config.blender.host,
    config.blender.timeout
  );

  try {
    await client.connect();

    const response = await client.sendCommand('get_scene_info');

    if (response.success) {
      return {
        status: 'healthy',
        message: 'Blender connection established',
        latency: response.latency
      };
    } else {
      return {
        status: 'unhealthy',
        message: `Blender error: ${response.error}`,
        latency: response.latency
      };
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      message: error instanceof Error ? error.message : String(error)
    };
  } finally {
    // Always disconnect, even if error occurs
    try {
      await client.disconnect();
    } catch (disconnectError) {
      // Log but don't rethrow - health check result already determined
      logger.debug('Error disconnecting health check client', {
        error: disconnectError instanceof Error
          ? disconnectError.message
          : String(disconnectError)
      });
    }
  }
}
```

---

#### Fix 4: ASYNC_CLEANUP_001 - Connection Pool Socket Leak

**File:** `src/utils/connection-pool.ts`

```typescript
private async createConnection(): Promise<PooledConnection> {
  const id = `conn-${++this.connectionIdCounter}`;
  const socket = new net.Socket();
  let connEstablished = false;

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      if (!connEstablished) {
        socket.destroy();
      }
    };

    socket.setTimeout(this.blenderConfig.timeout);

    socket.connect(this.port, this.blenderConfig.host, () => {
      try {
        const conn: PooledConnection = {
          socket,
          id,
          inUse: false,
          createdAt: Date.now(),
          lastUsed: Date.now()
        };

        this.connections.set(id, conn);
        connEstablished = true;
        resolve(conn);
      } catch (error) {
        // Exception during connection object creation
        cleanup();
        reject(error);
      }
    });

    socket.on('error', (error) => {
      cleanup();
      reject(new Error(`Connection failed: ${error.message}`));
    });

    socket.on('timeout', () => {
      cleanup();
      reject(new Error('Connection timeout'));
    });
  });
}
```

---

#### Fix 5: INDEX_MISSING_SHUTDOWN - Health Check Interval Cleanup

**File:** `src/index.ts`

Already addressed in Phase 2 RUNTIME_001 fix. Verify implementation includes:
- Interval reference stored
- Shutdown handler registered
- clearInterval() called on shutdown

---

### Group B: Validation & Edge Case Fixes

#### Fix 6: BUG-006 - Cache TTL Overflow

**File:** `src/utils/cache.ts`

```typescript
set<T>(key: string, value: T, ttlSeconds?: number): void {
  if (!this.config.enabled) return;

  if (this.cache.size >= this.config.maxEntries) {
    this.evictLRU();
  }

  // Validate and cap TTL
  const MAX_TTL_SECONDS = 86400; // 1 day max
  const MIN_TTL_SECONDS = 1; // 1 second min

  let validTtl = ttlSeconds !== undefined
    ? ttlSeconds
    : this.config.ttlSeconds;

  // Clamp to valid range
  validTtl = Math.max(MIN_TTL_SECONDS, Math.min(validTtl, MAX_TTL_SECONDS));

  // Convert to milliseconds with overflow check
  const ttlMs = validTtl * 1000;
  const validTtlMs = Number.isSafeInteger(ttlMs)
    ? ttlMs
    : MAX_TTL_SECONDS * 1000;

  const entry: CacheEntry<T> = {
    value,
    timestamp: Date.now(),
    ttl: validTtlMs,
    hits: 0
  };

  this.cache.set(key, entry);

  logger.debug('Cache entry set', {
    key,
    ttl: validTtlMs,
    cacheSize: this.cache.size
  });
}
```

---

#### Fix 7: BUG-008 - Search Query Injection

**File:** `src/utils/validators.ts`

```typescript
export const searchQuerySchema = z.string()
  .min(1, 'Search query required')
  .max(200, 'Search query too long')
  .regex(/^[a-zA-Z0-9\s\-_.,]+$/, 'Invalid characters in search query')
  .transform((query) => {
    // Remove control characters
    let cleaned = query.trim().replace(/[\x00-\x1f\x7f]/g, '');

    // Remove consecutive spaces
    cleaned = cleaned.replace(/\s+/g, ' ');

    return cleaned;
  })
  .refine((query) => query.length > 0, 'Query cannot be empty after cleaning');

// When using in API calls, always URL encode
function safeSearchQuery(query: string): string {
  const validated = searchQuerySchema.parse(query);
  return encodeURIComponent(validated);
}
```

---

#### Fix 8: BUG-009 - Socket Timeout Not Reset

**File:** `src/utils/socket-client.ts`

```typescript
private async receiveFullResponse(socket: net.Socket): Promise<string> {
  const MAX_BUFFER_SIZE = 50 * 1024 * 1024;
  const MAX_ATTEMPTS = 1000;

  return new Promise((resolve, reject) => {
    let buffer = '';
    let totalBytes = 0;
    let attempts = 0;

    const cleanup = () => {
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('timeout', onTimeout);
      socket.off('close', onClose);
    };

    const onData = (chunk: Buffer) => {
      // Reset timeout on every data chunk received
      socket.setTimeout(this.timeout);

      totalBytes += chunk.length;

      if (totalBytes > MAX_BUFFER_SIZE) {
        cleanup();
        socket.destroy();
        reject(new Error(`Buffer exceeded max size: ${MAX_BUFFER_SIZE}`));
        return;
      }

      buffer += chunk.toString('utf-8');
      attempts++;

      if (attempts > MAX_ATTEMPTS) {
        cleanup();
        socket.destroy();
        reject(new Error(`Failed to parse JSON after ${MAX_ATTEMPTS} chunks`));
        return;
      }

      try {
        JSON.parse(buffer);
        cleanup();
        resolve(buffer);
      } catch {
        // Continue accumulating
      }
    };

    // ... rest of handlers
  });
}
```

---

#### Fix 9 & 10: EDGE-002, EDGE-003 - NaN/Infinity in Schemas

**File:** `src/utils/validators.ts`

```typescript
export const vector3Schema = z.tuple([
  z.number().finite('X coordinate must be finite'),
  z.number().finite('Y coordinate must be finite'),
  z.number().finite('Z coordinate must be finite')
]).refine(
  ([x, y, z]) => !isNaN(x) && !isNaN(y) && !isNaN(z),
  'Coordinates cannot be NaN'
);

export const colorSchema = z.tuple([
  z.number().min(0).max(1).finite('Red channel must be finite'),
  z.number().min(0).max(1).finite('Green channel must be finite'),
  z.number().min(0).max(1).finite('Blue channel must be finite'),
  z.number().min(0).max(1).finite('Alpha channel must be finite')
]).refine(
  ([r, g, b, a]) => !isNaN(r) && !isNaN(g) && !isNaN(b) && !isNaN(a),
  'Color values cannot be NaN'
);
```

---

### Group C: Race Conditions & Security Fixes

#### Fix 11: BUG-010 - Rate Limiter Cleanup Race

**File:** `src/utils/rate-limiter.ts`

```typescript
class RateLimiter {
  private isCleaningUp = false;

  private cleanup(): void {
    // Prevent concurrent cleanup
    if (this.isCleaningUp) return;

    this.isCleaningUp = true;

    try {
      const now = Date.now();
      const staleThreshold = 5 * 60 * 1000; // 5 minutes

      const keysToDelete: string[] = [];

      for (const [key, bucket] of this.buckets.entries()) {
        if (now - bucket.lastRefill > staleThreshold) {
          keysToDelete.push(key);
        }
      }

      // Delete in separate loop to avoid iterator issues
      for (const key of keysToDelete) {
        this.buckets.delete(key);
      }

      if (keysToDelete.length > 0) {
        logger.debug('Rate limiter cleanup', {
          deletedBuckets: keysToDelete.length,
          remainingBuckets: this.buckets.size
        });
      }
    } finally {
      this.isCleaningUp = false;
    }
  }

  // Add concurrency guard
  releaseConcurrency(): void {
    if (!this.config.enabled) return;

    if (this.concurrency.current > 0) {
      this.concurrency.current -= 1;
    } else {
      // Should never happen, log corruption
      logger.error('Concurrency counter corrupted (negative release)', {
        current: this.concurrency.current
      });
      this.concurrency.current = 0;
    }
  }
}
```

---

#### Fix 12: BUG-012 - Dangerous Pattern Evasion

**File:** `src/tools/scripting.ts`

```typescript
const DANGEROUS_PATTERNS = [
  // Whitespace-tolerant patterns
  { pattern: /\bos\s*\.\s*system/i, description: 'OS system call' },
  { pattern: /\bsubprocess\s*\.\s*\w+/i, description: 'Subprocess module' },
  { pattern: /\beval\s*\(/i, description: 'Eval call' },
  { pattern: /\bexec\s*\(/i, description: 'Exec call' },
  { pattern: /\b__import__\s*\(/i, description: 'Import call' },
  { pattern: /\bopen\s{0,5}\(\s{0,5}['"][wa]/i, description: 'File write' },

  // Builtins access
  { pattern: /\b__builtins__/i, description: 'Builtins access' },

  // Bracket notation
  { pattern: /\[\s*['"]system['"]\s*\]/i, description: 'Bracket system access' },
  { pattern: /\[\s*['"]eval['"]\s*\]/i, description: 'Bracket eval access' },
  { pattern: /\[\s*['"]exec['"]\s*\]/i, description: 'Bracket exec access' },

  // File operations
  { pattern: /\brmtree\s*\(/i, description: 'Directory deletion' },
  { pattern: /\bunlink\s*\(/i, description: 'File deletion' },
  { pattern: /\bremove\s*\(/i, description: 'File removal' }
];
```

---

#### Fix 13: TYPE_SAFETY_002 - Missing Null Check

**File:** `src/utils/socket-client.ts`

```typescript
async sendCommand(
  command: string,
  data?: Record<string, unknown>
): Promise<BlenderSocketResponse> {
  if (!this.connection || this.connection.destroyed) {
    await this.connect();
  }

  if (!this.connection) {
    throw new Error(
      `Failed to establish connection to ${this.host}:${this.port}`
    );
  }

  try {
    const message = JSON.stringify({ command, data });
    this.connection.write(message);

    const responseStr = await this.receiveFullResponse(this.connection);

    // Validate response string before parsing
    if (!responseStr || responseStr.trim().length === 0) {
      throw new Error('Empty response from Blender');
    }

    // Parse with error handling
    let parsed: unknown;
    try {
      parsed = JSON.parse(responseStr);
    } catch (parseError) {
      throw new Error(
        `Invalid JSON response from Blender: ${parseError instanceof Error ? parseError.message : String(parseError)}`
      );
    }

    // Type validation (already implemented in Phase 3)
    if (!isBlenderSocketResponse(parsed)) {
      throw new Error(
        'Invalid response structure from Blender. ' +
        `Expected BlenderSocketResponse, got: ${JSON.stringify(parsed).substring(0, 100)}`
      );
    }

    return parsed;
  } catch (error) {
    throw new Error(
      `Command failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
```

---

## Todo List

**Memory Leaks (Group A)**
- [ ] MEMORY_LEAK_002: Add timer reference and cleanup
- [ ] MEMORY_LEAK_003: Add shutdown handler for rate limiter
- [ ] ASYNC_RACE_003: Add finally block for disconnect
- [ ] ASYNC_CLEANUP_001: Add socket cleanup on exception
- [ ] INDEX_MISSING_SHUTDOWN: Verify Phase 2 implementation
- [ ] Test all cleanup paths
- [ ] Memory leak testing (24-hour run)

**Validation (Group B)**
- [ ] BUG-006: Add TTL bounds checking
- [ ] BUG-008: Add query sanitization
- [ ] BUG-009: Add timeout reset logic
- [ ] EDGE-002: Add .finite() to vector3Schema
- [ ] EDGE-003: Add .finite() to colorSchema
- [ ] Test all edge cases
- [ ] Validation regression testing

**Race & Security (Group C)**
- [ ] BUG-010: Add cleanup mutex
- [ ] BUG-012: Expand dangerous pattern list
- [ ] TYPE_SAFETY_002: Add null checks
- [ ] Race condition testing
- [ ] Security penetration testing
- [ ] Code review for all fixes

**Integration Testing**
- [ ] Full test suite execution
- [ ] Load testing (sustained load)
- [ ] Memory profiling
- [ ] Performance benchmarking
- [ ] Regression testing

---

## Success Criteria

- [ ] All 12 bugs verified fixed
- [ ] No resource leaks detected (24-hour test)
- [ ] All edge cases handled gracefully
- [ ] Race conditions eliminated
- [ ] Test coverage > 85%
- [ ] Performance maintained (< 5% overhead)
- [ ] Code review approved

---

## Risk Assessment

**Risk 1: TTL Limits Too Restrictive**
- **Impact:** Users cannot cache long-lived data
- **Mitigation:** Make MAX_TTL_SECONDS configurable
- **Contingency:** Increase to 7 days if needed

**Risk 2: Pattern List Too Broad**
- **Impact:** Block legitimate Python code
- **Mitigation:** Comprehensive testing with real scripts
- **Contingency:** Whitelist mechanism for known-safe patterns

**Risk 3: Cleanup Mutex Overhead**
- **Impact:** Performance degradation
- **Mitigation:** Benchmarking
- **Contingency:** Remove mutex if < 0.1% probability

---

## Monitoring

**Metrics:**
- `memory.timers.leaked`
- `validation.ttl.capped`
- `validation.query.sanitized`
- `validation.nan_infinity.blocked`
- `rate_limiter.cleanup.concurrent_prevented`

**Alerts:**
- **Warning:** Timer leak detected
- **Warning:** > 10 NaN/Infinity values per hour
- **Info:** TTL capped (user trying extreme values)

---

**Phase Owner:** Backend Engineer
**Status:** Ready for Implementation
**Estimated Effort:** 16 hours
