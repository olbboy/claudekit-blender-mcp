/**
 * Response Caching System for ClaudeKit Blender MCP
 *
 * Provides caching for read-only operations:
 * - Scene info queries
 * - Object info queries
 * - Other idempotent operations
 *
 * Features:
 * - TTL-based expiration
 * - LRU eviction when max entries reached
 * - Invalidation by pattern/key
 * - Cache statistics
 */

import { getCacheConfig } from './config.js';
import { logger } from './logger.js';

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
  hits: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  hitRate: number;
}

class ResponseCache {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private config = getCacheConfig();
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0
  };

  /**
   * Get a value from cache
   */
  get<T>(key: string): T | undefined {
    if (!this.config.enabled) {
      return undefined;
    }

    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      logger.debug('Cache miss', { key });
      return undefined;
    }

    // Check if expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.stats.misses++;
      logger.debug('Cache expired', { key });
      return undefined;
    }

    entry.hits++;
    this.stats.hits++;
    logger.debug('Cache hit', { key, hits: entry.hits });

    return entry.value as T;
  }

  /**
   * Set a value in cache
   */
  set<T>(key: string, value: T, ttlSeconds?: number): void {
    if (!this.config.enabled) {
      return;
    }

    // Ensure cache doesn't exceed max size
    if (this.cache.size >= this.config.maxEntries) {
      this.evictLRU();
    }

    const entry: CacheEntry<T> = {
      value,
      timestamp: Date.now(),
      ttl: (ttlSeconds || this.config.ttlSeconds) * 1000,
      hits: 0
    };

    this.cache.set(key, entry);
    logger.debug('Cache set', { key, ttlSeconds: ttlSeconds || this.config.ttlSeconds });
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    if (!this.config.enabled) {
      return false;
    }

    const entry = this.cache.get(key);
    if (!entry) return false;

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete a specific key
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Invalidate cache entries matching a pattern
   */
  invalidatePattern(pattern: string | RegExp): number {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    let count = 0;

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }

    if (count > 0) {
      logger.debug('Cache invalidated by pattern', { pattern: pattern.toString(), count });
    }

    return count;
  }

  /**
   * Invalidate all scene-related cache entries
   */
  invalidateScene(): void {
    this.invalidatePattern(/^scene:/);
  }

  /**
   * Invalidate object-related cache entries
   */
  invalidateObject(objectName?: string): void {
    if (objectName) {
      this.invalidatePattern(new RegExp(`^object:${objectName}:`));
    } else {
      this.invalidatePattern(/^object:/);
    }
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
    logger.debug('Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      size: this.cache.size,
      hitRate: total > 0 ? this.stats.hits / total : 0
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = { hits: 0, misses: 0, evictions: 0 };
  }

  /**
   * Get or set with callback (cache-aside pattern)
   */
  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlSeconds?: number
  ): Promise<T> {
    // Check cache first
    const cached = this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    // Fetch and cache
    const value = await fetchFn();
    this.set(key, value, ttlSeconds);
    return value;
  }

  /**
   * Cache key generators for consistent naming
   */
  static keys = {
    sceneInfo: () => 'scene:info',
    objectInfo: (name: string) => `object:${name}:info`,
    objectList: () => 'scene:objects',
    materialList: () => 'scene:materials',
    collectionList: () => 'scene:collections'
  };

  private isExpired(entry: CacheEntry<unknown>): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    let lowestHits = Infinity;

    // Find entry with lowest hits (LRU approximation)
    for (const [key, entry] of this.cache.entries()) {
      // Prioritize expired entries for eviction
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        this.stats.evictions++;
        logger.debug('Evicted expired entry', { key });
        return;
      }

      // Then look for least used
      if (entry.hits < lowestHits || (entry.hits === lowestHits && entry.timestamp < oldestTime)) {
        oldestKey = key;
        oldestTime = entry.timestamp;
        lowestHits = entry.hits;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
      logger.debug('Evicted LRU entry', { key: oldestKey });
    }
  }
}

// Singleton instance
let cacheInstance: ResponseCache | null = null;

export function getCache(): ResponseCache {
  if (!cacheInstance) {
    cacheInstance = new ResponseCache();
  }
  return cacheInstance;
}

export { ResponseCache };
