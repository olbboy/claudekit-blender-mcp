# Phase 2: Critical Stability Fixes
## Unhandled Promise Rejection & Connection Pool Race Condition

**Duration:** 1 day
**Priority:** CRITICAL
**Bugs Fixed:** 2
**Risk Level:** High (production crashes)

---

## Context

Phase 2 addresses critical runtime stability issues causing production crashes and data corruption:
1. Unhandled promise rejection in periodic health checks causing server crashes
2. Connection pool race condition leading to concurrent socket access and message corruption

Both bugs cause immediate production failures requiring urgent fixes.

---

## Overview

**RUNTIME_001** and **RACE_CONDITION_001** are the primary causes of production instability. Health check crashes bring down entire service, while connection pool races corrupt Blender communication resulting in undefined behavior.

These issues occur under normal load and are not edge cases - they are systemic failures in async error handling and resource synchronization.

---

## Bugs Addressed

### RUNTIME_001: Unhandled Promise Rejection in Periodic Health Check
**File:** `src/index.ts:64-70`
**Severity:** CRITICAL
**Category:** Runtime Error Handling

**Current Bug:**
```typescript
setInterval(async () => {
  const uptime = getUptime();
  logger.debug('Server health check', {
    uptime: uptime.formatted,
    ...health.metrics  // Stale data - captured once at startup
  });
}, 300000);
```

**Problems:**
1. Async callback has NO try-catch wrapper
2. If callback throws, Node.js unhandledRejection handler terminates process
3. Health metrics are stale (captured at startup, never updated)
4. No cleanup mechanism on shutdown

**Failure Scenario:**
```
[300s] Health check runs
[300s] performHealthCheck() throws (Blender connection lost)
[300s] ERROR: Unhandled promise rejection
[300s] FATAL: Server terminating (exit code 1)
[300s] SERVICE DOWN
```

**Impact:**
- Server crash every 5 minutes if health check fails
- No graceful degradation
- Complete service outage
- No recovery without manual restart

---

### RACE_CONDITION_001: Connection Pool Acquire/Release Race
**File:** `src/utils/connection-pool.ts:62-106, 111-133`
**Severity:** CRITICAL
**Category:** Race Condition / Resource Synchronization

**Current Bug:**
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

release(connection: PooledConnection): void {
  connection.inUse = false;  // RACE: No synchronization with acquire()
  this.servePendingRequest();
}
```

**Race Condition Scenario:**
```
Time  | Thread A (acquire)          | Thread B (acquire)
------|-----------------------------|--------------------------
T0    | Check conn.inUse == false   |
T1    |                             | Check conn.inUse == false
T2    | Set conn.inUse = true       |
T3    |                             | Set conn.inUse = true
T4    | Return conn                 | Return SAME conn
T5    | Write to socket             | Write to socket (RACE!)
```

**Impact:**
- Two requests use same socket simultaneously
- Interleaved writes corrupt messages
- Blender receives garbled JSON → parse error
- Response routing fails → wrong client gets wrong data
- Undefined behavior, data corruption

---

## Requirements

### Functional Requirements
1. **Error Handling:** All async operations in setInterval must be wrapped in try-catch
2. **Atomicity:** Connection acquisition must be atomic (check-and-set in single operation)
3. **Health Updates:** Health metrics must reflect current state, not stale data
4. **Cleanup:** Intervals must be cleared on shutdown

### Non-Functional Requirements
1. **Performance:** Connection pool acquire latency < 1ms
2. **Reliability:** Zero tolerance for race conditions
3. **Observability:** All errors logged with context
4. **Backward Compatibility:** API unchanged

---

## Implementation Steps

### Step 1: Fix Unhandled Promise Rejection (RUNTIME_001)

**File:** `src/index.ts`

**Implementation:**
```typescript
// Store interval reference for cleanup
let healthCheckInterval: NodeJS.Timeout | null = null;

async function main() {
  // ... existing startup code ...

  // Perform initial health check
  const health = await performHealthCheck(true);
  logger.info('Initial health check', health);

  // Start periodic health check with error handling
  healthCheckInterval = setInterval(async () => {
    try {
      const uptime = getUptime();

      // Perform fresh health check (not stale data)
      const currentHealth = await performHealthCheck(false);

      logger.debug('Periodic health check', {
        uptime: uptime.formatted,
        status: currentHealth.status,
        metrics: currentHealth.metrics
      });

      // Optional: Take action on unhealthy state
      if (currentHealth.status === 'unhealthy') {
        logger.warn('Service unhealthy', {
          issues: currentHealth.checks.filter(c => c.status === 'unhealthy')
        });
      }
    } catch (error) {
      // Log error but don't crash server
      logger.error('Health check failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });

      // Optional: Increment failure counter for monitoring
      metrics.recordError('health_check_failure');
    }
  }, 300000); // 5 minutes

  // Register shutdown handler to clear interval
  registerShutdownHandler('health-check-interval', async () => {
    if (healthCheckInterval) {
      clearInterval(healthCheckInterval);
      healthCheckInterval = null;
      logger.debug('Health check interval cleared');
    }
  });

  // ... rest of main() ...
}
```

**Test Cases:**
```typescript
describe('RUNTIME_001: Health check error handling', () => {
  it('should not crash server if health check throws', async () => {
    // Mock performHealthCheck to throw
    jest.spyOn(health, 'performHealthCheck').mockRejectedValue(
      new Error('Blender connection lost')
    );

    // Start server
    await main();

    // Wait for health check interval
    await sleep(300100);

    // Server should still be running
    expect(server.isRunning()).toBe(true);
  });

  it('should clear interval on shutdown', async () => {
    await main();

    // Trigger shutdown
    await gracefulShutdown('SIGTERM');

    // Interval should be cleared
    expect(healthCheckInterval).toBe(null);
  });
});
```

---

### Step 2: Fix Connection Pool Race Condition (RACE_CONDITION_001)

**File:** `src/utils/connection-pool.ts`

**Strategy:** Implement mutex-based locking for atomic acquire/release operations

**Implementation:**
```typescript
class ConnectionPool {
  private connections: Map<string, PooledConnection> = new Map();
  private pendingRequests: Array<{
    resolve: (conn: PooledConnection) => void;
    reject: (error: Error) => void;
  }> = [];

  // Mutex for atomic operations
  private acquireLock = false;
  private lockQueue: Array<() => void> = [];

  /**
   * Acquire lock for atomic connection operations
   */
  private async acquireMutex(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.acquireLock) {
        this.acquireLock = true;
        resolve();
      } else {
        this.lockQueue.push(resolve);
      }
    });
  }

  /**
   * Release lock and process queue
   */
  private releaseMutex(): void {
    const next = this.lockQueue.shift();
    if (next) {
      next();
    } else {
      this.acquireLock = false;
    }
  }

  /**
   * Atomically acquire connection with mutex
   */
  async acquire(): Promise<PooledConnection> {
    // Acquire mutex for atomic operation
    await this.acquireMutex();

    try {
      // Find available connection (protected by mutex)
      for (const conn of this.connections.values()) {
        if (!conn.inUse && this.isConnectionHealthy(conn)) {
          conn.inUse = true;
          conn.lastUsed = Date.now();

          logger.debug('Connection acquired', { connectionId: conn.id });
          return conn;
        }
      }

      // No available connections - create new or wait
      if (this.connections.size < this.config.maxConnections) {
        try {
          const conn = await this.createConnection();
          conn.inUse = true;
          conn.lastUsed = Date.now();

          logger.debug('New connection created and acquired', {
            connectionId: conn.id
          });
          return conn;
        } catch (error) {
          throw new Error(
            `Failed to create connection: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      // Pool exhausted - enqueue request
      logger.debug('Connection pool exhausted, queuing request', {
        poolSize: this.connections.size,
        queueSize: this.pendingRequests.length
      });

      return new Promise((resolve, reject) => {
        this.pendingRequests.push({ resolve, reject });
      });
    } finally {
      // Always release mutex
      this.releaseMutex();
    }
  }

  /**
   * Atomically release connection with mutex
   */
  async release(connection: PooledConnection): Promise<void> {
    await this.acquireMutex();

    try {
      connection.inUse = false;
      connection.lastUsed = Date.now();

      logger.debug('Connection released', {
        connectionId: connection.id,
        pendingRequests: this.pendingRequests.length
      });

      // Serve pending requests
      await this.servePendingRequest();
    } finally {
      this.releaseMutex();
    }
  }

  /**
   * Serve pending request (must be called within mutex)
   */
  private async servePendingRequest(): Promise<void> {
    // Already within mutex - no additional locking needed
    if (this.pendingRequests.length === 0) return;

    // Find available connection
    for (const conn of this.connections.values()) {
      if (!conn.inUse && this.isConnectionHealthy(conn)) {
        const pending = this.pendingRequests.shift();
        if (pending) {
          conn.inUse = true;
          conn.lastUsed = Date.now();
          pending.resolve(conn);

          logger.debug('Pending request served', {
            connectionId: conn.id,
            remainingQueue: this.pendingRequests.length
          });
        }
        return;
      }
    }

    // No available connections - create new if possible
    if (this.connections.size < this.config.maxConnections) {
      try {
        const conn = await this.createConnection();
        const pending = this.pendingRequests.shift();
        if (pending) {
          conn.inUse = true;
          conn.lastUsed = Date.now();
          pending.resolve(conn);

          logger.debug('New connection created for pending request', {
            connectionId: conn.id
          });
        }
      } catch (error) {
        // Reject pending request
        const pending = this.pendingRequests.shift();
        if (pending) {
          pending.reject(error instanceof Error ? error : new Error(String(error)));
        }
      }
    }
  }
}
```

**Test Cases:**
```typescript
describe('RACE_CONDITION_001: Connection pool race', () => {
  it('should not allow concurrent acquire of same connection', async () => {
    const pool = new ConnectionPool({ maxConnections: 1 });

    // Concurrent acquire attempts
    const [conn1, conn2] = await Promise.all([
      pool.acquire(),
      pool.acquire()
    ]);

    // Should get different connections (or one queued)
    expect(conn1.id).not.toBe(conn2.id);
  });

  it('should handle release during acquire', async () => {
    const pool = new ConnectionPool({ maxConnections: 1 });
    const conn1 = await pool.acquire();

    // Start second acquire (will queue)
    const acquirePromise = pool.acquire();

    // Release first connection immediately
    await pool.release(conn1);

    // Second acquire should receive released connection
    const conn2 = await acquirePromise;
    expect(conn2.id).toBe(conn1.id);
    expect(conn2.inUse).toBe(true);
  });

  it('should prevent interleaved writes to socket', async () => {
    const pool = new ConnectionPool({ maxConnections: 1 });

    const results = await Promise.all([
      pool.execute('command1'),
      pool.execute('command2')
    ]);

    // Both should succeed without corruption
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(true);
  });
});
```

---

## Todo List

**RUNTIME_001: Health Check Fix**
- [ ] Add try-catch wrapper to health check interval
- [ ] Update health check to use fresh metrics (not stale)
- [ ] Store interval reference for cleanup
- [ ] Add shutdown handler to clear interval
- [ ] Add error logging with context
- [ ] Add metrics for health check failures
- [ ] Write unit tests for error scenarios
- [ ] Test graceful degradation
- [ ] Verify server stays running on health check failure
- [ ] Code review

**RACE_CONDITION_001: Connection Pool Fix**
- [ ] Implement mutex locking mechanism
- [ ] Add acquireMutex() method
- [ ] Add releaseMutex() method
- [ ] Wrap acquire() with mutex
- [ ] Wrap release() with mutex
- [ ] Update servePendingRequest() to run within mutex
- [ ] Add connection ID to all log messages
- [ ] Write race condition unit tests
- [ ] Load test with concurrent requests
- [ ] Verify no socket corruption
- [ ] Benchmark performance impact
- [ ] Code review

**Integration Testing**
- [ ] Test concurrent acquire/release under load
- [ ] Test health check failure during peak traffic
- [ ] Test graceful shutdown with pending requests
- [ ] Verify no deadlocks in mutex implementation
- [ ] Performance regression testing

---

## Success Criteria

### RUNTIME_001 Success
- [ ] Server does NOT crash on health check failure
- [ ] Health metrics reflect current state
- [ ] Interval cleared on shutdown
- [ ] All errors logged with context
- [ ] Zero unhandled promise rejections

### RACE_CONDITION_001 Success
- [ ] NO concurrent access to same socket
- [ ] NO message corruption in load tests
- [ ] Atomic acquire/release operations
- [ ] Queue processed in order
- [ ] Performance overhead < 5%

### Overall Phase Success
- [ ] Zero production crashes
- [ ] Connection pool race eliminated
- [ ] All tests passing (100% coverage)
- [ ] Performance maintained
- [ ] Code review approved

---

## Risk Assessment

### Risk 1: Mutex Performance Impact
- **Description:** Mutex locking adds latency to connection operations
- **Probability:** High
- **Impact:** Medium (5-10% latency increase)
- **Mitigation:** Benchmark before/after, optimize lock granularity
- **Contingency:** If > 10% overhead, implement lock-free algorithm

### Risk 2: Deadlock in Mutex
- **Description:** Incorrect mutex implementation causes deadlock
- **Probability:** Low
- **Impact:** Critical (service hangs)
- **Mitigation:** Thorough testing, timeout on lock acquisition
- **Contingency:** Deadlock detection, automatic recovery

### Risk 3: Health Check Overhead
- **Description:** Fresh health checks every 5min increase load
- **Probability:** Low
- **Impact:** Low (minimal overhead)
- **Mitigation:** Monitor CPU/memory during health checks
- **Contingency:** Increase interval to 10 minutes

### Risk 4: Breaking Connection Pool API
- **Description:** Changes break existing integrations
- **Probability:** Low
- **Impact:** High
- **Mitigation:** Maintain API compatibility, comprehensive testing
- **Contingency:** Feature flag for rollback

---

## Rollback Plan

1. **Immediate Rollback:** Revert commits, redeploy previous version
2. **Partial Rollback:** Feature flag to use old connection pool logic
3. **Monitoring:** 24-hour observation period post-deployment
4. **Canary Deployment:** 10% traffic initially, scale to 100%

---

## Monitoring

### Metrics
- `health_check.failures` - Count of health check errors
- `connection_pool.acquire_duration_ms` - Mutex overhead
- `connection_pool.race_detected` - Race condition events
- `connection_pool.queue_size` - Pending request queue depth

### Alerts
- **Critical:** Health check fails 3 consecutive times
- **Critical:** Connection pool deadlock detected (> 30s acquire)
- **Warning:** Mutex acquire latency > 10ms
- **Info:** Queue depth > 10

---

## Dependencies

- Existing logger infrastructure
- Shutdown handler registry (from health.ts)
- Connection pool configuration
- Metrics collection system

---

## Unresolved Questions

1. Should health check interval be configurable?
   - Current: Hardcoded 5 minutes
   - Consideration: Allow ENV override

2. What is acceptable mutex overhead?
   - Assumption: < 5% latency increase
   - Action: Benchmark in production

3. Should we add timeout to mutex acquisition?
   - Consideration: Deadlock prevention
   - Decision: Add 30-second timeout in Phase 4

---

**Phase Owner:** Senior Backend Engineer
**Status:** Ready for Implementation
**Approval Required:** Engineering Lead
