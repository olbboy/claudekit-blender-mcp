/**
 * Health Check and Graceful Shutdown
 *
 * Provides health monitoring, readiness checks, and graceful shutdown
 * functionality for the MCP server.
 */

import { logger } from './logger.js';
import { getMetrics } from './metrics.js';
import { getCache } from './cache.js';
import { getRateLimiter } from './rate-limiter.js';
import { getConfig } from './config.js';
import { BlenderSocketClient } from './socket-client.js';

/**
 * Health status levels
 */
export enum HealthStatus {
  /** System is fully operational */
  HEALTHY = 'healthy',
  /** System is operational but with issues */
  DEGRADED = 'degraded',
  /** System is not operational */
  UNHEALTHY = 'unhealthy'
}

/**
 * Component health check result
 */
export interface ComponentHealth {
  /** Component name */
  name: string;
  /** Health status */
  status: HealthStatus;
  /** Optional message */
  message?: string;
  /** Response time in ms */
  responseTimeMs?: number;
  /** Additional details */
  details?: Record<string, unknown>;
}

/**
 * Overall system health result
 */
export interface SystemHealth {
  /** Overall status */
  status: HealthStatus;
  /** Server uptime in seconds */
  uptimeSeconds: number;
  /** Timestamp of the check */
  timestamp: string;
  /** Version information */
  version: string;
  /** Individual component health */
  components: ComponentHealth[];
  /** System metrics summary */
  metrics?: Record<string, unknown>;
}

// Server start time for uptime calculation
const serverStartTime = Date.now();

// Shutdown handlers registry
const shutdownHandlers: Array<{
  name: string;
  handler: () => Promise<void>;
  priority: number;
}> = [];

// Shutdown state
let isShuttingDown = false;

/**
 * Check Blender connection health
 *
 * ASYNC_RACE_003 FIX: Always disconnect in finally block to prevent
 * orphaned connections when health check fails or errors.
 *
 * @returns Component health result
 */
async function checkBlenderConnection(): Promise<ComponentHealth> {
  const startTime = Date.now();
  const config = getConfig();

  const client = new BlenderSocketClient(
    config.blender.host,
    config.blender.port,
    5000 // Short timeout for health check
  );

  try {
    await client.connect();
    const response = await client.sendCommand('get_scene_info');

    const responseTime = Date.now() - startTime;

    if (response.status === 'success') {
      return {
        name: 'blender_connection',
        status: HealthStatus.HEALTHY,
        message: 'Connected to Blender',
        responseTimeMs: responseTime,
        details: {
          host: config.blender.host,
          port: config.blender.port
        }
      };
    } else {
      return {
        name: 'blender_connection',
        status: HealthStatus.DEGRADED,
        message: response.message || 'Blender returned error',
        responseTimeMs: responseTime
      };
    }
  } catch (error) {
    return {
      name: 'blender_connection',
      status: HealthStatus.UNHEALTHY,
      message: error instanceof Error ? error.message : 'Connection failed',
      responseTimeMs: Date.now() - startTime,
      details: {
        host: config.blender.host,
        port: config.blender.port
      }
    };
  } finally {
    // ASYNC_RACE_003 FIX: Always disconnect, even if error occurs
    try {
      await client.disconnect();
    } catch (disconnectError) {
      // Log but don't rethrow - health check result already determined
      logger.debug('Error disconnecting health check client', {
        operation: 'checkBlenderConnection',
        error: disconnectError instanceof Error
          ? disconnectError.message
          : String(disconnectError)
      });
    }
  }
}

/**
 * Check memory usage health
 * @returns Component health result
 */
function checkMemoryUsage(): ComponentHealth {
  const memUsage = process.memoryUsage();
  const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
  const percentUsed = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);

  let status = HealthStatus.HEALTHY;
  let message = 'Memory usage normal';

  if (percentUsed > 90) {
    status = HealthStatus.UNHEALTHY;
    message = 'Critical memory usage';
  } else if (percentUsed > 75) {
    status = HealthStatus.DEGRADED;
    message = 'High memory usage';
  }

  return {
    name: 'memory',
    status,
    message,
    details: {
      heapUsedMB,
      heapTotalMB,
      percentUsed,
      rssMB: Math.round(memUsage.rss / 1024 / 1024),
      externalMB: Math.round(memUsage.external / 1024 / 1024)
    }
  };
}

/**
 * Check cache health
 * @returns Component health result
 */
function checkCacheHealth(): ComponentHealth {
  const config = getConfig();

  if (!config.cache.enabled) {
    return {
      name: 'cache',
      status: HealthStatus.HEALTHY,
      message: 'Cache disabled'
    };
  }

  const cache = getCache();
  const stats = cache.getStats();

  return {
    name: 'cache',
    status: HealthStatus.HEALTHY,
    message: 'Cache operational',
    details: {
      size: stats.size,
      hits: stats.hits,
      misses: stats.misses,
      hitRate: stats.hitRate,
      evictions: stats.evictions
    }
  };
}

/**
 * Check rate limiter health
 * @returns Component health result
 */
function checkRateLimiterHealth(): ComponentHealth {
  const config = getConfig();

  if (!config.rateLimit.enabled) {
    return {
      name: 'rate_limiter',
      status: HealthStatus.HEALTHY,
      message: 'Rate limiter disabled'
    };
  }

  const rateLimiter = getRateLimiter();
  const stats = rateLimiter.getStats();

  const status = HealthStatus.HEALTHY;
  const message = 'Rate limiter operational';

  return {
    name: 'rate_limiter',
    status,
    message,
    details: {
      concurrentRequests: stats.concurrentRequests,
      maxConcurrent: stats.maxConcurrent,
      bucketCount: stats.bucketCount
    }
  };
}

/**
 * Perform a comprehensive health check
 * @param includeBlender - Whether to check Blender connection
 * @returns System health result
 */
export async function performHealthCheck(includeBlender = true): Promise<SystemHealth> {
  const components: ComponentHealth[] = [];

  // Always check local components
  components.push(checkMemoryUsage());
  components.push(checkCacheHealth());
  components.push(checkRateLimiterHealth());

  // Optionally check Blender (can be slow)
  if (includeBlender) {
    components.push(await checkBlenderConnection());
  }

  // Determine overall status
  let overallStatus: HealthStatus = HealthStatus.HEALTHY;

  for (const component of components) {
    if (component.status === HealthStatus.UNHEALTHY) {
      overallStatus = HealthStatus.UNHEALTHY;
      break;
    }
    if (component.status === HealthStatus.DEGRADED && overallStatus === HealthStatus.HEALTHY) {
      overallStatus = HealthStatus.DEGRADED;
    }
  }

  // Get metrics summary
  const metricsSummary = getMetrics().getSummary();

  return {
    status: overallStatus,
    uptimeSeconds: Math.floor((Date.now() - serverStartTime) / 1000),
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    components,
    metrics: metricsSummary as unknown as Record<string, unknown>
  };
}

/**
 * Quick liveness check (is the server running?)
 * @returns True if server is alive
 */
export function isAlive(): boolean {
  return !isShuttingDown;
}

/**
 * Quick readiness check (is the server ready to accept requests?)
 * @returns True if server is ready
 */
export async function isReady(): Promise<boolean> {
  if (isShuttingDown) return false;

  // Quick memory check
  const memHealth = checkMemoryUsage();
  return memHealth.status !== HealthStatus.UNHEALTHY;
}

/**
 * Register a shutdown handler
 * @param name - Handler name for logging
 * @param handler - Async function to run during shutdown
 * @param priority - Priority (lower = runs first)
 */
export function registerShutdownHandler(
  name: string,
  handler: () => Promise<void>,
  priority = 100
): void {
  shutdownHandlers.push({ name, handler, priority });
  shutdownHandlers.sort((a, b) => a.priority - b.priority);
  logger.debug(`Registered shutdown handler: ${name} (priority: ${priority})`);
}

/**
 * Perform graceful shutdown
 * @param signal - Signal that triggered shutdown
 * @param exitCode - Exit code to use
 */
export async function gracefulShutdown(signal: string, exitCode = 0): Promise<void> {
  if (isShuttingDown) {
    logger.warn('Shutdown already in progress');
    return;
  }

  isShuttingDown = true;
  logger.info(`Graceful shutdown initiated (signal: ${signal})`);

  const startTime = Date.now();
  const timeoutMs = 30000; // 30 second timeout

  try {
    // Run shutdown handlers in priority order
    for (const { name, handler } of shutdownHandlers) {
      const handlerStart = Date.now();

      try {
        logger.debug(`Running shutdown handler: ${name}`);
        await Promise.race([
          handler(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), 5000)
          )
        ]);
        logger.debug(`Shutdown handler completed: ${name} (${Date.now() - handlerStart}ms)`);
      } catch (error) {
        logger.error(`Shutdown handler failed: ${name}`, error instanceof Error ? error : new Error(String(error)));
      }

      // Check overall timeout
      if (Date.now() - startTime > timeoutMs) {
        logger.warn('Shutdown timeout exceeded, forcing exit');
        break;
      }
    }

    // Clear cache
    try {
      getCache().clear();
      logger.debug('Cache cleared');
    } catch {
      // Ignore cache clear errors
    }

    // Final cleanup
    logger.info(`Graceful shutdown completed in ${Date.now() - startTime}ms`);

  } catch (error) {
    logger.error('Error during shutdown', error instanceof Error ? error : new Error(String(error)));
  } finally {
    process.exit(exitCode);
  }
}

/**
 * Setup process signal handlers for graceful shutdown
 *
 * UNHANDLED_PROMISE_001 FIX: Wrap signal handlers in async IIFE to properly await
 * gracefulShutdown(), ensuring cleanup completes before process exits.
 */
export function setupGracefulShutdown(): void {
  // Handle SIGTERM (docker stop, kubernetes termination)
  process.on('SIGTERM', () => {
    // UNHANDLED_PROMISE_001 FIX: Wrap in async IIFE to await gracefulShutdown
    void (async () => {
      await gracefulShutdown('SIGTERM');
    })();
  });

  // Handle SIGINT (Ctrl+C)
  process.on('SIGINT', () => {
    // UNHANDLED_PROMISE_001 FIX: Wrap in async IIFE to await gracefulShutdown
    void (async () => {
      await gracefulShutdown('SIGINT');
    })();
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', error);
    // UNHANDLED_PROMISE_001 FIX: Wrap in async IIFE to await gracefulShutdown
    void (async () => {
      await gracefulShutdown('uncaughtException', 1);
    })();
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection', reason instanceof Error ? reason : new Error(String(reason)), {
      promise: String(promise)
    });
    // UNHANDLED_PROMISE_001 FIX: Wrap in async IIFE to await gracefulShutdown
    void (async () => {
      await gracefulShutdown('unhandledRejection', 1);
    })();
  });

  logger.info('Graceful shutdown handlers registered');
}

/**
 * Get server uptime in various formats
 * @returns Uptime information
 */
export function getUptime(): {
  seconds: number;
  minutes: number;
  hours: number;
  formatted: string;
} {
  const seconds = Math.floor((Date.now() - serverStartTime) / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes % 60 > 0) parts.push(`${minutes % 60}m`);
  parts.push(`${seconds % 60}s`);

  return {
    seconds,
    minutes,
    hours,
    formatted: parts.join(' ')
  };
}
