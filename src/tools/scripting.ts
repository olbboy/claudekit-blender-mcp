import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getBlenderClient } from '../utils/socket-client.js';
import type { ToolResult } from '../types/index.js';

const ExecuteCodeSchema = z.object({
  code: z.string().min(1).describe('Python code using bpy API'),
  timeout: z.number().int().min(1000).max(180000).optional().describe('Execution timeout (ms)')
}).strict();

export function registerScriptingTools(server: McpServer) {
  // Tool 10: Execute Python Code
  server.registerTool(
    'blender_execute_code',
    {
      title: 'Execute Blender Python Code',
      description: `Execute Python code using Blender's bpy API.

Provides escape hatch for complex operations not covered by other tools. Use full bpy API access.

Args:
  - code (string): Python code to execute using bpy API
  - timeout (optional): Execution timeout in milliseconds (1000-180000, default: 180000)

Returns:
  Execution result or error message

Examples:
  - List objects: bpy.data.objects
  - Create custom mesh: bpy.ops.mesh.primitive_cube_add(location=(1, 2, 3))

Use when: Complex operations, custom workflows, bpy API access
Don't use when: Simple operations covered by dedicated tools

Security: Code executes with full Blender API access
Performance: Long-running code may hit timeout limits`,
      inputSchema: ExecuteCodeSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async (params): Promise<ToolResult> => {
      try {
        const client = getBlenderClient();
        const response = await client.sendCommand('execute_blender_code', {
          code: params.code,
          timeout: params.timeout
        });

        if (response.status === 'error') {
          return {
            content: [{
              type: 'text',
              text: `Error: ${response.message || 'Failed to execute Python code'}`
            }]
          };
        }

        return {
          content: [{
            type: 'text',
            text: `Successfully executed Python code`
          }]
        };

      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
          }]
        };
      }
    }
  );
}