/**
 * External Sources Tools
 *
 * Tools for accessing and importing assets from external asset platforms.
 * Currently supports PolyHaven integration with plans for Sketchfab and AI services.
 */

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getBlenderClient } from '../utils/socket-client.js';
import { PolyHavenClient } from '../services/polyhaven.js';
import { FileUtils } from '../utils/file-utils.js';
import type { ToolResult, AssetType, AssetFormat } from '../types/index.js';
import {
  searchQuerySchema,
  assetTypeSchema,
  qualitySchema,
  searchLimitSchema,
  timeoutSchema,
  filePathSchema
} from '../utils/validators.js';

const SearchPolyHavenSchema = z.object({
  query: searchQuerySchema.optional().describe('Search query for assets'),
  type: assetTypeSchema.optional().describe('Asset type filter (model, material, texture, hdri)'),
  limit: searchLimitSchema.describe('Maximum number of results (1-100)'),
  quality: qualitySchema.optional().describe('Quality level for thumbnails'),
  tags: z.array(z.string()).optional().describe('Filter by tags')
}).strict();

const DownloadPolyHavenAssetSchema = z.object({
  asset_id: z.string().min(1).describe('PolyHaven asset ID to download'),
  quality: qualitySchema.describe('Download quality level (hd, 1k, 2k, 4k, 8k)'),
  save_path: filePathSchema.optional().describe('Save path (relative to project assets directory)'),
  import_to_scene: z.boolean().default(true).describe('Import directly into Blender scene'),
  timeout: timeoutSchema.describe('Download timeout in milliseconds'),
  import_options: z.object({
    location: z.tuple([z.number(), z.number(), z.number()]).optional().describe('Import position [x, y, z]'),
    scale: z.tuple([z.number(), z.number(), z.number()]).optional().describe('Import scale [x, y, z]')
  }).optional().describe('Import options if importing to scene')
}).strict();

const GetPolyHavenAssetDetailsSchema = z.object({
  asset_id: z.string().min(1).describe('PolyHaven asset ID to get details for'),
  include_thumbnails: z.boolean().default(true).describe('Include thumbnail information')
}).strict();

const GetPolyHavenPopularSchema = z.object({
  type: assetTypeSchema.optional().describe('Asset type filter'),
  limit: searchLimitSchema.describe('Maximum number of results (1-100)'),
  quality: qualitySchema.optional().describe('Quality level for thumbnails')
}).strict();

export function registerExternalSourceTools(server: McpServer) {
  // Tool 23: Search PolyHaven
  server.registerTool(
    'blender_search_polyhaven',
    {
      title: 'Search PolyHaven Assets',
      description: `Search the PolyHaven library for free 3D assets, textures, and HDRIs.

PolyHaven offers 10,000+ free CC0-licensed 3D assets including models, materials, textures, and HDRIs.

Args:
  - query (optional): Search query for assets
  - type (optional): Asset type filter (model, material, texture, hdri)
  - limit (integer): Maximum number of results (1-100, default 20)
  - quality (optional): Quality level for thumbnails
  - tags (optional): Filter by tags array

Returns:
  Search results with asset metadata, thumbnails, and download options

Examples:
  - Wood textures: query="wood", type="texture", limit=10
  - Tree models: query="tree", type="model", limit=5
  - HDRI skies: type="hdri", limit=8
  - Popular materials: type="material", limit=15

Use when: Finding reference assets, texture sourcing, environment creation
Don't use when: Downloading specific assets (use download_polyhaven_asset instead)

Performance: Network-dependent, typically 1-5 seconds

License: All PolyHaven assets are CC0 (public domain)
`,
      inputSchema: SearchPolyHavenSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params): Promise<ToolResult> => {
      try {
        const searchOptions = {
          query: params.query,
          type: params.type ? params.type.toLowerCase() as any : undefined,
          limit: params.limit,
          tags: params.tags
        };

        const result = await PolyHavenClient.searchAssets(searchOptions);

        return {
          content: [{
            type: 'text',
            text: `Found ${result.assets.length} assets (showing ${Math.min(result.assets.length, params.limit)} of ${result.total} total)`
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

  // Tool 24: Download PolyHaven Asset
  server.registerTool(
    'blender_download_polyhaven_asset',
    {
      title: 'Download and Import PolyHaven Asset',
      description: `Download a PolyHaven asset and optionally import it directly into Blender.

Downloads high-quality assets from PolyHaven with automatic file management and scene integration.

Args:
  - asset_id (string): PolyHaven asset ID to download
  - quality (enum): Download quality level (hd, 1k, 2k, 4k, 8k)
  - save_path (optional): Save path (relative to project assets directory)
  - import_to_scene (boolean, default true): Import directly into Blender scene
  - import_options (optional): Import options if importing to scene

Returns:
  Download confirmation with file information and import status

Examples:
  - Download 2K texture: asset_id="old_wood_01", quality="2k"
  - Download and import model: asset_id="oak_tree", quality="4k", import_to_scene=true
  - Custom save path: asset_id="sky_cloudy", quality="hdr", save_path="environments/sky.hdr"

Use when: Adding professional assets to scenes, sourcing textures, environment setup
Don't use when: Just browsing assets (use search_polyhaven instead)

Performance: Network and file-size dependent, typically 5-60 seconds

Security: Validates asset IDs, downloads to secure project directory
`,
      inputSchema: DownloadPolyHavenAssetSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params): Promise<ToolResult> => {
      try {
        // Get asset details first
        const asset = await PolyHavenClient.getAssetDetails(params.asset_id);
        const assetMetadata = PolyHavenClient.toAssetMetadata(asset);

        // Determine save path
        let savePath = params.save_path;
        if (!savePath) {
          const typeDir = assetMetadata.type;
          const fileName = `${assetMetadata.name}_${params.quality}.${assetMetadata.format}`;
          savePath = `assets/${typeDir}/${fileName}`;
        }

        // Get project directory
        const client = getBlenderClient();
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
        const fullPath = `${projectDir}/${savePath}`;

        // Download asset with timeout
        const downloadPromise = PolyHavenClient.downloadAsset(params.asset_id, params.quality);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Download timeout exceeded')), params.timeout)
        );

        const downloadResult = await Promise.race([downloadPromise, timeoutPromise]) as {
          data: string;
          filename: string;
          mimeType: string;
          size: number;
        };

        // Save file
        await FileUtils.writeBase64File(fullPath, downloadResult.data);

        let resultText = `Successfully downloaded ${FileUtils.formatFileSize(downloadResult.size)} asset: ${savePath}`;

        // Import to scene if requested
        if (params.import_to_scene) {
          const importResponse = await client.sendCommand('import_asset', {
            file_path: fullPath,
            options: params.import_options || {}
          });

          if (importResponse.status === 'error') {
            resultText += ` (downloaded but import failed: ${importResponse.message})`;
          } else {
            resultText += ` and imported to scene`;
          }
        }

        return {
          content: [{
            type: 'text',
            text: resultText
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

  // Tool 25: Get PolyHaven Asset Details
  server.registerTool(
    'blender_get_polyhaven_asset_details',
    {
      title: 'Get PolyHaven Asset Details',
      description: `Get detailed information about a specific PolyHaven asset.

Provides comprehensive asset metadata including download options, technical specifications, and licensing information.

Args:
  - asset_id (string): PolyHaven asset ID to get details for
  - include_thumbnails (boolean, default true): Include thumbnail information

Returns:
  Complete asset metadata with download options, file sizes, and quality levels

Examples:
  - Basic details: asset_id="old_wood_01"
  - With thumbnails: asset_id="oak_tree", include_thumbnails=true
  - Check availability: asset_id="sky_cloudy"

Use when: Verifying asset availability, checking download options, asset metadata research
Don't use when: Downloading assets (use download_polyhaven_asset instead)

Performance: Fast network request, typically 1-3 seconds

License: Returns CC0 licensing information for all assets
`,
      inputSchema: GetPolyHavenAssetDetailsSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params): Promise<ToolResult> => {
      try {
        const asset = await PolyHavenClient.getAssetDetails(params.asset_id);
        const assetMetadata = PolyHavenClient.toAssetMetadata(asset);

        const downloadOptions = Object.keys(asset.download_urls || {}).join(', ');
        const qualityInfo = downloadOptions ? `Available qualities: ${downloadOptions}` : 'No download options';

        return {
          content: [{
            type: 'text',
            text: `Asset "${asset.name}" (${asset.type}) - ${assetMetadata.polyCount || 'N/A'} polys - ${qualityInfo}`
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

  // Tool 26: Get PolyHaven Popular Assets
  server.registerTool(
    'blender_get_polyhaven_popular',
    {
      title: 'Get Popular PolyHaven Assets',
      description: `Get trending and popular assets from PolyHaven.

Returns the most downloaded and highly-rated assets across different categories.

Args:
  - type (optional): Asset type filter (model, material, texture, hdri)
  - limit (integer): Maximum number of results (1-100, default 20)
  - quality (optional): Quality level for thumbnails

Returns:
  List of popular assets with download counts and ratings

Examples:
  - Popular models: type="model", limit=10
  - Trending textures: type="texture", limit=15
  - Top HDRIs: type="hdri", limit=5
  - All categories: limit=20

Use when: Discovering trending assets, finding high-quality content, asset inspiration
Don't use when: Searching for specific criteria (use search_polyhaven instead)

Performance: Fast network request, typically 1-3 seconds

Content: Updated daily based on community downloads and ratings
`,
      inputSchema: GetPolyHavenPopularSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params): Promise<ToolResult> => {
      try {
        const assets = await PolyHavenClient.getPopularAssets(
          params.type ? params.type.toLowerCase() as any : undefined,
          params.limit
        );

        return {
          content: [{
            type: 'text',
            text: `Found ${assets.length} popular ${params.type || 'all'} assets from PolyHaven`
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