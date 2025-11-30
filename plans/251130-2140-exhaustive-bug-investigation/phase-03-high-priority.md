# Phase 3: High Priority Fixes
## Runtime Errors, Memory Leaks, Type Safety & Security

**Duration:** 2 days
**Priority:** HIGH
**Bugs Fixed:** 9
**Risk Level:** Medium-High

---

## Context

Phase 3 addresses 9 high-severity bugs affecting reliability, security, and resource management. These issues don't cause immediate crashes but lead to degraded performance, memory leaks, security vulnerabilities, and eventual system failure under sustained load.

---

## Overview

High-priority bugs span multiple categories:
- **Runtime:** Socket error handler race, unhandled shutdown promises
- **Memory:** Event listener accumulation
- **Concurrency:** Pending queue race condition
- **Security:** Cache key collision, rate limit bypass, regex DoS, config validation bypass
- **Type Safety:** Unchecked type casts leading to runtime errors

---

## Bugs Addressed

### RUNTIME_002: Socket Error Handler Race
**File:** `src/utils/socket-client.ts:30-49`
**Severity:** High

**Bug:** Error handler registered AFTER connect() call, creating race where connect callback fires before error handler attached.

**Fix:** Register error handlers BEFORE calling socket.connect()

---

### MEMORY_LEAK_001: Event Listener Accumulation
**File:** `src/utils/socket-client.ts:101-147`
**Severity:** High

**Bug:** Event listeners added in receiveFullResponse() never cleaned up if JSON parsing never completes. Leads to saturation.

**Fix:** Add max attempts counter, cleanup after 1000 failed chunks

---

### RACE_CONDITION_002: Pending Queue Race
**File:** `src/utils/connection-pool.ts:273-305`
**Severity:** High

**Bug:** servePendingRequest() shifts from array without synchronization. Multiple concurrent calls can process same request twice or skip requests.

**Fix:** Already addressed in Phase 2 mutex implementation - verify coverage

---

### TYPE_SAFETY_001: Unchecked Type Cast
**File:** `src/utils/connection-pool.ts:138-166`
**Severity:** High

**Bug:** JSON.parse result cast to BlenderSocketResponse without validation. Invalid structure causes runtime crashes.

**Fix:** Add type guard validation before returning

---

### UNHANDLED_PROMISE_001: gracefulShutdown Not Awaited
**File:** `src/utils/health.ts:373-386`
**Severity:** High

**Bug:** Signal handlers call gracefulShutdown() without await. Process exits before shutdown completes.

**Fix:** Await gracefulShutdown in signal handlers

---

### BUG-002: Cache Key Collision
**File:** `src/utils/cache.ts:127-143`
**Severity:** High

**Bug:** User-controlled regex patterns in invalidatePattern() allow cache DoS via invalidating entire cache.

**Fix:** Escape special regex characters before creating RegExp

---

### BUG-004: Integer Overflow in Rate Limiting
**File:** `src/utils/rate-limiter.ts:57-61`
**Severity:** High

**Bug:** Token refill calculation can result in NaN or Infinity under clock skew, bypassing rate limits.

**Fix:** Add bounds checking and finite number validation

---

### BUG-005: Regex ReDoS
**File:** `src/tools/scripting.ts:17-30`
**Severity:** High

**Bug:** Regex patterns with catastrophic backtracking can hang validation for 180 seconds.

**Fix:** Use bounded quantifiers, reorder patterns for early failure

---

### BUG-007: Config Validation Bypass
**File:** `src/utils/config.ts:77-103`
**Severity:** High

**Bug:** parseEnvNumber accepts out-of-range values (port 999999), bypassing schema validation.

**Fix:** Add safe integer checks and re-validate config after parsing

---

## Implementation Steps

### Step 1: Fix Socket Error Handler Race (RUNTIME_002)

**File:** `src/utils/socket-client.ts`

```typescript
async connect(): Promise<void> {
  if (this.connection && !this.connection.destroyed) return;

  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(this.timeout);

    // Register handlers BEFORE connecting
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

    // Connect AFTER handlers registered
    socket.connect(this.port, this.host, () => {
      // Remove temporary handlers
      socket.off('error', onError);
      socket.off('timeout', onTimeout);
      this.connection = socket;
      resolve();
    });
  });
}
```

---

### Step 2: Fix Event Listener Leak (MEMORY_LEAK_001)

**File:** `src/utils/socket-client.ts`

```typescript
private async receiveFullResponse(socket: net.Socket): Promise<string> {
  const MAX_BUFFER_SIZE = 50 * 1024 * 1024;
  const MAX_ATTEMPTS = 1000; // New: prevent infinite accumulation

  return new Promise((resolve, reject) => {
    let buffer = '';
    let totalBytes = 0;
    let attempts = 0; // New: track parse attempts

    const cleanup = () => {
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('timeout', onTimeout);
      socket.off('close', onClose);
    };

    const onData = (chunk: Buffer) => {
      totalBytes += chunk.length;

      if (totalBytes > MAX_BUFFER_SIZE) {
        cleanup();
        socket.destroy();
        reject(new Error(`Buffer exceeded max size: ${MAX_BUFFER_SIZE}`));
        return;
      }

      buffer += chunk.toString('utf-8');
      attempts++;

      // New: cleanup after too many failed attempts
      if (attempts > MAX_ATTEMPTS) {
        cleanup();
        socket.destroy();
        reject(new Error(
          `Failed to parse JSON after ${MAX_ATTEMPTS} chunks. ` +
          `Received ${totalBytes} bytes. Buffer may be corrupted.`
        ));
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

### Step 3: Add Type Guard Validation (TYPE_SAFETY_001)

**File:** `src/utils/connection-pool.ts`

```typescript
// Add type guard
function isBlenderSocketResponse(obj: unknown): obj is BlenderSocketResponse {
  if (typeof obj !== 'object' || obj === null) return false;

  const response = obj as BlenderSocketResponse;
  return (
    typeof response.success === 'boolean' &&
    (response.data === undefined || typeof response.data === 'object') &&
    (response.error === undefined || typeof response.error === 'string')
  );
}

async execute(
  command: string,
  data?: Record<string, unknown>
): Promise<BlenderSocketResponse> {
  const connection = await this.acquire();

  try {
    const message = JSON.stringify({ command, data });
    connection.socket.write(message);

    const responseStr = await this.receiveResponse(connection.socket);

    // Parse and validate
    const parsed: unknown = JSON.parse(responseStr);

    if (!isBlenderSocketResponse(parsed)) {
      throw new Error(
        'Invalid response structure from Blender. ' +
        `Expected BlenderSocketResponse, got: ${JSON.stringify(parsed).substring(0, 100)}`
      );
    }

    return parsed;
  } finally {
    await this.release(connection);
  }
}
```

---

### Step 4: Await gracefulShutdown (UNHANDLED_PROMISE_001)

**File:** `src/utils/health.ts`

```typescript
// Wrap in async IIFE to allow await
process.on('SIGTERM', () => {
  void (async () => {
    await gracefulShutdown('SIGTERM');
  })();
});

process.on('SIGINT', () => {
  void (async () => {
    await gracefulShutdown('SIGINT');
  })();
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', {
    reason: String(reason),
    promise: String(promise)
  });

  void (async () => {
    await gracefulShutdown('unhandledRejection', 1);
  })();
});
```

---

### Step 5: Fix Cache Key Collision (BUG-002)

**File:** `src/utils/cache.ts`

```typescript
invalidatePattern(pattern: string | RegExp): number {
  let regex: RegExp;

  if (typeof pattern === 'string') {
    // Escape special regex characters to prevent injection
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    regex = new RegExp(escaped);

    logger.debug('Cache pattern invalidation', {
      original: pattern,
      escaped,
      regexSource: regex.source
    });
  } else {
    regex = pattern;
  }

  let invalidated = 0;
  const keysToDelete: string[] = [];

  for (const key of this.cache.keys()) {
    if (regex.test(key)) {
      keysToDelete.push(key);
    }
  }

  // Delete in separate loop to avoid iterator issues
  for (const key of keysToDelete) {
    this.cache.delete(key);
    invalidated++;
  }

  logger.info('Cache invalidation complete', {
    pattern: pattern.toString(),
    invalidatedCount: invalidated
  });

  return invalidated;
}
```

---

### Step 6: Fix Rate Limit Integer Overflow (BUG-004)

**File:** `src/utils/rate-limiter.ts`

```typescript
private refillTokens(bucket: TokenBucket, limit: number): void {
  const now = Date.now();
  const timePassed = Math.max(0, now - bucket.lastRefill); // Prevent negative

  const tokensToAdd = (timePassed / 60000) * limit;

  // Validate finite number
  if (!Number.isFinite(tokensToAdd)) {
    logger.warn('Invalid token calculation, resetting bucket', {
      timePassed,
      tokensToAdd,
      limit
    });
    bucket.tokens = limit;
    bucket.lastRefill = now;
    return;
  }

  // Cap tokens to limit
  const newTokens = Math.min(limit, bucket.tokens + tokensToAdd);

  // Final safety check
  bucket.tokens = Number.isFinite(newTokens) ? newTokens : limit;
  bucket.lastRefill = now;
}
```

---

### Step 7: Fix Regex ReDoS (BUG-005)

**File:** `src/tools/scripting.ts`

```typescript
const DANGEROUS_PATTERNS = [
  // Use bounded whitespace quantifiers
  { pattern: /\bos\.system\s{0,5}\(/i, description: 'System command execution' },
  { pattern: /\bsubprocess\s{0,5}\./i, description: 'Subprocess module' },
  { pattern: /\beval\s{0,5}\(/i, description: 'Eval call' },
  { pattern: /\bexec\s{0,5}\(/i, description: 'Exec call' },
  { pattern: /\b__import__\s{0,5}\(/i, description: 'Import call' },

  // Reorder: quote must come earlier to fail fast
  { pattern: /\bopen\s{0,5}\(\s{0,5}['"][wa]/i, description: 'File write operation' },

  // More specific patterns
  { pattern: /\brmtree\s{0,5}\(/i, description: 'Directory deletion' },
  { pattern: /\bunlink\s{0,5}\(/i, description: 'File deletion' }
];

function validatePythonCode(code: string): ValidationResult {
  const MAX_CODE_SIZE = 100000; // 100KB limit

  if (code.length > MAX_CODE_SIZE) {
    return {
      valid: false,
      errors: [`Code exceeds maximum size: ${MAX_CODE_SIZE} characters`]
    };
  }

  const errors: string[] = [];

  for (const { pattern, description } of DANGEROUS_PATTERNS) {
    try {
      // Add timeout protection (shouldn't be needed with bounded quantifiers)
      const matches = code.match(pattern);
      if (matches) {
        errors.push(`Potentially dangerous operation: ${description}`);
      }
    } catch (error) {
      logger.error('Regex validation error', {
        pattern: pattern.source,
        error: error instanceof Error ? error.message : String(error)
      });
      // Continue checking other patterns
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
```

---

### Step 8: Fix Config Validation Bypass (BUG-007)

**File:** `src/utils/config.ts`

```typescript
function parseEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;

  const parsed = parseInt(value, 10);

  // Validate it's a number
  if (isNaN(parsed)) return defaultValue;

  // Validate it's a safe integer
  if (!Number.isSafeInteger(parsed)) {
    logger.warn('Environment variable exceeds safe integer range', {
      key,
      value,
      defaultValue
    });
    return defaultValue;
  }

  return parsed;
}

function buildConfig(): Config {
  const rawConfig = {
    blender: {
      host: process.env.BLENDER_HOST || 'localhost',
      port: parseEnvNumber('BLENDER_PORT', 9876),
      timeout: parseEnvNumber('BLENDER_TIMEOUT', 180000)
    },
    // ... rest of config
  };

  // Re-validate with schema to catch out-of-range values
  try {
    return ConfigSchema.parse(rawConfig);
  } catch (error) {
    logger.error('Config validation failed', {
      error: error instanceof Error ? error.message : String(error),
      rawConfig
    });
    throw new Error('Invalid configuration. Check environment variables.');
  }
}
```

---

## Todo List

**RUNTIME_002: Socket Error Handler**
- [ ] Refactor connect() to register handlers first
- [ ] Remove handlers after successful connection
- [ ] Add unit tests for error during connect
- [ ] Test race condition scenarios
- [ ] Code review

**MEMORY_LEAK_001: Event Listener Cleanup**
- [ ] Add MAX_ATTEMPTS constant
- [ ] Add attempts counter
- [ ] Add cleanup logic after max attempts
- [ ] Add error message with diagnostics
- [ ] Unit tests for listener cleanup
- [ ] Memory leak testing (process monitoring)
- [ ] Code review

**TYPE_SAFETY_001: Type Guard**
- [ ] Implement isBlenderSocketResponse type guard
- [ ] Add validation before type cast
- [ ] Add comprehensive error message
- [ ] Unit tests for invalid responses
- [ ] Integration tests with mock Blender
- [ ] Code review

**UNHANDLED_PROMISE_001: Await Shutdown**
- [ ] Wrap signal handlers in async IIFE
- [ ] Await gracefulShutdown in all handlers
- [ ] Test signal handling
- [ ] Test shutdown completion
- [ ] Code review

**BUG-002: Cache Key Collision**
- [ ] Implement regex escaping
- [ ] Add logging for invalidation operations
- [ ] Unit tests for injection attempts
- [ ] Test with malicious patterns
- [ ] Code review

**BUG-004: Rate Limit Overflow**
- [ ] Add Number.isFinite checks
- [ ] Add bounds validation
- [ ] Add reset logic on invalid state
- [ ] Unit tests for clock skew scenarios
- [ ] Test with large time values
- [ ] Code review

**BUG-005: ReDoS Fix**
- [ ] Replace unbounded quantifiers with {0,5}
- [ ] Reorder patterns for early failure
- [ ] Add MAX_CODE_SIZE limit
- [ ] Add try-catch around pattern matching
- [ ] ReDoS testing with pathological inputs
- [ ] Performance benchmarking
- [ ] Code review

**BUG-007: Config Validation**
- [ ] Add Number.isSafeInteger check
- [ ] Add logging for invalid values
- [ ] Re-validate with schema after parsing
- [ ] Unit tests for out-of-range values
- [ ] Test with extreme values (999999, -1)
- [ ] Code review

**Integration & Testing**
- [ ] Full test suite execution
- [ ] Memory leak testing (24-hour run)
- [ ] Load testing (1000 concurrent requests)
- [ ] Security penetration testing
- [ ] Performance regression testing

---

## Success Criteria

**Per-Bug Success:**
- [ ] Each bug verified fixed with unit tests
- [ ] No regressions introduced
- [ ] Code review approved
- [ ] Performance maintained

**Phase Success:**
- [ ] All 9 bugs resolved
- [ ] Test coverage > 90%
- [ ] No memory leaks detected
- [ ] No race conditions in load testing
- [ ] All type casts validated

---

## Risk Assessment

**Risk 1: Type Guard Too Strict**
- **Impact:** Reject valid Blender responses
- **Mitigation:** Comprehensive testing with real Blender
- **Contingency:** Relaxed validation with warnings

**Risk 2: Rate Limit Logic Changes Behavior**
- **Impact:** Different rate limiting behavior
- **Mitigation:** A/B testing in staging
- **Contingency:** Configurable validation strictness

**Risk 3: Regex Changes Break Validation**
- **Impact:** Allow dangerous code or block valid code
- **Mitigation:** Test suite with known good/bad inputs
- **Contingency:** Rollback to previous patterns

---

## Monitoring

**Metrics:**
- `socket.error_handler_race_prevented`
- `socket.listener_cleanup_triggered`
- `type_safety.validation_failures`
- `cache.injection_attempts_blocked`
- `rate_limiter.overflow_prevented`
- `regex.redos_prevented`

**Alerts:**
- **Warning:** > 10 type validation failures per minute
- **Warning:** > 5 cache injection attempts per hour
- **Critical:** Rate limit overflow detected

---

## Dependencies

- Phase 2 mutex implementation
- Logger infrastructure
- Metrics collection
- Config schema validation

---

**Phase Owner:** Senior Backend Engineer
**Status:** Ready for Implementation
**Estimated Effort:** 16 hours
