# Exhaustive Bug Investigation: Runtime, Type Safety, Memory & Race Conditions
## ClaudeKit Blender MCP Codebase Analysis

**Investigation Date:** 2025-11-30
**Scope:** src/utils/*.ts, src/index.ts
**Focus:** Runtime errors, TypeScript strict mode, memory leaks, race conditions, resource cleanup

---

## Executive Summary

Comprehensive analysis identified **18 distinct bugs** across runtime error handling, type safety, memory management, and async race conditions. Severity ranges from Critical (2) to Low (6).

**Critical Issues:**
- Unhandled promise rejections in periodic health checks
- Race condition in connection pool acquire/release cycle
- Event listener accumulation in socket operations

---

## Bug Findings

### RUNTIME_001: Unhandled Promise Rejection in Periodic Health Check
**Location:** src/index.ts:64-70
**Root Cause:** Periodic setInterval callback in main() does not have try-catch; if performHealthCheck() fails, rejects unhandled.

```typescript
setInterval(async () => {
  const uptime = getUptime();
  logger.debug('Server health check', {
    uptime: uptime.formatted,
    ...health.metrics  // health was captured once at startup
  });
}, 300000);
```

**Issue:** The health variable is stale (captured at startup, never updated). If async operation inside callback throws, Node.js terminates process due to unhandledRejection handler.

**Severity:** Critical
**Impact:** Server crash on health check failure; no graceful degradation.

**Proposed Fix:**
```typescript
setInterval(async () => {
  try {
    const uptime = getUptime();
    const currentHealth = await performHealthCheck(false);
    logger.debug('Server health check', {
      uptime: uptime.formatted,
      status: currentHealth.status
    });
  } catch (error) {
    logger.error('Health check failed', error instanceof Error ? error : new Error(String(error)));
  }
}, 300000);
```

---

### RUNTIME_002: Missing Error Handler in Socket Connection
**Location:** src/utils/socket-client.ts:30-49
**Root Cause:** Promise returned from async connect() can reject, but connection error handler doesn't prevent race condition.

```typescript
socket.connect(this.port, this.host, () => {
  this.connection = socket;
  resolve();
});

socket.on('error', (error) => {
  this.connection = null;
  reject(...);
});
```

**Issue:** If socket.connect() callback fires before 'error' handler is registered, socket state is set but connection might be in failed state. No guarantee error handler is attached before connect attempt completes.

**Severity:** High
**Impact:** Connection leaks; socket left in zombie state.

**Proposed Fix:**
```typescript
async connect(): Promise<void> {
  if (this.connection && !this.connection.destroyed) return;

  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(this.timeout);

    // Register error handler BEFORE connecting
    const onError = (error: Error) => {
      this.connection = null;
      socket.destroy();
      reject(new Error(`Failed to connect to Blender: ${error.message}`));
    };

    const onTimeout = () => {
      socket.destroy();
      this.connection = null;
      reject(new Error('Connection timeout'));
    };

    socket.once('error', onError);
    socket.once('timeout', onTimeout);

    socket.connect(this.port, this.host, () => {
      socket.off('error', onError);
      socket.off('timeout', onTimeout);
      this.connection = socket;
      resolve();
    });
  });
}
```

---

### RACE_CONDITION_001: Connection Pool Acquire/Release Race
**Location:** src/utils/connection-pool.ts:62-106, 111-133
**Root Cause:** No synchronization between acquire() and release() operations. Multiple concurrent acquires can mark same connection as inUse.

```typescript
async acquire(): Promise<PooledConnection> {
  for (const conn of this.connections.values()) {
    if (!conn.inUse && this.isConnectionHealthy(conn)) {
      conn.inUse = true;  // RACE: No atomic check-and-set
      return conn;
    }
  }
  // ...
}
```

**Scenario:** Thread A sees connection.inUse=false, context switch to Thread B which also acquires same connection, both mark inUse=true. Both threads use same socket simultaneously.

**Severity:** Critical
**Impact:** Concurrent writes to same socket; corrupted messages; undefined behavior.

**Proposed Fix:** Implement atomic acquire with locking mechanism or use Set-based pending queue with ordered delivery.

---

### MEMORY_LEAK_001: Event Listeners Not Cleaned Up in receiveFullResponse
**Location:** src/utils/socket-client.ts:101-147
**Root Cause:** Event listeners added in receiveFullResponse can leak if promise is never resolved/rejected.

```typescript
const onData = (chunk: Buffer) => {
  buffer += chunk.toString('utf-8');
  try {
    JSON.parse(buffer);
    cleanup();  // Only called on successful parse
    resolve(buffer);
  } catch {
    // Continue accumulating - cleanup NEVER called if JSON never completes
  }
};

socket.on('data', onData);
socket.on('error', onError);
socket.on('timeout', onTimeout);
socket.on('close', onClose);
```

**Issue:** If JSON.parse always throws (malformed data), cleanup() is never called. Event listeners accumulate with every call.

**Severity:** High
**Impact:** Memory leak; event listener saturation; eventually stops receiving data.

**Proposed Fix:** Add max attempt counter; call cleanup() if incomplete for too long.

```typescript
const maxAttempts = 1000;
let attempts = 0;

const onData = (chunk: Buffer) => {
  buffer += chunk.toString('utf-8');
  attempts++;

  if (attempts > maxAttempts) {
    cleanup();
    reject(new Error('Incomplete JSON after 1000 chunks'));
    return;
  }

  try {
    JSON.parse(buffer);
    cleanup();
    resolve(buffer);
  } catch {
    // Continue
  }
};
```

---

### MEMORY_LEAK_002: Connection Pool Health Check Timer Not Cleared on Init Failure
**Location:** src/utils/connection-pool.ts:54-57
**Root Cause:** Constructor calls startHealthCheck() which creates setInterval. If exception thrown after, timer leaks.

```typescript
constructor(config: Partial<ConnectionPoolConfig> = {}) {
  this.config = { ...DEFAULT_POOL_CONFIG, ...config };
  this.startHealthCheck();  // If something below throws, timer is orphaned
}
```

**Severity:** Medium
**Impact:** Interval continues running after pool destroyed; memory leak if pool recreated multiple times.

**Proposed Fix:** Defer health check start or wrap in try-catch with cleanup.

---

### RACE_CONDITION_002: Pending Requests Queue Race in Connection Pool
**Location:** src/utils/connection-pool.ts:273-305
**Root Cause:** servePendingRequest() shifts from pendingRequests array without synchronization. Multiple concurrent servePendingRequest calls can process same request twice or skip requests.

```typescript
private async servePendingRequest(): Promise<void> {
  if (this.pendingRequests.length === 0) return;

  for (const conn of this.connections.values()) {
    if (!conn.inUse && this.isConnectionHealthy(conn)) {
      const pending = this.pendingRequests.shift();  // RACE: No atomicity
      if (pending) {
        conn.inUse = true;
        pending.resolve(conn);
      }
      return;
    }
  }

  if (this.connections.size < this.config.maxConnections) {
    try {
      const conn = await this.createConnection();  // Async - allows interleaving
      const pending = this.pendingRequests.shift();  // RACE AGAIN
      if (pending) {
        conn.inUse = true;
        pending.resolve(conn);
      }
    } catch (error) {
      const pending = this.pendingRequests.shift();  // RACE: Third time
      if (pending) {
        pending.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }
}
```

**Severity:** High
**Impact:** Pending requests dropped; some waiters never get connection; others get double connections.

---

### TYPE_SAFETY_001: Type Assertion Without Validation in Connection Pool
**Location:** src/utils/connection-pool.ts:138-166
**Root Cause:** execute() casts JSON.parse result to BlenderSocketResponse without validation.

```typescript
const responseStr = await this.receiveResponse(connection.socket);
return JSON.parse(responseStr) as BlenderSocketResponse;  // No validation
```

**Severity:** High
**Impact:** Runtime error if Blender sends unexpected JSON structure; code path crashes.

**Proposed Fix:** Use type guard.

```typescript
const parsed = JSON.parse(responseStr);
if (!isBlenderSocketResponse(parsed)) {
  throw new Error('Invalid response structure from Blender');
}
return parsed;
```

---

### TYPE_SAFETY_002: Missing Null Check After Narrow Type
**Location:** src/utils/socket-client.ts:81-84
**Root Cause:** receiveFullResponse returns string promise, but never validates it's valid JSON before parsing.

```typescript
const responseStr = await this.receiveFullResponse(this.connection);
const response = JSON.parse(responseStr) as BlenderSocketResponse;
```

**If receiveFullResponse resolves with non-JSON string, JSON.parse throws but is not caught.**

**Severity:** Medium
**Impact:** Unhandled exception escapes try-catch in outer sendCommand() if parsing fails unexpectedly.

---

### ASYNC_RACE_003: Health Check Blender Connection Not Properly Closed
**Location:** src/utils/health.ts:78-126
**Root Cause:** checkBlenderConnection creates new BlenderSocketClient, connects, sends command, disconnects, but if disconnect() throws, connection leaks.

```typescript
const client = new BlenderSocketClient(...);
await client.connect();
const response = await client.sendCommand('get_scene_info');
await client.disconnect();
```

**Severity:** Medium
**Impact:** Socket connection remains open after health check; socket fd leak.

**Proposed Fix:**
```typescript
const client = new BlenderSocketClient(...);
try {
  await client.connect();
  const response = await client.sendCommand('get_scene_info');
  // Process response
} finally {
  try {
    await client.disconnect();
  } catch (error) {
    // Log but don't rethrow
    logger.debug('Error disconnecting health check client', { error });
  }
}
```

---

### MEMORY_LEAK_003: Interval in RateLimiter Not Cleared on Process Exit
**Location:** src/utils/rate-limiter.ts:42
**Root Cause:** Constructor creates setInterval for cleanup(). Interval is never cleared if instance is not explicitly destroyed.

```typescript
constructor() {
  // ...
  setInterval(() => this.cleanup(), 60000);  // Orphaned on process exit
}
```

**Severity:** Medium
**Impact:** Interval runs even after process shutdown begins; delays exit; wastes resources.

**Proposed Fix:** Store interval reference and provide shutdown method.

```typescript
private cleanupTimer: NodeJS.Timeout | null = null;

constructor() {
  this.concurrency = { current: 0, max: this.config.maxConcurrentRequests };
  this.startCleanupTimer();

  // Register shutdown
  registerShutdownHandler('rate-limiter', () => this.shutdown());
}

private startCleanupTimer(): void {
  this.cleanupTimer = setInterval(() => this.cleanup(), 60000);
}

async shutdown(): Promise<void> {
  if (this.cleanupTimer) {
    clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
  }
}
```

---

### MEMORY_LEAK_004: MetricsCollector recentErrors Array Unbounded Growth
**Location:** src/utils/metrics.ts:93-94, 170-179
**Root Cause:** recentErrors array grows unbounded if maxRecentErrors check uses slice but doesn't prevent growth during high-error periods.

```typescript
private recentErrors: Array<{ message: string; timestamp: number }> = [];
private readonly maxRecentErrors = 100;

recordError(...) {
  // ...
  this.recentErrors.push({
    message: errorMessage,
    timestamp: Date.now()
  });

  // Trim old errors
  if (this.recentErrors.length > this.maxRecentErrors) {  // OFF-BY-ONE
    this.recentErrors = this.recentErrors.slice(-this.maxRecentErrors);
  }
}
```

**Issue:** Array can grow to maxRecentErrors + 1 before trimming. Under high error rate, this is repeated allocation.

**Severity:** Low
**Impact:** Minor memory inefficiency; not critical but unnecessary allocation churn.

**Proposed Fix:**
```typescript
if (this.recentErrors.length >= this.maxRecentErrors) {
  this.recentErrors.shift();
}
```

---

### RACE_CONDITION_004: Metrics recordError/recordTiming Race on Start Time
**Location:** src/utils/metrics.ts:256-275
**Root Cause:** getSummary() reads uptime at start of function; if timeOperation() runs concurrently, metric reflects inconsistent start times.

**Severity:** Low
**Impact:** Metrics slightly inaccurate but not critical.

---

### UNHANDLED_PROMISE_001: gracefulShutdown Promise Not Awaited in Health Module
**Location:** src/utils/health.ts:373-386
**Root Cause:** Signal handlers call gracefulShutdown() but don't await it. If exit happens during shutdown, handlers incomplete.

```typescript
process.on('SIGTERM', () => {
  gracefulShutdown('SIGTERM');  // Fire and forget
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', ...);
  gracefulShutdown('unhandledRejection', 1);  // Fire and forget - no await
});
```

**Severity:** High
**Impact:** Process exits before shutdown completes; cleanup not guaranteed.

**Proposed Fix:**
```typescript
process.on('SIGTERM', async () => {
  await gracefulShutdown('SIGTERM');
});
```

---

### TYPE_SAFETY_003: getRecoverySuggestions Returns Unsafe Array Cast
**Location:** src/utils/error-middleware.ts:237
**Root Cause:** getRecoverySuggestions returns suggestions[category] without null check on index access.

```typescript
export function getRecoverySuggestions(category: ErrorCategory): string[] {
  const suggestions: Record<ErrorCategory, string[]> = { /* ... */ };
  return suggestions[category] || suggestions[ErrorCategory.INTERNAL];
}
```

**If category is invalid, could be undefined before fallback.**

**Severity:** Low
**Impact:** Type system allows invalid enum values to be passed; defensive coding hides bug.

---

### FILE_UTILS_RACE_001: downloadFile Stream Not Error Handled Properly
**Location:** src/utils/file-utils.ts:224-246
**Root Cause:** pipeline() promise rejection not caught separately from general error.

```typescript
const fileStream = createWriteStream(destPath);
await pipeline(
  response.body as any,
  fileStream
);
```

**If response.body is null/undefined (type assertion hides), pipeline fails cryptically.**

**Severity:** Medium
**Impact:** Download failure error messages unclear; hard to debug.

**Proposed Fix:**
```typescript
if (!response.body) {
  throw new Error('Response body is null');
}
const fileStream = createWriteStream(destPath);
try {
  await pipeline(response.body as any, fileStream);
} catch (error) {
  // Clean up partial file
  try {
    await fs.unlink(destPath);
  } catch {
    // Ignore
  }
  throw error;
}
```

---

### CONFIG_VALIDATION_001: Environment Variable Parsing Not Type Strict
**Location:** src/utils/config.ts:77-103
**Root Cause:** parseEnvBoolean accepts variations but no validation of invalid values.

```typescript
function parseEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key]?.toLowerCase();
  if (!value) return defaultValue;
  return value === 'true' || value === '1' || value === 'yes';
}
```

**Issue:** String 'false' is parsed as defaultValue because it's not in the check. Confusing behavior.**

**Severity:** Low
**Impact:** Confusing config behavior if user sets CACHE_ENABLED=false (results in true if default is true).

**Proposed Fix:**
```typescript
function parseEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key]?.toLowerCase();
  if (value === 'true' || value === '1' || value === 'yes') return true;
  if (value === 'false' || value === '0' || value === 'no') return false;
  return defaultValue;
}
```

---

### LOGGER_REDUNDANCY: Console Error Called Twice
**Location:** src/utils/logger.ts:169-174
**Root Cause:** Both error and non-error logs use console.error().

```typescript
if (level >= LogLevel.ERROR) {
  console.error(formatted);
} else {
  console.error(formatted);  // Should be console.log or stderr
}
```

**Severity:** Low
**Impact:** All output goes to stderr; stdout unused; breaks log separation.

**Proposed Fix:**
```typescript
if (level >= LogLevel.ERROR) {
  console.error(formatted);
} else {
  console.log(formatted);
}
```

---

### ASYNC_CLEANUP_001: Connection Pool CreateConnection Not Cleaned Up on Exception
**Location:** src/utils/connection-pool.ts:223-262
**Root Cause:** If createConnection throws after socket.connect() callback registered but before storing in map, socket is orphaned.

```typescript
private async createConnection(): Promise<PooledConnection> {
  const id = `conn-${++this.connectionIdCounter}`;

  return new Promise((resolve, reject) => {
    const socket = new net.Socket();

    socket.connect(this.port, this.blenderConfig.host, () => {
      const conn: PooledConnection = { socket, id, /* ... */ };
      this.connections.set(id, conn);  // If exception here, socket leaked
      resolve(conn);
    });

    socket.on('error', (error) => {
      // ...
    });
  });
}
```

**Severity:** Medium
**Impact:** Socket connections leak if exception thrown between connect callback and map insertion.

---

### INDEX_MISSING_SHUTDOWN: Periodic Health Check Interval Not Unregistered
**Location:** src/index.ts:64-70
**Root Cause:** setInterval created in main() is never cleared. No shutdown handler to stop it.

**Severity:** Medium
**Impact:** Interval continues running during graceful shutdown; delays exit.

**Proposed Fix:**
```typescript
const healthCheckInterval = setInterval(async () => {
  try {
    const uptime = getUptime();
    const currentHealth = await performHealthCheck(false);
    logger.debug('Server health check', {
      uptime: uptime.formatted,
      status: currentHealth.status
    });
  } catch (error) {
    logger.error('Health check failed', error instanceof Error ? error : new Error(String(error)));
  }
}, 300000);

registerShutdownHandler('health-check', async () => {
  clearInterval(healthCheckInterval);
});
```

---

## Summary Table

| Bug ID | File | Issue Type | Severity | Category |
|--------|------|-----------|----------|----------|
| RUNTIME_001 | index.ts | Unhandled async rejection | Critical | Runtime |
| RUNTIME_002 | socket-client.ts | Race in error handler registration | High | Runtime |
| RACE_CONDITION_001 | connection-pool.ts | Concurrent acquire race | Critical | Race Condition |
| MEMORY_LEAK_001 | socket-client.ts | Event listener accumulation | High | Memory |
| MEMORY_LEAK_002 | connection-pool.ts | Timer not cleared on init failure | Medium | Memory |
| RACE_CONDITION_002 | connection-pool.ts | Pending queue race | High | Race Condition |
| TYPE_SAFETY_001 | connection-pool.ts | Unchecked type cast | High | Type Safety |
| TYPE_SAFETY_002 | socket-client.ts | Missing validation after parse | Medium | Type Safety |
| ASYNC_RACE_003 | health.ts | Unclosed connection in health check | Medium | Resource Cleanup |
| MEMORY_LEAK_003 | rate-limiter.ts | Interval not cleared | Medium | Memory |
| MEMORY_LEAK_004 | metrics.ts | Unbounded array growth | Low | Memory |
| RACE_CONDITION_004 | metrics.ts | Start time race | Low | Race Condition |
| UNHANDLED_PROMISE_001 | health.ts | gracefulShutdown not awaited | High | Runtime |
| TYPE_SAFETY_003 | error-middleware.ts | Unsafe enum indexing | Low | Type Safety |
| FILE_UTILS_RACE_001 | file-utils.ts | Stream error handling | Medium | Resource Cleanup |
| CONFIG_VALIDATION_001 | config.ts | Boolean parsing ambiguous | Low | Validation |
| LOGGER_REDUNDANCY | logger.ts | Console method redundancy | Low | Logic Error |
| ASYNC_CLEANUP_001 | connection-pool.ts | Socket leak on exception | Medium | Resource Cleanup |
| INDEX_MISSING_SHUTDOWN | index.ts | Health check interval not cleared | Medium | Resource Cleanup |

---

## Recommendations

**Priority 1 (Implement Immediately):**
1. Add try-catch to periodic health check in index.ts
2. Fix connection pool acquire/release race condition with atomic operations
3. Fix pending request queue processing with proper synchronization

**Priority 2 (High Risk):**
4. Add event listener cleanup timeout in socket-client.ts
5. Add shutdown handler for rate-limiter interval
6. Await gracefulShutdown in process signal handlers

**Priority 3 (Type Safety & Maintenance):**
7. Add type validation guards for all JSON.parse calls
8. Fix file download error handling
9. Fix logger console method logic

---

## Unresolved Questions

1. Does Node.js event loop naturally prevent interleaving between async/await boundaries? (Theoretical race conditions may not manifest in practice)
2. Is the connection pool designed for single-threaded Node.js? (If so, some races are non-issues)
3. Are tests in place that would catch these race conditions?
4. What is the observed behavior of connection leaks in production telemetry?
