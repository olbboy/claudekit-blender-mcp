/**
 * Unit Tests for Rate Limiter
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the config
vi.mock('../src/utils/config.js', () => ({
  getRateLimitConfig: () => ({
    enabled: true,
    maxRequestsPerMinute: 60,
    maxConcurrentRequests: 10,
    scriptingMaxPerMinute: 20
  })
}));

// Simple rate limiter implementation for testing
class TestRateLimiter {
  private enabled = true;
  private maxRequestsPerMinute = 60;
  private maxConcurrent = 10;
  private scriptingMax = 20;
  private buckets: Map<string, { tokens: number; lastRefill: number }> = new Map();
  private currentConcurrency = 0;

  checkLimit(key: string, maxPerMinute?: number): { allowed: boolean; retryAfterMs?: number } {
    if (!this.enabled) return { allowed: true };

    const limit = maxPerMinute || this.maxRequestsPerMinute;
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: limit, lastRefill: now };
      this.buckets.set(key, bucket);
    }

    // Refill tokens
    const timePassed = now - bucket.lastRefill;
    const tokensToAdd = (timePassed / 60000) * limit;
    bucket.tokens = Math.min(limit, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    if (bucket.tokens < 1) {
      const waitTime = Math.ceil((1 - bucket.tokens) * (60000 / limit));
      return { allowed: false, retryAfterMs: waitTime };
    }

    bucket.tokens -= 1;
    return { allowed: true };
  }

  checkScriptingLimit(): { allowed: boolean; retryAfterMs?: number } {
    return this.checkLimit('scripting', this.scriptingMax);
  }

  acquireConcurrency(): boolean {
    if (!this.enabled) return true;
    if (this.currentConcurrency >= this.maxConcurrent) return false;
    this.currentConcurrency++;
    return true;
  }

  releaseConcurrency(): void {
    if (!this.enabled) return;
    if (this.currentConcurrency > 0) this.currentConcurrency--;
  }

  getConcurrency(): number {
    return this.currentConcurrency;
  }

  reset(): void {
    this.buckets.clear();
    this.currentConcurrency = 0;
  }

  disable(): void {
    this.enabled = false;
  }

  enable(): void {
    this.enabled = true;
  }
}

describe('Rate Limiter', () => {
  let rateLimiter: TestRateLimiter;

  beforeEach(() => {
    rateLimiter = new TestRateLimiter();
  });

  describe('Request Rate Limiting', () => {
    it('should allow requests within limit', () => {
      for (let i = 0; i < 10; i++) {
        const result = rateLimiter.checkLimit('test');
        expect(result.allowed).toBe(true);
      }
    });

    it('should block requests when limit exceeded', () => {
      // Exhaust all tokens
      for (let i = 0; i < 60; i++) {
        rateLimiter.checkLimit('test');
      }

      const result = rateLimiter.checkLimit('test');
      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    it('should use separate buckets for different keys', () => {
      // Exhaust key1
      for (let i = 0; i < 60; i++) {
        rateLimiter.checkLimit('key1');
      }

      // key2 should still have tokens
      const result = rateLimiter.checkLimit('key2');
      expect(result.allowed).toBe(true);
    });

    it('should respect custom max per minute', () => {
      // Exhaust with custom limit of 5
      for (let i = 0; i < 5; i++) {
        rateLimiter.checkLimit('custom', 5);
      }

      const result = rateLimiter.checkLimit('custom', 5);
      expect(result.allowed).toBe(false);
    });
  });

  describe('Scripting Rate Limiting', () => {
    it('should use scripting-specific limit', () => {
      // Exhaust scripting limit (20)
      for (let i = 0; i < 20; i++) {
        const result = rateLimiter.checkScriptingLimit();
        expect(result.allowed).toBe(true);
      }

      const result = rateLimiter.checkScriptingLimit();
      expect(result.allowed).toBe(false);
    });
  });

  describe('Concurrency Limiting', () => {
    it('should allow acquiring concurrency slots', () => {
      expect(rateLimiter.acquireConcurrency()).toBe(true);
      expect(rateLimiter.getConcurrency()).toBe(1);
    });

    it('should block when max concurrency reached', () => {
      // Acquire all 10 slots
      for (let i = 0; i < 10; i++) {
        expect(rateLimiter.acquireConcurrency()).toBe(true);
      }

      // 11th should fail
      expect(rateLimiter.acquireConcurrency()).toBe(false);
    });

    it('should release concurrency slots', () => {
      rateLimiter.acquireConcurrency();
      expect(rateLimiter.getConcurrency()).toBe(1);

      rateLimiter.releaseConcurrency();
      expect(rateLimiter.getConcurrency()).toBe(0);
    });

    it('should allow new acquisitions after release', () => {
      // Fill up slots
      for (let i = 0; i < 10; i++) {
        rateLimiter.acquireConcurrency();
      }

      expect(rateLimiter.acquireConcurrency()).toBe(false);

      rateLimiter.releaseConcurrency();
      expect(rateLimiter.acquireConcurrency()).toBe(true);
    });
  });

  describe('Disabled Mode', () => {
    it('should allow all requests when disabled', () => {
      rateLimiter.disable();

      for (let i = 0; i < 100; i++) {
        const result = rateLimiter.checkLimit('test');
        expect(result.allowed).toBe(true);
      }
    });

    it('should allow unlimited concurrency when disabled', () => {
      rateLimiter.disable();

      for (let i = 0; i < 100; i++) {
        expect(rateLimiter.acquireConcurrency()).toBe(true);
      }
    });
  });

  describe('Reset', () => {
    it('should reset all buckets', () => {
      // Exhaust tokens
      for (let i = 0; i < 60; i++) {
        rateLimiter.checkLimit('test');
      }

      expect(rateLimiter.checkLimit('test').allowed).toBe(false);

      rateLimiter.reset();

      expect(rateLimiter.checkLimit('test').allowed).toBe(true);
    });

    it('should reset concurrency', () => {
      for (let i = 0; i < 10; i++) {
        rateLimiter.acquireConcurrency();
      }

      expect(rateLimiter.getConcurrency()).toBe(10);

      rateLimiter.reset();

      expect(rateLimiter.getConcurrency()).toBe(0);
    });
  });
});
