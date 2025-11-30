#!/usr/bin/env node
/**
 * ClaudeKit Blender MCP Server
 *
 * Standalone MCP server for Blender 3D integration via TCP socket.
 * Provides 18+ tools for scene manipulation, asset integration, and AI-driven 3D generation.
 *
 * @packageDocumentation
 * @module ClaudeKitBlenderMCP
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { logger } from './utils/logger.js';
import { getConfig } from './utils/config.js';
import {
  setupGracefulShutdown,
  registerShutdownHandler,
  performHealthCheck,
  getUptime,
  HealthStatus
} from './utils/health.js';
import { getMetrics } from './utils/metrics.js';

/**
 * Health check interval in milliseconds (5 minutes)
 * Can be overridden by HEALTH_CHECK_INTERVAL_MS environment variable
 */
const HEALTH_CHECK_INTERVAL_MS = parseInt(
  process.env.HEALTH_CHECK_INTERVAL_MS || '300000',
  10
);

/**
 * Reference to health check interval for cleanup on shutdown
 */
let healthCheckInterval: NodeJS.Timeout | null = null;

/**
 * Counter for consecutive health check failures (for alerting)
 */
let consecutiveHealthCheckFailures = 0;
const MAX_CONSECUTIVE_FAILURES_BEFORE_WARN = 3;

/**
 * Main entry point for the ClaudeKit Blender MCP Server
 *
 * Initializes configuration, sets up graceful shutdown handlers,
 * creates the MCP server, and connects to the stdio transport.
 *
 * @returns Promise that resolves when server is running
 */
async function main(): Promise<void> {
  // Setup graceful shutdown handlers
  setupGracefulShutdown();

  // Load and validate configuration
  const config = getConfig();

  logger.info('Starting ClaudeKit Blender MCP Server...', {
    blenderHost: config.blender.host,
    blenderPort: config.blender.port,
    cacheEnabled: config.cache.enabled,
    rateLimitEnabled: config.rateLimit.enabled
  });

  const server = createServer();
  const transport = new StdioServerTransport();

  // Register server disconnect as shutdown handler
  registerShutdownHandler('mcp-server', async () => {
    logger.info('Disconnecting MCP server...');
    await server.close();
  }, 10);

  await server.connect(transport);

  // Perform initial health check
  const initialHealth = await performHealthCheck(false);
  logger.info('ClaudeKit Blender MCP Server running on stdio transport', {
    status: initialHealth.status,
    version: initialHealth.version
  });

  // Start periodic health check with proper error handling (RUNTIME_001 fix)
  healthCheckInterval = setInterval(async () => {
    try {
      const uptime = getUptime();

      // Perform FRESH health check - not using stale data
      const currentHealth = await performHealthCheck(false);

      // Reset failure counter on success
      consecutiveHealthCheckFailures = 0;

      logger.debug('Periodic health check', {
        uptime: uptime.formatted,
        status: currentHealth.status,
        components: currentHealth.components.length
      });

      // Warn on degraded/unhealthy status
      if (currentHealth.status === HealthStatus.UNHEALTHY) {
        logger.warn('Service unhealthy', {
          components: currentHealth.components
            .filter(c => c.status === HealthStatus.UNHEALTHY)
            .map(c => c.name)
        });
      } else if (currentHealth.status === HealthStatus.DEGRADED) {
        logger.warn('Service degraded', {
          components: currentHealth.components
            .filter(c => c.status === HealthStatus.DEGRADED)
            .map(c => c.name)
        });
      }

    } catch (error) {
      // CRITICAL: Log error but DO NOT crash server (RUNTIME_001 fix)
      consecutiveHealthCheckFailures++;

      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      logger.error('Health check failed', error instanceof Error ? error : new Error(errorMessage), {
        consecutiveFailures: consecutiveHealthCheckFailures,
        operation: 'periodic_health_check'
      });

      // Record metric for monitoring
      try {
        getMetrics().recordError('health_check_failure');
      } catch {
        // Ignore metric recording failures
      }

      // Escalate warning after multiple consecutive failures
      if (consecutiveHealthCheckFailures >= MAX_CONSECUTIVE_FAILURES_BEFORE_WARN) {
        logger.warn('Multiple consecutive health check failures', {
          consecutiveFailures: consecutiveHealthCheckFailures,
          lastError: errorMessage
        });
      }
    }
  }, HEALTH_CHECK_INTERVAL_MS);

  // Register shutdown handler to clear health check interval
  registerShutdownHandler('health-check-interval', async () => {
    if (healthCheckInterval) {
      clearInterval(healthCheckInterval);
      healthCheckInterval = null;
      logger.debug('Health check interval cleared');
    }
  }, 5); // Higher priority (lower number) to clear early
}

main().catch((error) => {
  logger.error('Fatal server error', error instanceof Error ? error : new Error(String(error)));
  process.exit(1);
});