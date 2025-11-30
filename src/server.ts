import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerCoreTools, registerAssetIntegrationTools } from './tools/index.js';

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'claudekit-blender-mcp',
    version: '1.0.0'
  });

  registerCoreTools(server);
  registerAssetIntegrationTools(server);

  return server;
}