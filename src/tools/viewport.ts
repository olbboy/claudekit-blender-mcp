import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getBlenderClient } from '../utils/socket-client.js';
import { screenshotSizeSchema } from '../utils/validators.js';
import type { ToolResult } from '../types/index.js';

const GetScreenshotSchema = z.object({
  max_size: screenshotSizeSchema.default(800).describe('Max dimension in pixels (100-800)')
}).strict();

export function registerViewportTools(server: McpServer) {
  // Tool 9: Get Screenshot
  server.registerTool(
    'blender_get_screenshot',
    {
      title: 'Capture Viewport Screenshot',
      description: `Capture current viewport as base64 image.

Takes screenshot of current 3D viewport view. Limited to 800px max dimension for performance.

Args:
  - max_size (optional): Maximum dimension in pixels (100-800, default: 800)

Returns:
  Base64 encoded image data with metadata

Use when: Visualizing scene state, checking results, debugging
Don't use when: Need high resolution renders (use Blender render instead)

Performance: Larger images take longer to process and transfer`,
      inputSchema: GetScreenshotSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params): Promise<ToolResult> => {
      try {
        const client = getBlenderClient();
        const response = await client.sendCommand('get_screenshot', {
          max_size: params.max_size
        });

        if (response.status === 'error') {
          return {
            content: [{ type: 'text', text: `Error: ${response.message || 'Failed to capture screenshot'}` }]
          };
        }

        return {
          content: [{
            type: 'text',
            text: `Successfully captured viewport screenshot (${params.max_size}px max dimension)`
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