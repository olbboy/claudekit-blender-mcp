/**
 * Asset Management Tools
 *
 * Tools for managing assets within Blender scenes, including collections,
 * material libraries, and asset organization.
 */

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getBlenderClient } from '../utils/socket-client.js';
import type { ToolResult } from '../types/index.js';
import {
  collectionNameSchema,
  assetTypeSchema,
  objectNameSchema,
  tagsSchema
} from '../utils/validators.js';

const CreateCollectionSchema = z.object({
  name: collectionNameSchema,
  parent_collection: collectionNameSchema.optional().describe('Parent collection name (optional)')
}).strict();

const AddToCollectionSchema = z.object({
  object_name: objectNameSchema,
  collection_name: collectionNameSchema,
  remove_from_others: z.boolean().default(false).describe('Remove from other collections')
}).strict();

const ListCollectionsSchema = z.object({
  include_objects: z.boolean().default(false).describe('Include objects in each collection'),
  object_details: z.boolean().default(false).describe('Include detailed object information')
}).strict();

const OrganizeAssetsByTypeSchema = z.object({
  create_collections: z.boolean().default(true).describe('Create collections for each asset type'),
  existing_objects_only: z.boolean().default(true).describe('Only organize existing objects'),
  prefix_with_type: z.boolean().default(false).describe('Prefix object names with asset type')
}).strict();

export function registerAssetTools(server: McpServer) {
  // Tool 11: Create Collection
  server.registerTool(
    'blender_create_collection',
    {
      title: 'Create Blender Collection',
      description: `Create a new Blender collection for organizing assets.

Collections in Blender help organize scenes by grouping related objects. Collections can be nested for hierarchical organization.

Args:
  - name (string): Collection name (alphanumeric, spaces, hyphens, underscores, max 64 chars)
  - parent_collection (optional): Parent collection name for nested organization

Returns:
  Collection creation confirmation and collection information

Examples:
  - Create main collection: name="Environment"
  - Nested collection: name="Trees", parent_collection="Environment"
  - Asset library: name="Props", parent_collection="Library"

Use when: Organizing scene assets, creating asset libraries, structuring complex scenes
Don't use when: Creating single objects without organization needs

Performance: Instant operation, negligible performance impact`,
      inputSchema: CreateCollectionSchema,
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
        const response = await client.sendCommand('create_collection', {
          name: params.name,
          parent_collection: params.parent_collection
        });

        if (response.status === 'error') {
          return {
            content: [{
              type: 'text',
              text: `Error: ${response.message || 'Failed to create collection'}`
            }]
          };
        }

        return {
          content: [{
            type: 'text',
            text: `Successfully created collection "${params.name}"`
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

  // Tool 12: Add to Collection
  server.registerTool(
    'blender_add_to_collection',
    {
      title: 'Add Object to Collection',
      description: `Move or copy an object to a specific collection.

Objects in Blender can belong to multiple collections. This tool provides flexible asset organization and scene management.

Args:
  - object_name (string): Target object name to add to collection
  - collection_name (string): Destination collection name
  - remove_from_others (boolean, default false): Remove from other collections

Returns:
  Collection assignment confirmation and updated object information

Examples:
  - Move object: object_name="TreeOak", collection_name="Trees", remove_from_others=true
  - Add to multiple: object_name="Rock", collection_name="Environment", remove_from_others=false
  - Organize assets: object_name="Character", collection_name="Characters"

Use when: Organizing scene assets, managing object relationships, structuring workflow
Don't use when: Creating new objects (use object creation tools instead)

Performance: Instant operation, negligible performance impact`,
      inputSchema: AddToCollectionSchema,
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
        const response = await client.sendCommand('add_to_collection', {
          object_name: params.object_name,
          collection_name: params.collection_name,
          remove_from_others: params.remove_from_others
        });

        if (response.status === 'error') {
          return {
            content: [{
              type: 'text',
              text: `Error: ${response.message || 'Failed to add object to collection'}`
            }]
          };
        }

        return {
          content: [{
            type: 'text',
            text: `Successfully added "${params.object_name}" to collection "${params.collection_name}"`
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

  // Tool 13: List Collections
  server.registerTool(
    'blender_list_collections',
    {
      title: 'List Scene Collections',
      description: `List all collections in the current Blender scene with optional object details.

Provides comprehensive view of scene organization structure, including nested collections and object membership.

Args:
  - include_objects (boolean, default false): Include objects in each collection
  - object_details (boolean, default false): Include detailed object information

Returns:
  Hierarchical list of collections with optional object details and statistics

Examples:
  - Simple list: include_objects=false, object_details=false
  - With objects: include_objects=true, object_details=false
  - Full details: include_objects=true, object_details=true

Use when: Understanding scene structure, managing assets, planning organization
Don't use when: Creating new collections (use create_collection instead)

Performance: Fast operation, minimal performance impact
`,
      inputSchema: ListCollectionsSchema,
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
        const response = await client.sendCommand('list_collections', {
          include_objects: params.include_objects,
          object_details: params.object_details
        });

        if (response.status === 'error') {
          return {
            content: [{
              type: 'text',
              text: `Error: ${response.message || 'Failed to list collections'}`
            }]
          };
        }

        return {
          content: [{
            type: 'text',
            text: `Successfully retrieved collections list with ${params.include_objects ? 'object' : 'collection-only'} details`
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

  // Tool 14: Organize Assets by Type
  server.registerTool(
    'blender_organize_assets_by_type',
    {
      title: 'Organize Assets by Type',
      description: `Automatically organize scene assets into collections based on object type.

This intelligent organization tool creates collections for different asset types (models, materials, etc.) and moves objects accordingly.

Args:
  - create_collections (boolean, default true): Create collections for each asset type
  - existing_objects_only (boolean, default true): Only organize existing objects
  - prefix_with_type (boolean, default false): Prefix object names with asset type

Returns:
  Organization summary with collections created and objects moved

Examples:
  - Basic organization: create_collections=true, existing_objects_only=true, prefix_with_type=false
  - Include new objects: create_collections=true, existing_objects_only=false
  - Naming convention: create_collections=true, prefix_with_type=true

Use when: Cleaning up disorganized scenes, establishing asset workflows, improving scene management
Don't use when: Fine-grained manual control needed, complex custom organization

Performance: Moderate impact depending on scene size and object count
`,
      inputSchema: OrganizeAssetsByTypeSchema,
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
        const response = await client.sendCommand('organize_assets_by_type', {
          create_collections: params.create_collections,
          existing_objects_only: params.existing_objects_only,
          prefix_with_type: params.prefix_with_type
        });

        if (response.status === 'error') {
          return {
            content: [{
              type: 'text',
              text: `Error: ${response.message || 'Failed to organize assets by type'}`
            }]
          };
        }

        return {
          content: [{
            type: 'text',
            text: `Successfully organized assets by type with ${params.create_collections ? 'new' : 'existing'} collections`
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