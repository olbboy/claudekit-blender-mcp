/**
 * Rate Limiting System for ClaudeKit Blender MCP
 *
 * Provides protection against:
 * - Too many requests per minute
 * - Too many concurrent operations
 * - Abuse of scripting/code execution tools
 */

import { getRateLimitConfig } from './config.js';
import { logger } from './logger.js';

interface RateLimitBucket {
  tokens: number;
  lastRefill: number;
}

interface ConcurrencyTracker {
  current: number;
  max: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
  remainingTokens?: number;
  message?: string;
}

class RateLimiter {
  private buckets: Map<string, RateLimitBucket> = new Map();
  private concurrency: ConcurrencyTracker;
  private config = getRateLimitConfig();

  /**
   * MEMORY_LEAK_003 FIX: Store cleanup timer reference for proper shutdown
   */
  private cleanupTimer: NodeJS.Timeout | null = null;

  /**
   * BUG-010 FIX: Flag to prevent concurrent cleanup operations
   */
  private isCleaningUp = false;

  constructor() {
    this.concurrency = {
      current: 0,
      max: this.config.maxConcurrentRequests
    };

    // MEMORY_LEAK_003 FIX: Store timer reference for cleanup on shutdown
    this.cleanupTimer = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Shutdown the rate limiter and clean up resources
   * MEMORY_LEAK_003 FIX: Properly clears the cleanup interval
   */
  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      logger.debug('Rate limiter shutdown complete');
    }
  }

  /**
   * Check if a request should be allowed based on rate limits
   *
   * BUG-004 FIX: Added bounds checking and finite number validation
   * to prevent integer overflow under clock skew or extreme values.
   */
  checkLimit(key: string, maxPerMinute?: number): RateLimitResult {
    if (!this.config.enabled) {
      return { allowed: true };
    }

    const limit = maxPerMinute || this.config.maxRequestsPerMinute;
    const now = Date.now();
    const bucket = this.getBucket(key, limit);

    // BUG-004 FIX: Prevent negative time passed (clock skew)
    const timePassed = Math.max(0, now - bucket.lastRefill);
    const tokensToAdd = (timePassed / 60000) * limit;

    // BUG-004 FIX: Validate finite number to prevent NaN/Infinity bypass
    if (!Number.isFinite(tokensToAdd)) {
      logger.warn('Invalid token calculation, resetting bucket', {
        operation: 'checkLimit',
        key,
        timePassed,
        tokensToAdd,
        limit
      });
      // Reset bucket to limit to prevent bypass
      bucket.tokens = limit;
      bucket.lastRefill = now;
      return { allowed: true, remainingTokens: Math.floor(bucket.tokens) - 1 };
    }

    // Calculate new token count with bounds
    const newTokens = Math.min(limit, bucket.tokens + tokensToAdd);

    // BUG-004 FIX: Final safety check for NaN/Infinity
    bucket.tokens = Number.isFinite(newTokens) ? newTokens : limit;
    bucket.lastRefill = now;

    if (bucket.tokens < 1) {
      const waitTime = Math.ceil((1 - bucket.tokens) * (60000 / limit));
      logger.warn('Rate limit exceeded', {
        operation: 'rate_limit',
        key,
        waitTimeMs: waitTime
      });
      return {
        allowed: false,
        retryAfterMs: waitTime,
        remainingTokens: 0,
        message: `Rate limit exceeded. Retry after ${Math.ceil(waitTime / 1000)} seconds.`
      };
    }

    bucket.tokens -= 1;
    return {
      allowed: true,
      remainingTokens: Math.floor(bucket.tokens)
    };
  }

  /**
   * Check rate limit specifically for scripting operations
   */
  checkScriptingLimit(): RateLimitResult {
    return this.checkLimit('scripting', this.config.scriptingMaxPerMinute);
  }

  /**
   * Check if concurrent request is allowed
   */
  checkConcurrency(): RateLimitResult {
    if (!this.config.enabled) {
      return { allowed: true };
    }

    if (this.concurrency.current >= this.concurrency.max) {
      logger.warn('Concurrency limit exceeded', {
        operation: 'concurrency_limit',
        current: this.concurrency.current,
        max: this.concurrency.max
      });
      return {
        allowed: false,
        message: `Too many concurrent requests. Current: ${this.concurrency.current}, Max: ${this.concurrency.max}`
      };
    }

    return { allowed: true };
  }

  /**
   * Acquire a concurrency slot
   */
  acquireConcurrency(): boolean {
    if (!this.config.enabled) {
      return true;
    }

    if (this.concurrency.current >= this.concurrency.max) {
      return false;
    }

    this.concurrency.current += 1;
    logger.debug('Acquired concurrency slot', {
      current: this.concurrency.current,
      max: this.concurrency.max
    });
    return true;
  }

  /**
   * Release a concurrency slot
   *
   * BUG-010 FIX: Added guard against negative concurrency counter
   */
  releaseConcurrency(): void {
    if (!this.config.enabled) {
      return;
    }

    if (this.concurrency.current > 0) {
      this.concurrency.current -= 1;
      logger.debug('Released concurrency slot', {
        current: this.concurrency.current,
        max: this.concurrency.max
      });
    } else {
      // BUG-010 FIX: Should never happen, log corruption
      logger.error('Concurrency counter corrupted (negative release attempted)', undefined, {
        operation: 'releaseConcurrency',
        current: this.concurrency.current,
        max: this.concurrency.max
      });
      // Reset to 0 to prevent further issues
      this.concurrency.current = 0;
    }
  }

  /**
   * Get current stats
   */
  getStats(): {
    concurrentRequests: number;
    maxConcurrent: number;
    bucketCount: number;
  } {
    return {
      concurrentRequests: this.concurrency.current,
      maxConcurrent: this.concurrency.max,
      bucketCount: this.buckets.size
    };
  }

  /**
   * Execute a function with rate limiting and concurrency control
   */
  async withRateLimit<T>(
    key: string,
    fn: () => Promise<T>,
    maxPerMinute?: number
  ): Promise<T> {
    // Check rate limit
    const rateLimitResult = this.checkLimit(key, maxPerMinute);
    if (!rateLimitResult.allowed) {
      throw new Error(rateLimitResult.message || 'Rate limit exceeded');
    }

    // Check concurrency
    if (!this.acquireConcurrency()) {
      throw new Error('Too many concurrent requests');
    }

    try {
      return await fn();
    } finally {
      this.releaseConcurrency();
    }
  }

  /**
   * Execute scripting operation with specific rate limits
   */
  async withScriptingRateLimit<T>(fn: () => Promise<T>): Promise<T> {
    return this.withRateLimit('scripting', fn, this.config.scriptingMaxPerMinute);
  }

  private getBucket(key: string, maxPerMinute: number): RateLimitBucket {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = {
        tokens: maxPerMinute,
        lastRefill: Date.now()
      };
      this.buckets.set(key, bucket);
    }
    return bucket;
  }

  /**
   * Clean up stale buckets
   *
   * BUG-010 FIX: Added mutex flag to prevent concurrent cleanup
   * which could cause iterator issues or data corruption.
   */
  private cleanup(): void {
    // BUG-010 FIX: Prevent concurrent cleanup
    if (this.isCleaningUp) {
      return;
    }

    this.isCleaningUp = true;

    try {
      const now = Date.now();
      const staleThreshold = 5 * 60 * 1000; // 5 minutes

      // BUG-010 FIX: Collect keys to delete to avoid iterator issues
      const keysToDelete: string[] = [];

      for (const [key, bucket] of this.buckets.entries()) {
        if (now - bucket.lastRefill > staleThreshold) {
          keysToDelete.push(key);
        }
      }

      // Delete in separate loop to avoid iterator mutation issues
      for (const key of keysToDelete) {
        this.buckets.delete(key);
      }

      if (keysToDelete.length > 0) {
        logger.debug('Rate limiter cleanup completed', {
          operation: 'cleanup',
          deletedBuckets: keysToDelete.length,
          remainingBuckets: this.buckets.size
        });
      }
    } finally {
      this.isCleaningUp = false;
    }
  }

  /**
   * Reset all rate limits (useful for testing)
   */
  reset(): void {
    this.buckets.clear();
    this.concurrency.current = 0;
  }
}

// Singleton instance
let rateLimiterInstance: RateLimiter | null = null;

export function getRateLimiter(): RateLimiter {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new RateLimiter();
  }
  return rateLimiterInstance;
}

export { RateLimiter };
