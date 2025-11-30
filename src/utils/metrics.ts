/**
 * Comprehensive Monitoring and Metrics System for ClaudeKit Blender MCP
 *
 * Provides:
 * - Request/response timing metrics
 * - Error tracking and categorization
 * - Tool usage statistics
 * - Performance histograms
 * - Health check endpoints
 */

import { logger } from './logger.js';
import { getCache } from './cache.js';
import { getRateLimiter } from './rate-limiter.js';
import { getConnectionPool } from './connection-pool.js';

interface MetricValue {
  count: number;
  total: number;
  min: number;
  max: number;
  lastValue: number;
  lastUpdated: number;
}

interface ErrorMetric {
  count: number;
  lastError: string;
  lastOccurred: number;
  errorTypes: Map<string, number>;
}

interface ToolMetric {
  invocations: number;
  successes: number;
  failures: number;
  totalDurationMs: number;
  avgDurationMs: number;
  lastInvoked: number;
}

export interface HealthStatus {
  healthy: boolean;
  timestamp: string;
  uptime: number;
  checks: {
    blenderConnection: { status: 'up' | 'down' | 'unknown'; latencyMs?: number };
    memoryUsage: { status: 'ok' | 'warning' | 'critical'; usedMb: number; percentUsed: number };
    errorRate: { status: 'ok' | 'warning' | 'critical'; rate: number };
  };
}

export interface MetricsSummary {
  /** RACE_CONDITION_004 FIX: Timestamp when summary was generated */
  timestamp: string;
  uptime: number;
  requests: {
    total: number;
    successful: number;
    failed: number;
    avgLatencyMs: number;
  };
  tools: Record<string, ToolMetric>;
  errors: {
    total: number;
    byType: Record<string, number>;
    recentErrors: Array<{ message: string; timestamp: string }>;
  };
  cache: {
    hits: number;
    misses: number;
    hitRate: number;
  };
  rateLimit: {
    currentConcurrency: number;
    maxConcurrency: number;
  };
  connectionPool: {
    totalConnections: number;
    activeConnections: number;
    idleConnections: number;
  };
}

class MetricsCollector {
  private startTime: number = Date.now();
  private metrics: Map<string, MetricValue> = new Map();
  private errors: ErrorMetric = {
    count: 0,
    lastError: '',
    lastOccurred: 0,
    errorTypes: new Map()
  };
  private toolMetrics: Map<string, ToolMetric> = new Map();
  private recentErrors: Array<{ message: string; timestamp: number }> = [];
  private readonly maxRecentErrors = 100;

  /**
   * Record a timing metric
   */
  recordTiming(name: string, durationMs: number): void {
    const metric = this.getOrCreateMetric(name);
    metric.count++;
    metric.total += durationMs;
    metric.min = Math.min(metric.min, durationMs);
    metric.max = Math.max(metric.max, durationMs);
    metric.lastValue = durationMs;
    metric.lastUpdated = Date.now();
  }

  /**
   * Record a counter increment
   */
  incrementCounter(name: string, value: number = 1): void {
    const metric = this.getOrCreateMetric(name);
    metric.count += value;
    metric.lastValue = value;
    metric.lastUpdated = Date.now();
  }

  /**
   * Record a tool invocation
   */
  recordToolInvocation(
    toolName: string,
    success: boolean,
    durationMs: number
  ): void {
    let toolMetric = this.toolMetrics.get(toolName);
    if (!toolMetric) {
      toolMetric = {
        invocations: 0,
        successes: 0,
        failures: 0,
        totalDurationMs: 0,
        avgDurationMs: 0,
        lastInvoked: 0
      };
      this.toolMetrics.set(toolName, toolMetric);
    }

    toolMetric.invocations++;
    toolMetric.totalDurationMs += durationMs;
    toolMetric.avgDurationMs = toolMetric.totalDurationMs / toolMetric.invocations;
    toolMetric.lastInvoked = Date.now();

    if (success) {
      toolMetric.successes++;
    } else {
      toolMetric.failures++;
    }

    // Record global timing
    this.recordTiming('tool.duration', durationMs);
    this.incrementCounter(success ? 'tool.success' : 'tool.failure');
  }

  /**
   * Record an error
   */
  recordError(error: Error | string, category: string = 'unknown'): void {
    const errorMessage = error instanceof Error ? error.message : error;

    this.errors.count++;
    this.errors.lastError = errorMessage;
    this.errors.lastOccurred = Date.now();

    // Track by category
    const currentCount = this.errors.errorTypes.get(category) || 0;
    this.errors.errorTypes.set(category, currentCount + 1);

    // MEMORY_LEAK_004 FIX: Trim array BEFORE adding if at capacity
    // This prevents temporary array growth to maxRecentErrors + 1
    if (this.recentErrors.length >= this.maxRecentErrors) {
      this.recentErrors.shift(); // Remove oldest first
    }

    // Add to recent errors
    this.recentErrors.push({
      message: errorMessage,
      timestamp: Date.now()
    });

    this.incrementCounter('error.total');
    this.incrementCounter(`error.${category}`);

    logger.debug('Error recorded', { category, message: errorMessage });
  }

  /**
   * Get health status
   */
  async getHealthStatus(): Promise<HealthStatus> {
    const now = Date.now();
    const uptime = now - this.startTime;

    // Check memory usage
    const memUsage = process.memoryUsage();
    const usedMb = Math.round(memUsage.heapUsed / 1024 / 1024);
    const totalMb = Math.round(memUsage.heapTotal / 1024 / 1024);
    const percentUsed = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);

    let memoryStatus: 'ok' | 'warning' | 'critical' = 'ok';
    if (percentUsed > 90) memoryStatus = 'critical';
    else if (percentUsed > 75) memoryStatus = 'warning';

    // Check error rate (errors in last minute)
    const oneMinuteAgo = now - 60000;
    const recentErrorCount = this.recentErrors.filter(e => e.timestamp > oneMinuteAgo).length;
    let errorRateStatus: 'ok' | 'warning' | 'critical' = 'ok';
    if (recentErrorCount > 50) errorRateStatus = 'critical';
    else if (recentErrorCount > 20) errorRateStatus = 'warning';

    // Check Blender connection
    let blenderStatus: 'up' | 'down' | 'unknown' = 'unknown';
    let blenderLatency: number | undefined;

    try {
      const pool = getConnectionPool();
      const stats = pool.getStats();
      if (stats.totalConnections > 0) {
        blenderStatus = 'up';
      }
    } catch {
      blenderStatus = 'down';
    }

    const allHealthy =
      blenderStatus !== 'down' &&
      memoryStatus !== 'critical' &&
      errorRateStatus !== 'critical';

    return {
      healthy: allHealthy,
      timestamp: new Date().toISOString(),
      uptime,
      checks: {
        blenderConnection: {
          status: blenderStatus,
          latencyMs: blenderLatency
        },
        memoryUsage: {
          status: memoryStatus,
          usedMb,
          percentUsed
        },
        errorRate: {
          status: errorRateStatus,
          rate: recentErrorCount
        }
      }
    };
  }

  /**
   * Get comprehensive metrics summary
   *
   * RACE_CONDITION_004 FIX: Capture timestamp once at start for consistency.
   * This prevents timing inconsistencies when concurrent timeOperation()
   * calls modify metrics during summary generation.
   */
  getSummary(): MetricsSummary {
    // Capture timestamp once at start for consistency
    const now = Date.now();
    const uptime = now - this.startTime;

    // Get tool metrics
    const tools: Record<string, ToolMetric> = {};
    for (const [name, metric] of this.toolMetrics.entries()) {
      tools[name] = { ...metric };
    }

    // Get error breakdown
    const errorsByType: Record<string, number> = {};
    for (const [type, count] of this.errors.errorTypes.entries()) {
      errorsByType[type] = count;
    }

    // Get recent errors (last 10)
    const recentErrors = this.recentErrors
      .slice(-10)
      .map(e => ({
        message: e.message,
        timestamp: new Date(e.timestamp).toISOString()
      }));

    // Get cache stats
    let cacheStats = { hits: 0, misses: 0, hitRate: 0 };
    try {
      const cache = getCache();
      cacheStats = cache.getStats();
    } catch {
      // Cache not available
    }

    // Get rate limiter stats
    let rateLimitStats = { concurrentRequests: 0, maxConcurrent: 0 };
    try {
      const rateLimiter = getRateLimiter();
      rateLimitStats = rateLimiter.getStats();
    } catch {
      // Rate limiter not available
    }

    // Get connection pool stats
    let poolStats = { totalConnections: 0, activeConnections: 0, idleConnections: 0 };
    try {
      const pool = getConnectionPool();
      poolStats = pool.getStats();
    } catch {
      // Pool not available
    }

    // Calculate request totals
    const successCount = this.getMetric('tool.success')?.count || 0;
    const failureCount = this.getMetric('tool.failure')?.count || 0;
    const durationMetric = this.getMetric('tool.duration');
    const avgLatency = durationMetric && durationMetric.count > 0
      ? Math.round(durationMetric.total / durationMetric.count)
      : 0;

    return {
      // RACE_CONDITION_004 FIX: Include timestamp for debugging and consistency
      timestamp: new Date(now).toISOString(),
      uptime,
      requests: {
        total: successCount + failureCount,
        successful: successCount,
        failed: failureCount,
        avgLatencyMs: avgLatency
      },
      tools,
      errors: {
        total: this.errors.count,
        byType: errorsByType,
        recentErrors
      },
      cache: {
        hits: cacheStats.hits,
        misses: cacheStats.misses,
        hitRate: cacheStats.hitRate
      },
      rateLimit: {
        currentConcurrency: rateLimitStats.concurrentRequests,
        maxConcurrency: rateLimitStats.maxConcurrent
      },
      connectionPool: {
        totalConnections: poolStats.totalConnections,
        activeConnections: poolStats.activeConnections,
        idleConnections: poolStats.idleConnections
      }
    };
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics.clear();
    this.toolMetrics.clear();
    this.errors = {
      count: 0,
      lastError: '',
      lastOccurred: 0,
      errorTypes: new Map()
    };
    this.recentErrors = [];
    this.startTime = Date.now();
    logger.info('Metrics reset');
  }

  /**
   * Time an async operation and record metrics
   */
  async timeOperation<T>(
    name: string,
    operation: () => Promise<T>,
    toolName?: string
  ): Promise<T> {
    const start = performance.now();
    let success = true;

    try {
      return await operation();
    } catch (error) {
      success = false;
      this.recordError(error instanceof Error ? error : new Error(String(error)), name);
      throw error;
    } finally {
      const duration = Math.round(performance.now() - start);
      this.recordTiming(name, duration);

      if (toolName) {
        this.recordToolInvocation(toolName, success, duration);
      }
    }
  }

  private getOrCreateMetric(name: string): MetricValue {
    let metric = this.metrics.get(name);
    if (!metric) {
      metric = {
        count: 0,
        total: 0,
        min: Infinity,
        max: -Infinity,
        lastValue: 0,
        lastUpdated: Date.now()
      };
      this.metrics.set(name, metric);
    }
    return metric;
  }

  private getMetric(name: string): MetricValue | undefined {
    return this.metrics.get(name);
  }
}

// Singleton instance
let metricsInstance: MetricsCollector | null = null;

export function getMetrics(): MetricsCollector {
  if (!metricsInstance) {
    metricsInstance = new MetricsCollector();
  }
  return metricsInstance;
}

export { MetricsCollector };
