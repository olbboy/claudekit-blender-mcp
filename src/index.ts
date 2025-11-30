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
  getUptime
} from './utils/health.js';

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

  // Log startup health status
  const health = await performHealthCheck(false);
  logger.info('ClaudeKit Blender MCP Server running on stdio transport', {
    status: health.status,
    version: health.version
  });

  // Log periodic health status (every 5 minutes)
  setInterval(async () => {
    const uptime = getUptime();
    logger.debug('Server health check', {
      uptime: uptime.formatted,
      ...health.metrics
    });
  }, 300000);
}

main().catch((error) => {
  logger.error('Fatal server error', error instanceof Error ? error : new Error(String(error)));
  process.exit(1);
});