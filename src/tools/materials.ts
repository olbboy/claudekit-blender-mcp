import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getBlenderClient } from '../utils/socket-client.js';
import { objectNameSchema, colorSchema } from '../utils/validators.js';
import { handleBlenderResponse, handleCaughtError } from '../utils/error-helpers.js';
import type { ToolResult } from '../types/index.js';

const CreateMaterialSchema = z.object({
  material_name: z.string().min(1).describe('Material name'),
  base_color: colorSchema.optional().describe('Base color RGBA [0-1]'),
  metallic: z.number().min(0).max(1).optional().describe('Metallic value 0-1'),
  roughness: z.number().min(0).max(1).optional().describe('Roughness value 0-1'),
  emission_color: colorSchema.optional().describe('Emission color RGBA'),
  emission_strength: z.number().min(0).optional().describe('Emission strength')
}).strict();

const ApplyMaterialSchema = z.object({
  object_name: objectNameSchema.describe('Object to apply material to'),
  material_name: z.string().min(1).describe('Material to apply')
}).strict();

const SetMaterialPropertySchema = z.object({
  material_name: z.string().min(1).describe('Material to modify'),
  property: z.enum(['base_color', 'metallic', 'roughness', 'emission_color', 'emission_strength']),
  value: z.union([colorSchema, z.number()]).describe('Property value')
}).strict();

export function registerMaterialTools(server: McpServer) {
  // Tool 6: Create Material
  server.registerTool(
    'blender_create_material',
    {
      title: 'Create Blender Material',
      description: `Create PBR material with Principled BSDF shader.

Creates material with standard PBR properties. Use Principled BSDF workflow.

Args:
  - material_name: Material name
  - base_color (optional): RGBA [r, g, b, a] with 0-1 values
  - metallic (optional): 0-1, default 0
  - roughness (optional): 0-1, default 0.5
  - emission_color (optional): RGBA for emission
  - emission_strength (optional): Emission intensity

Returns: Success message

Example: { material_name: "RedMetal", base_color: [0.8, 0.1, 0.1, 1], metallic: 1, roughness: 0.2 }`,
      inputSchema: CreateMaterialSchema,
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
        const response = await client.sendCommand('create_material', params);
        return handleBlenderResponse(response, `Successfully created material "${params.material_name}"`, 'Failed to create material');
      } catch (error) {
        return handleCaughtError(error);
      }
    }
  );

  // Tool 7: Apply Material
  server.registerTool(
    'blender_apply_material',
    {
      title: 'Apply Material to Object',
      description: `Apply existing material to Blender object.

Assigns material to object's active material slot. Object must exist and material must be created first.

Args:
  - object_name (string): Object to apply material to
  - material_name (string): Material to apply

Returns: Success confirmation

Use when: Texturing objects after creating materials
Don't use when: Material doesn't exist (create it first)`,
      inputSchema: ApplyMaterialSchema,
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
        const response = await client.sendCommand('apply_material', params);
        return handleBlenderResponse(
          response,
          `Successfully applied material "${params.material_name}" to object "${params.object_name}"`,
          'Material or object not found'
        );
      } catch (error) {
        return handleCaughtError(error);
      }
    }
  );

  // Tool 8: Set Material Property
  server.registerTool(
    'blender_set_material_property',
    {
      title: 'Set Material Property',
      description: `Modify specific property of existing material.

Updates PBR material properties like color, metallic, roughness, or emission.

Args:
  - material_name (string): Material to modify
  - property: 'base_color' | 'metallic' | 'roughness' | 'emission_color' | 'emission_strength'
  - value: Property value (color as RGBA array or number for metallic/roughness/strength)

Returns: Success confirmation

Examples:
  - Make metallic: { material_name: "Metal", property: "metallic", value: 1.0 }
  - Set red color: { material_name: "Red", property: "base_color", value: [1, 0, 0, 1] }`,
      inputSchema: SetMaterialPropertySchema,
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
        const response = await client.sendCommand('set_material_property', params);
        return handleBlenderResponse(
          response,
          `Successfully set ${params.property} for material "${params.material_name}"`,
          'Material not found'
        );
      } catch (error) {
        return handleCaughtError(error);
      }
    }
  );
}