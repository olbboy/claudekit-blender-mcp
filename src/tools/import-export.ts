/**
 * Import/Export Tools
 *
 * Tools for importing external assets into Blender and exporting Blender creations
 * to various formats. Supports multiple 3D file formats and quality settings.
 */

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getBlenderClient } from '../utils/socket-client.js';
import type { ToolResult, AssetFormat, ImportOptions, ExportOptions } from '../types/index.js';
import {
  filePathSchema,
  assetFormatSchema,
  vector3Schema,
  compressionSchema,
  decimationRatioSchema,
  timeoutSchema
} from '../utils/validators.js';

const ImportAssetSchema = z.object({
  file_path: filePathSchema.describe('Path to asset file to import'),
  format: assetFormatSchema.optional().describe('Asset format (auto-detected if not specified)'),
  options: z.object({
    location: vector3Schema.optional().describe('Import position [x, y, z]'),
    rotation: vector3Schema.optional().describe('Import rotation [x, y, z] in degrees'),
    scale: vector3Schema.optional().describe('Import scale [x, y, z]'),
    apply_transforms: z.boolean().default(false).describe('Apply transforms during import'),
    merge_with_scene: z.boolean().default(true).describe('Merge with existing scene'),
    generate_materials: z.boolean().default(true).describe('Generate materials on import'),
    generate_uvs: z.boolean().default(false).describe('Generate UV coordinates'),
    decimate: z.boolean().default(false).describe('Apply mesh decimation'),
    decimate_ratio: decimationRatioSchema.describe('Decimation ratio (0.1-1.0)')
  }).optional().describe('Import options')
}).strict();

const ExportAssetSchema = z.object({
  objects: z.array(z.string()).optional().describe('Object names to export (exports all if not specified)'),
  format: assetFormatSchema.describe('Export format'),
  file_path: filePathSchema.describe('Export destination path'),
  options: z.object({
    selected_only: z.boolean().default(false).describe('Export only selected objects'),
    apply_modifiers: z.boolean().default(true).describe('Apply modifiers before export'),
    include_materials: z.boolean().default(true).describe('Include material data'),
    include_textures: z.boolean().default(true).describe('Include texture files'),
    include_animations: z.boolean().default(true).describe('Include animation data'),
    compression: compressionSchema.describe('Compression level (0-100)')
  }).optional().describe('Export options')
}).strict();

const GetSupportedFormatsSchema = z.object({
  operation: z.enum(['import', 'export', 'both']).default('both').describe('Filter by operation type')
}).strict();

const OptimizeAssetSchema = z.object({
  objects: z.array(z.string()).describe('Object names to optimize'),
  target_poly_count: z.number().int().min(100).max(1000000).optional().describe('Target polygon count'),
  decimation_ratio: decimationRatioSchema.optional().describe('Decimation ratio (0.1-1.0)'),
  preserve_uvs: z.boolean().default(true).describe('Preserve UV coordinates'),
  preserve_materials: z.boolean().default(true).describe('Preserve material assignments'),
  preserve_vertex_colors: z.boolean().default(true).describe('Preserve vertex colors')
}).strict();

export function registerImportExportTools(server: McpServer) {
  // Tool 19: Import Asset
  server.registerTool(
    'blender_import_asset',
    {
      title: 'Import External Asset',
      description: `Import external 3D assets into Blender scene with comprehensive options.

Supports multiple 3D file formats including FBX, OBJ, GLTF, and more with advanced import options.

Args:
  - file_path (string): Path to asset file to import (relative to project)
  - format (optional): Asset format (auto-detected if not specified)
  - options (optional): Import options including location, rotation, scale, and processing

Returns:
  Import confirmation with object details and processing information

Examples:
  - Basic import: file_path="assets/models/chair.fbx"
  - With positioning: file_path="assets/tree.obj", options={location: [0, 0, 0]}
  - Optimized import: file_path="assets/vehicle.gltf", options={decimate: true, decimate_ratio: 0.5}

Use when: Adding external assets to scenes, importing models/textures, asset workflows
Don't use when: Creating new primitives (use object creation tools instead)

Performance: Varies by file size and complexity, typically 1-10 seconds for most assets
`,
      inputSchema: ImportAssetSchema,
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

        // Get project directory for relative path resolution
        const projectResponse = await client.sendCommand('get_project_directory', {});

        if (projectResponse.status === 'error') {
          return {
            content: [{
              type: 'text',
              text: `Error: ${projectResponse.message || 'Failed to get project directory'}`
            }]
          };
        }

        const projectDir = projectResponse.result as string;
        const fullPath = `${projectDir}/${params.file_path}`;

        const response = await client.sendCommand('import_asset', {
          file_path: fullPath,
          format: params.format,
          options: params.options || {}
        });

        if (response.status === 'error') {
          return {
            content: [{
              type: 'text',
              text: `Error: ${response.message || 'Failed to import asset'}`
            }]
          };
        }

        return {
          content: [{
            type: 'text',
            text: `Successfully imported asset: ${params.file_path}`
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

  // Tool 20: Export Asset
  server.registerTool(
    'blender_export_asset',
    {
      title: 'Export Scene Asset',
      description: `Export Blender objects or entire scene to various 3D formats.

Comprehensive export tool with support for multiple formats and export options including materials and animations.

Args:
  - objects (optional): Object names to export (exports all if not specified)
  - format (enum): Export format (fbx, obj, gltf, glb, stl, ply, abc)
  - file_path (string): Export destination path (relative to project)
  - options (optional): Export options including modifiers, materials, and compression

Returns:
  Export confirmation with file size, format, and object count

Examples:
  - Export all: format="fbx", file_path="exports/scene.fbx"
  - Export specific: objects=["Cube", "Sphere"], format="obj", file_path="exports/selection.obj"
  - Optimized export: format="gltf", file_path="exports/optimized.glb", options={compression: 90}

Use when: Sharing assets, exporting for other applications, backup and version control
Don't use when: Quick previews (use screenshot tools instead)

Performance: Varies by scene complexity and format, typically 5-30 seconds
`,
      inputSchema: ExportAssetSchema,
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

        // Get project directory for relative path resolution
        const projectResponse = await client.sendCommand('get_project_directory', {});

        if (projectResponse.status === 'error') {
          return {
            content: [{
              type: 'text',
              text: `Error: ${projectResponse.message || 'Failed to get project directory'}`
            }]
          };
        }

        const projectDir = projectResponse.result as string;
        const fullPath = `${projectDir}/${params.file_path}`;

        const response = await client.sendCommand('export_asset', {
          objects: params.objects,
          format: params.format,
          file_path: fullPath,
          options: params.options || {}
        });

        if (response.status === 'error') {
          return {
            content: [{
              type: 'text',
              text: `Error: ${response.message || 'Failed to export asset'}`
            }]
          };
        }

        const result = response.result as { file_size?: number; object_count?: number };
        const sizeText = result.file_size ? ` (${(result.file_size / 1024 / 1024).toFixed(1)}MB)` : '';
        const objectCountText = result.object_count ? ` ${result.object_count} objects` : '';

        return {
          content: [{
            type: 'text',
            text: `Successfully exported${objectCountText} to ${params.format.toUpperCase()}${sizeText}: ${params.file_path}`
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

  // Tool 21: Get Supported Formats
  server.registerTool(
    'blender_get_supported_formats',
    {
      title: 'Get Supported Import/Export Formats',
      description: `List all supported file formats for import and export operations.

Provides comprehensive format information with capabilities and recommended use cases.

Args:
  - operation (enum): Filter by operation type (import, export, both)

Returns:
  Detailed list of supported formats with capabilities and use cases

Examples:
  - All formats: operation="both"
  - Import only: operation="import"
  - Export only: operation="export"

Use when: Planning asset workflows, choosing formats, understanding capabilities
Don't use when: Actual import/export operations (use import_asset/export_asset instead)

Performance: Instant operation, negligible performance impact
`,
      inputSchema: GetSupportedFormatsSchema,
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
        const response = await client.sendCommand('get_supported_formats', {
          operation: params.operation
        });

        if (response.status === 'error') {
          return {
            content: [{
              type: 'text',
              text: `Error: ${response.message || 'Failed to get supported formats'}`
            }]
          };
        }

        return {
          content: [{
            type: 'text',
            text: `Successfully retrieved supported formats for ${params.operation} operations`
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

  // Tool 22: Optimize Asset
  server.registerTool(
    'blender_optimize_asset',
    {
      title: 'Optimize Asset Performance',
      description: `Optimize 3D assets for better performance through mesh decimation and cleanup.

Reduces polygon count and optimizes geometry while preserving visual quality and essential attributes.

Args:
  - objects (array): Object names to optimize
  - target_poly_count (optional): Target polygon count (100-1000000)
  - decimation_ratio (optional): Decimation ratio (0.1-1.0)
  - preserve_uvs (boolean, default true): Preserve UV coordinates
  - preserve_materials (boolean, default true): Preserve material assignments
  - preserve_vertex_colors (boolean, default true): Preserve vertex colors

Returns:
  Optimization summary with before/after statistics and performance improvements

Examples:
  - Target count: objects=["HighPolyModel"], target_poly_count=10000
  - Ratio based: objects=["Tree"], decimation_ratio=0.3
  - Multiple objects: objects=["Rock1", "Rock2", "Rock3"], decimation_ratio=0.5

Use when: Optimizing for real-time applications, reducing file sizes, performance improvements
Don't use when: Preserving maximum detail for rendering (use export with high quality instead)

Performance: Moderate impact depending on mesh complexity, typically 5-60 seconds
`,
      inputSchema: OptimizeAssetSchema,
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
        const response = await client.sendCommand('optimize_asset', {
          objects: params.objects,
          target_poly_count: params.target_poly_count,
          decimation_ratio: params.decimation_ratio,
          preserve_uvs: params.preserve_uvs,
          preserve_materials: params.preserve_materials,
          preserve_vertex_colors: params.preserve_vertex_colors
        });

        if (response.status === 'error') {
          return {
            content: [{
              type: 'text',
              text: `Error: ${response.message || 'Failed to optimize asset'}`
            }]
          };
        }

        const result = response.result as {
          original_poly_count?: number;
          final_poly_count?: number;
          reduction_percent?: number;
        };

        const statsText = result.original_poly_count && result.final_poly_count
          ? ` (${result.original_poly_count} → ${result.final_poly_count} polys, ${result.reduction_percent}% reduction)`
          : '';

        return {
          content: [{
            type: 'text',
            text: `Successfully optimized ${params.objects.length} objects${statsText}`
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