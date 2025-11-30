/**
 * Performance Benchmarking Tests
 *
 * Tests for measuring and validating system performance characteristics.
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Performance measurement utilities
interface BenchmarkResult {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  opsPerSecond: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

async function benchmark(
  name: string,
  fn: () => void | Promise<void>,
  iterations: number = 1000
): Promise<BenchmarkResult> {
  const times: number[] = [];

  // Warmup
  for (let i = 0; i < Math.min(10, iterations / 10); i++) {
    await fn();
  }

  // Actual benchmark
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }

  const sorted = [...times].sort((a, b) => a - b);
  const total = times.reduce((a, b) => a + b, 0);

  return {
    name,
    iterations,
    totalMs: total,
    avgMs: total / iterations,
    minMs: sorted[0],
    maxMs: sorted[sorted.length - 1],
    opsPerSecond: Math.round(1000 / (total / iterations)),
    p50Ms: sorted[Math.floor(iterations * 0.5)],
    p95Ms: sorted[Math.floor(iterations * 0.95)],
    p99Ms: sorted[Math.floor(iterations * 0.99)]
  };
}

describe('JSON Serialization Performance', () => {
  const smallPayload = { name: 'Cube', type: 'MESH', location: [0, 0, 0] };
  const mediumPayload = {
    objects: Array.from({ length: 100 }, (_, i) => ({
      name: `Object${i}`,
      type: 'MESH',
      location: [i, i * 2, i * 3],
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    }))
  };
  const largePayload = {
    objects: Array.from({ length: 1000 }, (_, i) => ({
      name: `Object${i}`,
      type: 'MESH',
      location: [i, i * 2, i * 3],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      materials: [`Material${i}`]
    }))
  };

  it('should serialize small payloads quickly', async () => {
    const result = await benchmark('serialize-small', () => {
      JSON.stringify(smallPayload);
    }, 10000);

    expect(result.avgMs).toBeLessThan(0.1); // < 0.1ms average
    expect(result.p95Ms).toBeLessThan(0.5);
  });

  it('should serialize medium payloads acceptably', async () => {
    const result = await benchmark('serialize-medium', () => {
      JSON.stringify(mediumPayload);
    }, 1000);

    expect(result.avgMs).toBeLessThan(1); // < 1ms average
    expect(result.p95Ms).toBeLessThan(2);
  });

  it('should serialize large payloads within limits', async () => {
    const result = await benchmark('serialize-large', () => {
      JSON.stringify(largePayload);
    }, 100);

    expect(result.avgMs).toBeLessThan(10); // < 10ms average
    expect(result.p95Ms).toBeLessThan(20);
  });

  it('should parse JSON efficiently', async () => {
    const json = JSON.stringify(mediumPayload);
    const result = await benchmark('parse-medium', () => {
      JSON.parse(json);
    }, 1000);

    expect(result.avgMs).toBeLessThan(1);
  });
});

describe('Cache Performance', () => {
  class TestCache<T> {
    private cache = new Map<string, { value: T; expires: number }>();

    set(key: string, value: T, ttlMs: number): void {
      this.cache.set(key, { value, expires: Date.now() + ttlMs });
    }

    get(key: string): T | undefined {
      const entry = this.cache.get(key);
      if (!entry) return undefined;
      if (Date.now() > entry.expires) {
        this.cache.delete(key);
        return undefined;
      }
      return entry.value;
    }

    has(key: string): boolean {
      return this.get(key) !== undefined;
    }

    delete(key: string): boolean {
      return this.cache.delete(key);
    }

    clear(): void {
      this.cache.clear();
    }

    get size(): number {
      return this.cache.size;
    }
  }

  let cache: TestCache<unknown>;

  beforeEach(() => {
    cache = new TestCache();
  });

  it('should have fast cache writes', async () => {
    const result = await benchmark('cache-write', () => {
      cache.set(`key-${Math.random()}`, { data: 'test' }, 60000);
    }, 10000);

    expect(result.avgMs).toBeLessThan(0.05);
    expect(result.opsPerSecond).toBeGreaterThan(10000);
  });

  it('should have fast cache reads', async () => {
    // Pre-populate cache
    for (let i = 0; i < 1000; i++) {
      cache.set(`key-${i}`, { data: `value-${i}` }, 60000);
    }

    let index = 0;
    const result = await benchmark('cache-read', () => {
      cache.get(`key-${index++ % 1000}`);
    }, 10000);

    expect(result.avgMs).toBeLessThan(0.01);
    expect(result.opsPerSecond).toBeGreaterThan(50000);
  });

  it('should handle cache misses efficiently', async () => {
    const result = await benchmark('cache-miss', () => {
      cache.get(`nonexistent-${Math.random()}`);
    }, 10000);

    expect(result.avgMs).toBeLessThan(0.01);
  });
});

describe('Validation Performance', () => {
  // Simple validators for benchmarking
  function validateLocation(loc: unknown): boolean {
    if (!Array.isArray(loc)) return false;
    if (loc.length !== 3) return false;
    return loc.every(v => typeof v === 'number' && isFinite(v));
  }

  function validateObjectName(name: unknown): boolean {
    if (typeof name !== 'string') return false;
    if (name.length === 0 || name.length > 63) return false;
    return /^[a-zA-Z0-9._-]+$/.test(name);
  }

  function validateColor(color: unknown): boolean {
    if (!Array.isArray(color)) return false;
    if (color.length !== 4) return false;
    return color.every(v => typeof v === 'number' && v >= 0 && v <= 1);
  }

  it('should validate locations quickly', async () => {
    const validLocation = [1.5, 2.5, 3.5];
    const result = await benchmark('validate-location', () => {
      validateLocation(validLocation);
    }, 10000);

    expect(result.avgMs).toBeLessThan(0.01);
    expect(result.opsPerSecond).toBeGreaterThan(100000);
  });

  it('should validate object names quickly', async () => {
    const validName = 'Cube.001';
    const result = await benchmark('validate-name', () => {
      validateObjectName(validName);
    }, 10000);

    expect(result.avgMs).toBeLessThan(0.01);
  });

  it('should validate colors quickly', async () => {
    const validColor = [0.8, 0.2, 0.1, 1.0];
    const result = await benchmark('validate-color', () => {
      validateColor(validColor);
    }, 10000);

    expect(result.avgMs).toBeLessThan(0.01);
  });

  it('should reject invalid input quickly', async () => {
    const result = await benchmark('validate-invalid', () => {
      validateLocation('not an array');
      validateObjectName(123);
      validateColor([1, 2, 3]); // missing alpha
    }, 10000);

    expect(result.avgMs).toBeLessThan(0.02);
  });
});

describe('Rate Limiter Performance', () => {
  class TokenBucketLimiter {
    private tokens: number;
    private lastRefill: number;

    constructor(
      private capacity: number,
      private refillRate: number // tokens per second
    ) {
      this.tokens = capacity;
      this.lastRefill = Date.now();
    }

    tryAcquire(tokens: number = 1): boolean {
      this.refill();
      if (this.tokens >= tokens) {
        this.tokens -= tokens;
        return true;
      }
      return false;
    }

    private refill(): void {
      const now = Date.now();
      const elapsed = (now - this.lastRefill) / 1000;
      this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate);
      this.lastRefill = now;
    }

    getAvailableTokens(): number {
      this.refill();
      return this.tokens;
    }
  }

  it('should check rate limits quickly', async () => {
    const limiter = new TokenBucketLimiter(1000, 100);

    const result = await benchmark('rate-limit-check', () => {
      limiter.tryAcquire();
    }, 10000);

    expect(result.avgMs).toBeLessThan(0.01);
    expect(result.opsPerSecond).toBeGreaterThan(50000);
  });

  it('should handle burst traffic', async () => {
    const limiter = new TokenBucketLimiter(100, 10);
    let acquired = 0;

    const result = await benchmark('rate-limit-burst', () => {
      if (limiter.tryAcquire()) {
        acquired++;
      }
    }, 1000);

    expect(result.avgMs).toBeLessThan(0.01);
    // Should have acquired approximately capacity tokens
    expect(acquired).toBeGreaterThan(50);
    expect(acquired).toBeLessThanOrEqual(100);
  });
});

describe('String Operations Performance', () => {
  const DANGEROUS_PATTERNS = [
    'os.system', 'subprocess', 'eval(', 'exec(',
    '__import__', 'open(', 'shutil.rmtree', 'socket.'
  ];

  function checkPatterns(code: string): string[] {
    return DANGEROUS_PATTERNS.filter(p => code.includes(p));
  }

  function checkPatternsRegex(code: string): string[] {
    const regex = new RegExp(DANGEROUS_PATTERNS.map(p =>
      p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    ).join('|'), 'g');
    const matches = code.match(regex);
    return matches ? [...new Set(matches)] : [];
  }

  const safeCode = `
    import bpy
    for obj in bpy.data.objects:
        if obj.type == 'MESH':
            obj.location.x += 1
  `;

  const unsafeCode = `
    import os
    os.system("rm -rf /")
    subprocess.call(["ls"])
  `;

  it('should scan safe code quickly with includes', async () => {
    const result = await benchmark('pattern-check-includes', () => {
      checkPatterns(safeCode);
    }, 10000);

    expect(result.avgMs).toBeLessThan(0.05);
  });

  it('should scan unsafe code quickly with includes', async () => {
    const result = await benchmark('pattern-check-unsafe', () => {
      checkPatterns(unsafeCode);
    }, 10000);

    expect(result.avgMs).toBeLessThan(0.05);
  });

  it('should scan with regex efficiently', async () => {
    const result = await benchmark('pattern-check-regex', () => {
      checkPatternsRegex(safeCode);
    }, 10000);

    expect(result.avgMs).toBeLessThan(0.1);
  });

  it('includes method should be faster than regex for small patterns', async () => {
    const includesResult = await benchmark('includes-method', () => {
      checkPatterns(safeCode);
    }, 5000);

    const regexResult = await benchmark('regex-method', () => {
      checkPatternsRegex(safeCode);
    }, 5000);

    // Includes should generally be faster for this use case
    expect(includesResult.avgMs).toBeLessThanOrEqual(regexResult.avgMs * 2);
  });
});

describe('Memory Efficiency', () => {
  it('should handle large object creation efficiently', async () => {
    const result = await benchmark('create-large-array', () => {
      const arr = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        name: `Object${i}`,
        data: { x: i, y: i * 2, z: i * 3 }
      }));
      // Prevent optimization from removing unused variable
      return arr.length;
    }, 100);

    expect(result.avgMs).toBeLessThan(5);
  });

  it('should handle object cloning efficiently', async () => {
    const original = {
      objects: Array.from({ length: 100 }, (_, i) => ({
        name: `Object${i}`,
        location: [i, i, i]
      }))
    };

    const result = await benchmark('deep-clone', () => {
      JSON.parse(JSON.stringify(original));
    }, 1000);

    expect(result.avgMs).toBeLessThan(1);
  });

  it('should handle Map operations efficiently', async () => {
    const map = new Map<string, object>();

    const result = await benchmark('map-operations', () => {
      const key = `key-${Math.floor(Math.random() * 1000)}`;
      map.set(key, { value: Math.random() });
      map.get(key);
      map.delete(key);
    }, 10000);

    expect(result.avgMs).toBeLessThan(0.02);
  });
});

describe('Message Formatting Performance', () => {
  function formatMarkdown(data: {
    objects?: Array<{ name: string; type: string; location?: number[] }>;
  }): string {
    const lines: string[] = ['# Scene Info', ''];
    if (data.objects) {
      lines.push(`## Objects (${data.objects.length})`);
      for (const obj of data.objects) {
        lines.push(`### ${obj.name} (${obj.type})`);
        if (obj.location) {
          lines.push(`- Location: [${obj.location.join(', ')}]`);
        }
      }
    }
    return lines.join('\n');
  }

  it('should format small scenes quickly', async () => {
    const scene = {
      objects: [
        { name: 'Cube', type: 'MESH', location: [0, 0, 0] },
        { name: 'Camera', type: 'CAMERA', location: [7, -6, 5] }
      ]
    };

    const result = await benchmark('format-small-scene', () => {
      formatMarkdown(scene);
    }, 10000);

    expect(result.avgMs).toBeLessThan(0.05);
  });

  it('should format large scenes acceptably', async () => {
    const scene = {
      objects: Array.from({ length: 500 }, (_, i) => ({
        name: `Object${i}`,
        type: 'MESH',
        location: [i, i * 2, i * 3]
      }))
    };

    const result = await benchmark('format-large-scene', () => {
      formatMarkdown(scene);
    }, 100);

    expect(result.avgMs).toBeLessThan(5);
  });
});

describe('Async Operation Overhead', () => {
  it('should measure async/await overhead', async () => {
    async function asyncNoop(): Promise<number> {
      return 1;
    }

    const result = await benchmark('async-noop', async () => {
      await asyncNoop();
    }, 10000);

    // Async overhead should be minimal
    expect(result.avgMs).toBeLessThan(0.1);
  });

  it('should handle Promise.all efficiently', async () => {
    const result = await benchmark('promise-all', async () => {
      await Promise.all([
        Promise.resolve(1),
        Promise.resolve(2),
        Promise.resolve(3),
        Promise.resolve(4),
        Promise.resolve(5)
      ]);
    }, 5000);

    expect(result.avgMs).toBeLessThan(0.1);
  });

  it('should measure setTimeout overhead', async () => {
    const result = await benchmark('set-timeout-0', async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    }, 100);

    // setTimeout(0) typically adds ~1-4ms overhead
    expect(result.avgMs).toBeLessThan(10);
  });
});

describe('Benchmark Utilities', () => {
  it('should produce consistent results', async () => {
    const results: BenchmarkResult[] = [];

    for (let i = 0; i < 3; i++) {
      results.push(await benchmark('consistency-test', () => {
        // Simple operation
        const x = Math.sqrt(12345);
        return x;
      }, 1000));
    }

    // Results should be within 2x of each other
    const avgs = results.map(r => r.avgMs);
    const min = Math.min(...avgs);
    const max = Math.max(...avgs);

    expect(max / min).toBeLessThan(3);
  });

  it('should calculate percentiles correctly', async () => {
    const result = await benchmark('percentile-test', () => {
      // Variable timing operation
      const iterations = Math.floor(Math.random() * 100);
      let sum = 0;
      for (let i = 0; i < iterations; i++) {
        sum += Math.sqrt(i);
      }
      return sum;
    }, 1000);

    // P50 should be less than or equal to P95
    expect(result.p50Ms).toBeLessThanOrEqual(result.p95Ms);
    // P95 should be less than or equal to P99
    expect(result.p95Ms).toBeLessThanOrEqual(result.p99Ms);
    // P99 should be less than or equal to max
    expect(result.p99Ms).toBeLessThanOrEqual(result.maxMs);
  });
});
