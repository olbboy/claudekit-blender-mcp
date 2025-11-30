#!/usr/bin/env node
/**
 * ClaudeKit Blender MCP Server
 *
 * Standalone MCP server for Blender 3D integration via TCP socket.
 * Provides 18+ tools for scene manipulation, asset integration, and AI-driven 3D generation.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

async function main() {
  console.error('Starting ClaudeKit Blender MCP Server...');

  const server = createServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);

  console.error('ClaudeKit Blender MCP Server running on stdio transport');
}

main().catch((error) => {
  console.error('Fatal server error:', error);
  process.exit(1);
});