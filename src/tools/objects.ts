import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getBlenderClient } from '../utils/socket-client.js';
import { vector3Schema, objectNameSchema } from '../utils/validators.js';
import type { ToolResult } from '../types/index.js';

// Primitive types enum
const PrimitiveType = z.enum([
  'CUBE', 'SPHERE', 'CYLINDER', 'CONE', 'TORUS',
  'PLANE', 'MONKEY', 'UV_SPHERE', 'ICO_SPHERE'
]);

// Schemas
const CreatePrimitiveSchema = z.object({
  primitive_type: PrimitiveType.describe('Type of primitive to create'),
  name: objectNameSchema.optional().describe('Custom object name'),
  location: vector3Schema.optional().describe('Location [x, y, z]'),
  scale: vector3Schema.optional().describe('Scale [x, y, z]')
}).strict();

const ModifyObjectSchema = z.object({
  object_name: objectNameSchema.describe('Object to modify'),
  location: vector3Schema.optional(),
  rotation: vector3Schema.optional().describe('Rotation in radians [x, y, z]'),
  scale: vector3Schema.optional()
}).strict();

const DeleteObjectSchema = z.object({
  object_name: objectNameSchema.describe('Object to delete')
}).strict();

export function registerObjectTools(server: McpServer) {
  // Tool 3: Create Primitive
  server.registerTool(
    'blender_create_primitive',
    {
      title: 'Create Blender Primitive',
      description: `Create basic 3D primitive object in Blender scene.

Creates mesh primitive at specified location with optional custom name and scale.

Args:
  - primitive_type: 'CUBE' | 'SPHERE' | 'CYLINDER' | 'CONE' | 'TORUS' | 'PLANE' | 'MONKEY' | 'UV_SPHERE' | 'ICO_SPHERE'
  - name (optional): Custom object name (default: auto-generated)
  - location (optional): Position [x, y, z] (default: [0, 0, 0])
  - scale (optional): Scale [x, y, z] (default: [1, 1, 1])

Returns:
  Success message with created object name

Examples:
  - Create cube at origin: { primitive_type: "CUBE" }
  - Create sphere at (5, 0, 2): { primitive_type: "SPHERE", location: [5, 0, 2] }

Use when: Starting new scene, adding basic geometry
Don't use when: Need complex custom geometry (use execute_blender_code instead)`,
      inputSchema: CreatePrimitiveSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async (params): Promise<ToolResult> => {
      try {
        const client = getBlenderClient();
        const response = await client.sendCommand('create_primitive', params);

        if (response.status === 'error') {
          return {
            content: [{ type: 'text', text: `Error: ${response.message}` }]
          };
        }

        return {
          content: [{
            type: 'text',
            text: `Successfully created ${params.primitive_type} primitive${params.name ? ` named "${params.name}"` : ''}`
          }]
        };

      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }]
        };
      }
    }
  );

  // Tool 4: Modify Object
  server.registerTool(
    'blender_modify_object',
    {
      title: 'Modify Blender Object',
      description: `Modify transforms of existing Blender object.

Update location, rotation (in radians), and/or scale of object by name.

Args:
  - object_name (string): Object to modify
  - location (optional): New position [x, y, z]
  - rotation (optional): New rotation in radians [x, y, z]
  - scale (optional): New scale [x, y, z]

At least one transform property must be provided.

Returns:
  Success message with updated properties

Use when: Positioning, rotating, or scaling existing objects
Don't use when: Creating new objects (use create_primitive instead)`,
      inputSchema: ModifyObjectSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params): Promise<ToolResult> => {
      try {
        const client = getBlenderClient();
        const response = await client.sendCommand('modify_object', params);

        if (response.status === 'error') {
          return {
            content: [{ type: 'text', text: `Error: ${response.message}` }]
          };
        }

        return {
          content: [{ type: 'text', text: `Successfully modified object "${params.object_name}"` }]
        };

      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }]
        };
      }
    }
  );

  // Tool 5: Delete Object
  server.registerTool(
    'blender_delete_object',
    {
      title: 'Delete Blender Object',
      description: `Delete object from Blender scene by name.

Permanently removes object and its data. Cannot be undone via MCP.

Args:
  - object_name (string): Object to delete

Returns:
  Success confirmation

Use when: Cleaning up scene, removing unwanted objects
Don't use when: Temporarily hiding objects (no hide functionality in MCP currently)

Error: "Object not found" if object doesn't exist`,
      inputSchema: DeleteObjectSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params): Promise<ToolResult> => {
      try {
        const client = getBlenderClient();
        const response = await client.sendCommand('delete_object', {
          object_name: params.object_name
        });

        if (response.status === 'error') {
          return {
            content: [{ type: 'text', text: `Error: ${response.message}` }]
          };
        }

        return {
          content: [{ type: 'text', text: `Successfully deleted object "${params.object_name}"` }]
        };

      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }]
        };
      }
    }
  );
}