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

  constructor() {
    this.concurrency = {
      current: 0,
      max: this.config.maxConcurrentRequests
    };

    // Cleanup old buckets periodically
    setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Check if a request should be allowed based on rate limits
   */
  checkLimit(key: string, maxPerMinute?: number): RateLimitResult {
    if (!this.config.enabled) {
      return { allowed: true };
    }

    const limit = maxPerMinute || this.config.maxRequestsPerMinute;
    const now = Date.now();
    const bucket = this.getBucket(key, limit);

    // Refill tokens based on time passed
    const timePassed = now - bucket.lastRefill;
    const tokensToAdd = (timePassed / 60000) * limit;
    bucket.tokens = Math.min(limit, bucket.tokens + tokensToAdd);
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

  private cleanup(): void {
    const now = Date.now();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes

    for (const [key, bucket] of this.buckets.entries()) {
      if (now - bucket.lastRefill > staleThreshold) {
        this.buckets.delete(key);
      }
    }

    logger.debug('Rate limiter cleanup completed', {
      remainingBuckets: this.buckets.size
    });
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
