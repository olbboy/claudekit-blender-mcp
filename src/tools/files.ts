/**
 * File Operations Tools
 *
 * Tools for managing files and directories within the Blender project,
 * including asset libraries, project organization, and file system operations.
 */

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getBlenderClient } from '../utils/socket-client.js';
import { FileUtils } from '../utils/file-utils.js';
import type { ToolResult } from '../types/index.js';
import {
  filePathSchema,
  directoryNameSchema,
  base64Schema,
  urlSchema,
  timeoutSchema
} from '../utils/validators.js';

const ListFilesSchema = z.object({
  directory_path: filePathSchema.optional().describe('Directory path to list (default: current project)'),
  recursive: z.boolean().default(false).describe('Include subdirectories recursively'),
  include_hidden: z.boolean().default(false).describe('Include hidden files and directories')
}).strict();

const CreateDirectorySchema = z.object({
  directory_path: filePathSchema.describe('Directory path to create'),
  parent_directories: z.boolean().default(true).describe('Create parent directories if needed')
}).strict();

const SaveFileSchema = z.object({
  file_path: filePathSchema.describe('File path to save'),
  data: base64Schema.describe('Base64 encoded file data'),
  overwrite: z.boolean().default(false).describe('Overwrite existing file')
}).strict();

const DownloadFileSchema = z.object({
  url: urlSchema.describe('URL to download from'),
  destination_path: filePathSchema.describe('Destination file path'),
  timeout: timeoutSchema.describe('Download timeout in milliseconds')
}).strict();

export function registerFileTools(server: McpServer) {
  // Tool 15: List Files
  server.registerTool(
    'blender_list_files',
    {
      title: 'List Project Files',
      description: `List files and directories in the Blender project or specified directory.

Provides comprehensive file system overview for project management and asset organization.

Args:
  - directory_path (optional): Directory path to list (relative to project)
  - recursive (boolean, default false): Include subdirectories recursively
  - include_hidden (boolean, default false): Include hidden files and directories

Returns:
  File listing with metadata including sizes, types, and modification times

Examples:
  - Current directory: directory_path="", recursive=false
  - Recursive list: directory_path="assets", recursive=true
  - Include hidden: directory_path=".", include_hidden=true

Use when: Project organization, asset management, file system navigation
Don't use when: Creating new files or directories (use create_directory/save_file)

Performance: Fast operation, minor impact with large recursive listings

Security: Only accesses files within project directory structure
`,
      inputSchema: ListFilesSchema,
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

        // Get current project directory from Blender if not specified
        let targetPath = params.directory_path || '';

        // First, get Blender's current directory
        const blenderResponse = await client.sendCommand('get_project_directory', {});

        if (blenderResponse.status === 'success' && blenderResponse.result) {
          const projectDir = blenderResponse.result as string;
          targetPath = params.directory_path
            ? `${projectDir}/${params.directory_path}`
            : projectDir;
        }

        const listing = await FileUtils.listDirectory(targetPath, params.recursive);

        if (params.include_hidden) {
          // Filter logic would be handled in Blender addon
          const response = await client.sendCommand('list_files', {
            directory_path: targetPath,
            recursive: params.recursive,
            include_hidden: params.include_hidden
          });

          if (response.status === 'error') {
            return {
              content: [{
                type: 'text',
                text: `Error: ${response.message || 'Failed to list files'}`
              }]
            };
          }

          return {
            content: [{
              type: 'text',
              text: `Successfully listed files in ${targetPath || 'project directory'}`
            }]
          };
        }

        return {
          content: [{
            type: 'text',
            text: `Found ${listing.files.length} files and ${listing.directories.length} directories (${FileUtils.formatFileSize(listing.totalSize)} total)`
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

  // Tool 16: Create Directory
  server.registerTool(
    'blender_create_directory',
    {
      title: 'Create Project Directory',
      description: `Create a new directory within the Blender project structure.

Useful for organizing assets, creating project folders, and establishing file system structure.

Args:
  - directory_path (string): Directory path to create (relative to project)
  - parent_directories (boolean, default true): Create parent directories if needed

Returns:
  Directory creation confirmation and path information

Examples:
  - Asset folder: directory_path="assets/models"
  - Textures: directory_path="assets/textures"
  - Project structure: directory_path="scenes/environment"

Use when: Setting up project structure, organizing assets, creating workflow folders
Don't use when: Creating files (use save_file instead)

Performance: Instant operation, negligible performance impact

Security: Only creates directories within project boundary
`,
      inputSchema: CreateDirectorySchema,
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

        // Get project directory for relative path resolution
        const blenderResponse = await client.sendCommand('get_project_directory', {});

        if (blenderResponse.status === 'error') {
          return {
            content: [{
              type: 'text',
              text: `Error: ${blenderResponse.message || 'Failed to get project directory'}`
            }]
          };
        }

        const projectDir = blenderResponse.result as string;
        const fullPath = `${projectDir}/${params.directory_path}`;

        await FileUtils.createDirectory(fullPath, params.parent_directories);

        // Also update Blender's file system
        const response = await client.sendCommand('create_directory', {
          directory_path: params.directory_path,
          parent_directories: params.parent_directories
        });

        if (response.status === 'error') {
          return {
            content: [{
              type: 'text',
              text: `Error: ${response.message || 'Failed to create directory in Blender'}`
            }]
          };
        }

        return {
          content: [{
            type: 'text',
            text: `Successfully created directory: ${params.directory_path}`
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

  // Tool 17: Save File
  server.registerTool(
    'blender_save_file',
    {
      title: 'Save File to Project',
      description: `Save base64 encoded file data to the Blender project directory.

Supports saving various file types including assets, textures, and project files.

Args:
  - file_path (string): Destination file path (relative to project)
  - data (string): Base64 encoded file data
  - overwrite (boolean, default false): Overwrite existing file

Returns:
  File save confirmation with size and type information

Examples:
  - Save texture: file_path="assets/textures/wood.png", data="[base64]"
  - Save model: file_path="assets/models/chair.fbx", data="[base64]"
  - Save project: file_path="scenes/level1.blend", data="[base64]"

Use when: Saving downloaded assets, exporting files, project file management
Don't use when: Creating files from Blender operations (use Blender export tools)

Performance: Depends on file size, typically fast for assets under 100MB

Security: Validates file paths and saves within project directory
`,
      inputSchema: SaveFileSchema,
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

        // Get project directory for relative path resolution
        const blenderResponse = await client.sendCommand('get_project_directory', {});

        if (blenderResponse.status === 'error') {
          return {
            content: [{
              type: 'text',
              text: `Error: ${blenderResponse.message || 'Failed to get project directory'}`
            }]
          };
        }

        const projectDir = blenderResponse.result as string;
        const fullPath = `${projectDir}/${params.file_path}`;

        // Check if file exists and overwrite protection
        try {
          await FileUtils.getFileInfo(fullPath);
          if (!params.overwrite) {
            return {
              content: [{
                type: 'text',
                text: `Error: File already exists: ${params.file_path} (use overwrite=true to replace)`
              }]
            };
          }
        } catch {
          // File doesn't exist, that's fine
        }

        const fileInfo = await FileUtils.writeBase64File(fullPath, params.data);

        return {
          content: [{
            type: 'text',
            text: `Successfully saved ${FileUtils.formatFileSize(fileInfo.size)} file: ${params.file_path} (${fileInfo.mimeType})`
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

  // Tool 18: Download File
  server.registerTool(
    'blender_download_file',
    {
      title: 'Download File to Project',
      description: `Download file from URL and save to Blender project directory.

Supports downloading assets, textures, and reference materials from external sources.

Args:
  - url (string): URL to download from
  - destination_path (string): Destination file path (relative to project)
  - timeout (number, default 30000): Download timeout in milliseconds

Returns:
  Download confirmation with file size, type, and save location

Examples:
  - Download texture: url="https://example.com/texture.jpg", destination_path="assets/textures/download.jpg"
  - Download model: url="https://example.com/model.fbx", destination_path="assets/models/download.fbx"
  - Reference image: url="https://example.com/ref.png", destination_path="references/ref.png"

Use when: Downloading external assets, reference materials, textures from web
Don't use when: Accessing local files (use save_file with local data)

Performance: Depends on file size and network speed, timeout protection included

Security: Validates URLs, enforces timeouts, saves within project directory
`,
      inputSchema: DownloadFileSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params): Promise<ToolResult> => {
      try {
        const client = getBlenderClient();

        // Get project directory for relative path resolution
        const blenderResponse = await client.sendCommand('get_project_directory', {});

        if (blenderResponse.status === 'error') {
          return {
            content: [{
              type: 'text',
              text: `Error: ${blenderResponse.message || 'Failed to get project directory'}`
            }]
          };
        }

        const projectDir = blenderResponse.result as string;
        const fullPath = `${projectDir}/${params.destination_path}`;

        // Download file with timeout
        const downloadPromise = FileUtils.downloadFile(params.url, fullPath);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Download timeout exceeded')), params.timeout)
        );

        const fileInfo = await Promise.race([downloadPromise, timeoutPromise]) as {
          name: string;
          path: string;
          size: number;
          extension: string;
          mimeType: string;
        };

        return {
          content: [{
            type: 'text',
            text: `Successfully downloaded ${FileUtils.formatFileSize(fileInfo.size)} file: ${params.destination_path} (${fileInfo.mimeType})`
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