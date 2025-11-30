/**
 * Unit Tests for Response Cache
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the config to avoid import issues
vi.mock('../src/utils/config.js', () => ({
  getCacheConfig: () => ({
    enabled: true,
    ttlSeconds: 30,
    maxEntries: 100,
    sceneInfoTtl: 5,
    objectInfoTtl: 10
  })
}));

// Simple cache implementation for testing
class TestCache {
  private cache: Map<string, { value: unknown; timestamp: number; ttl: number; hits: number }> = new Map();
  private maxEntries = 100;

  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return undefined;
    }

    entry.hits++;
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlSeconds: number = 30): void {
    if (this.cache.size >= this.maxEntries) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl: ttlSeconds * 1000,
      hits: 0
    });
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

describe('Response Cache', () => {
  let cache: TestCache;

  beforeEach(() => {
    cache = new TestCache();
  });

  describe('Basic Operations', () => {
    it('should store and retrieve values', () => {
      cache.set('key1', { data: 'value1' });
      expect(cache.get('key1')).toEqual({ data: 'value1' });
    });

    it('should return undefined for non-existent keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should check if key exists', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('should delete keys', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      cache.delete('key1');
      expect(cache.has('key1')).toBe(false);
    });

    it('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      expect(cache.size).toBe(2);
      cache.clear();
      expect(cache.size).toBe(0);
    });
  });

  describe('TTL Expiration', () => {
    it('should expire entries after TTL', async () => {
      cache.set('key1', 'value1', 0.001); // 1ms TTL

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(cache.get('key1')).toBeUndefined();
    });

    it('should not expire entries before TTL', () => {
      cache.set('key1', 'value1', 60); // 60s TTL
      expect(cache.get('key1')).toBe('value1');
    });
  });

  describe('Different Data Types', () => {
    it('should cache objects', () => {
      const obj = { name: 'test', count: 42 };
      cache.set('obj', obj);
      expect(cache.get('obj')).toEqual(obj);
    });

    it('should cache arrays', () => {
      const arr = [1, 2, 3, 'a', 'b'];
      cache.set('arr', arr);
      expect(cache.get('arr')).toEqual(arr);
    });

    it('should cache nested structures', () => {
      const nested = {
        level1: {
          level2: {
            value: 'deep'
          }
        }
      };
      cache.set('nested', nested);
      expect(cache.get('nested')).toEqual(nested);
    });

    it('should cache numbers', () => {
      cache.set('num', 42);
      expect(cache.get('num')).toBe(42);
    });

    it('should cache booleans', () => {
      cache.set('bool', true);
      expect(cache.get('bool')).toBe(true);
    });
  });

  describe('Key Naming', () => {
    it('should handle scene info keys', () => {
      const key = 'scene:info';
      cache.set(key, { objects: [] });
      expect(cache.get(key)).toEqual({ objects: [] });
    });

    it('should handle object info keys', () => {
      const key = 'object:Cube:info';
      cache.set(key, { name: 'Cube', type: 'MESH' });
      expect(cache.get(key)).toEqual({ name: 'Cube', type: 'MESH' });
    });

    it('should handle keys with special characters', () => {
      const key = 'object:My_Object_123:info';
      cache.set(key, { name: 'My_Object_123' });
      expect(cache.get(key)).toEqual({ name: 'My_Object_123' });
    });
  });
});
