/**
 * Development Tools for ClaudeKit Blender MCP
 *
 * Provides debugging utilities:
 * - Request/response inspection
 * - Socket traffic logging
 * - Performance profiling
 * - State inspection
 */

import { logger } from './logger.js';
import { getMetrics } from './metrics.js';
import { getCache } from './cache.js';
import { getRateLimiter } from './rate-limiter.js';
import { getConfig } from './config.js';

// Check if we're in development mode
const isDev = process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true';

/**
 * Request inspector for debugging
 */
export interface RequestLog {
  id: string;
  timestamp: string;
  tool: string;
  params: Record<string, unknown>;
  duration?: number;
  success?: boolean;
  error?: string;
  response?: unknown;
}

class RequestInspector {
  private requests: RequestLog[] = [];
  private maxLogs = 100;
  private enabled = isDev;
  private requestCounter = 0;

  enable(): void {
    this.enabled = true;
    logger.info('Request inspector enabled');
  }

  disable(): void {
    this.enabled = false;
    logger.info('Request inspector disabled');
  }

  logRequest(tool: string, params: Record<string, unknown>): string {
    if (!this.enabled) return '';

    const id = `req-${++this.requestCounter}`;
    const log: RequestLog = {
      id,
      timestamp: new Date().toISOString(),
      tool,
      params: this.sanitizeParams(params)
    };

    this.requests.push(log);

    // Trim old logs
    if (this.requests.length > this.maxLogs) {
      this.requests = this.requests.slice(-this.maxLogs);
    }

    logger.debug(`[DEV] Request: ${tool}`, { requestId: id, params: log.params });

    return id;
  }

  logResponse(requestId: string, success: boolean, duration: number, response?: unknown, error?: string): void {
    if (!this.enabled || !requestId) return;

    const log = this.requests.find(r => r.id === requestId);
    if (log) {
      log.success = success;
      log.duration = duration;
      log.error = error;

      // Truncate large responses
      if (response) {
        const responseStr = JSON.stringify(response);
        log.response = responseStr.length > 1000
          ? JSON.parse(responseStr.substring(0, 1000) + '...')
          : response;
      }

      logger.debug(`[DEV] Response: ${log.tool}`, {
        requestId,
        success,
        duration,
        error
      });
    }
  }

  getRecentRequests(limit: number = 10): RequestLog[] {
    return this.requests.slice(-limit);
  }

  getRequest(id: string): RequestLog | undefined {
    return this.requests.find(r => r.id === id);
  }

  getFailedRequests(): RequestLog[] {
    return this.requests.filter(r => r.success === false);
  }

  getSlowestRequests(limit: number = 5): RequestLog[] {
    return [...this.requests]
      .filter(r => r.duration !== undefined)
      .sort((a, b) => (b.duration || 0) - (a.duration || 0))
      .slice(0, limit);
  }

  clear(): void {
    this.requests = [];
    this.requestCounter = 0;
    logger.debug('[DEV] Request logs cleared');
  }

  private sanitizeParams(params: Record<string, unknown>): Record<string, unknown> {
    const sanitized = { ...params };

    // Truncate long code strings
    if (typeof sanitized.code === 'string' && sanitized.code.length > 200) {
      sanitized.code = sanitized.code.substring(0, 200) + '... (truncated)';
    }

    return sanitized;
  }
}

/**
 * Performance profiler for debugging
 */
class PerformanceProfiler {
  private profiles: Map<string, {
    samples: number[];
    totalTime: number;
    calls: number;
  }> = new Map();
  private enabled = isDev;

  enable(): void {
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
  }

  startProfile(name: string): () => void {
    if (!this.enabled) return () => {};

    const start = performance.now();
    return () => {
      const duration = performance.now() - start;
      this.recordProfile(name, duration);
    };
  }

  recordProfile(name: string, durationMs: number): void {
    if (!this.enabled) return;

    let profile = this.profiles.get(name);
    if (!profile) {
      profile = { samples: [], totalTime: 0, calls: 0 };
      this.profiles.set(name, profile);
    }

    profile.samples.push(durationMs);
    profile.totalTime += durationMs;
    profile.calls++;

    // Keep only last 100 samples
    if (profile.samples.length > 100) {
      profile.samples = profile.samples.slice(-100);
    }
  }

  getProfile(name: string): {
    avgMs: number;
    minMs: number;
    maxMs: number;
    totalMs: number;
    calls: number;
    p95Ms: number;
  } | undefined {
    const profile = this.profiles.get(name);
    if (!profile || profile.samples.length === 0) return undefined;

    const sorted = [...profile.samples].sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);

    return {
      avgMs: Math.round(profile.totalTime / profile.calls),
      minMs: Math.round(sorted[0]),
      maxMs: Math.round(sorted[sorted.length - 1]),
      totalMs: Math.round(profile.totalTime),
      calls: profile.calls,
      p95Ms: Math.round(sorted[p95Index] || sorted[sorted.length - 1])
    };
  }

  getAllProfiles(): Record<string, ReturnType<typeof this.getProfile>> {
    const result: Record<string, ReturnType<typeof this.getProfile>> = {};
    for (const name of this.profiles.keys()) {
      result[name] = this.getProfile(name);
    }
    return result;
  }

  clear(): void {
    this.profiles.clear();
  }
}

/**
 * State inspector for debugging
 */
export function inspectState(): {
  config: ReturnType<typeof getConfig>;
  cache: {
    stats: ReturnType<ReturnType<typeof getCache>['getStats']>;
  };
  rateLimit: ReturnType<ReturnType<typeof getRateLimiter>['getStats']>;
  metrics: ReturnType<ReturnType<typeof getMetrics>['getSummary']>;
} {
  const cache = getCache();
  const rateLimiter = getRateLimiter();
  const metrics = getMetrics();
  const config = getConfig();

  return {
    config,
    cache: {
      stats: cache.getStats()
    },
    rateLimit: rateLimiter.getStats(),
    metrics: metrics.getSummary()
  };
}

/**
 * Debug command executor
 */
export async function executeDebugCommand(command: string): Promise<unknown> {
  const parts = command.trim().split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);

  switch (cmd) {
    case 'state':
      return inspectState();

    case 'metrics':
      return getMetrics().getSummary();

    case 'health':
      return await getMetrics().getHealthStatus();

    case 'cache':
      if (args[0] === 'clear') {
        getCache().clear();
        return { message: 'Cache cleared' };
      }
      return getCache().getStats();

    case 'ratelimit':
      if (args[0] === 'reset') {
        getRateLimiter().reset();
        return { message: 'Rate limiter reset' };
      }
      return getRateLimiter().getStats();

    case 'requests':
      return requestInspector.getRecentRequests(parseInt(args[0]) || 10);

    case 'failed':
      return requestInspector.getFailedRequests();

    case 'slow':
      return requestInspector.getSlowestRequests(parseInt(args[0]) || 5);

    case 'profiles':
      return profiler.getAllProfiles();

    case 'help':
      return {
        commands: [
          'state - Show full system state',
          'metrics - Show metrics summary',
          'health - Show health status',
          'cache [clear] - Show cache stats or clear cache',
          'ratelimit [reset] - Show rate limit stats or reset',
          'requests [count] - Show recent requests',
          'failed - Show failed requests',
          'slow [count] - Show slowest requests',
          'profiles - Show performance profiles',
          'help - Show this help'
        ]
      };

    default:
      return { error: `Unknown command: ${cmd}. Use 'help' for available commands.` };
  }
}

// Create singleton instances
export const requestInspector = new RequestInspector();
export const profiler = new PerformanceProfiler();

// Export types
export type { RequestInspector, PerformanceProfiler };
