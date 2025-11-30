import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getBlenderClient } from '../utils/socket-client.js';
import { ResponseFormat, type ToolResult } from '../types/index.js';
import { formatResponse, formatSceneInfoMarkdown, formatObjectInfoMarkdown } from '../utils/formatters.js';

// Schemas
const GetSceneInfoSchema = z.object({
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe('Output format: markdown or json')
}).strict();

const GetObjectInfoSchema = z.object({
  object_name: z.string()
    .min(1, 'Object name required')
    .describe('Name of object to query'),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe('Output format: markdown or json')
}).strict();

export function registerSceneTools(server: McpServer) {
  // Tool 1: Get Scene Info
  server.registerTool(
    'blender_get_scene_info',
    {
      title: 'Get Blender Scene Info',
      description: `Query current Blender scene hierarchy, objects list, materials, and world settings.

Returns complete scene metadata including all objects, their types, transforms, materials, and collections.

Args:
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  For JSON: { objects: [...], materials: [...], collections: [...], world: {...} }
  For markdown: Formatted hierarchy with object details

Use when: Need to understand current scene state, find object names, or verify scene setup
Don't use when: Modifying scene (use create/modify tools instead)`,
      inputSchema: GetSceneInfoSchema,
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
        const response = await client.sendCommand('get_scene_info');

        if (response.status === 'error') {
          return {
            content: [{
              type: 'text',
              text: `Error: ${response.message || 'Failed to get scene info'}`
            }]
          };
        }

        const formatted = formatResponse(
          response.result,
          params.response_format,
          formatSceneInfoMarkdown
        );

        return {
          content: [{ type: 'text', text: formatted }]
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

  // Tool 2: Get Object Info
  server.registerTool(
    'blender_get_object_info',
    {
      title: 'Get Blender Object Info',
      description: `Query detailed properties of specific Blender object by name.

Returns object type, transforms (location/rotation/scale), bounding box, materials, modifiers, and parent/children relationships.

Args:
  - object_name (string): Name of object to query (e.g., "Cube", "Camera")
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  For JSON: { name, type, location: [x,y,z], rotation: [...], scale: [...], materials: [...], ... }
  For markdown: Formatted object details

Use when: Need specific object details before modifying
Don't use when: Querying entire scene (use blender_get_scene_info instead)

Error: Returns "Object not found" if object_name doesn't exist`,
      inputSchema: GetObjectInfoSchema,
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
        const response = await client.sendCommand('get_object_info', {
          object_name: params.object_name
        });

        if (response.status === 'error') {
          return {
            content: [{
              type: 'text',
              text: `Error: ${response.message || 'Failed to get object info'}`
            }]
          };
        }

        const formatted = formatResponse(
          response.result,
          params.response_format,
          formatObjectInfoMarkdown
        );

        return {
          content: [{ type: 'text', text: formatted }]
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