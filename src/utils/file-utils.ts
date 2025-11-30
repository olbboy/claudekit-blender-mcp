/**
 * File utilities for asset management
 */

import { promises as fs } from 'fs';
import path from 'path';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  extension: string;
  mimeType: string;
  createdAt: Date;
  modifiedAt: Date;
  isDirectory: boolean;
}

export interface DirectoryListing {
  files: FileInfo[];
  directories: FileInfo[];
  totalSize: number;
  totalCount: number;
}

export class FileUtils {
  /**
   * Get file information
   */
  static async getFileInfo(filePath: string): Promise<FileInfo> {
    try {
      const stats = await fs.stat(filePath);
      const parsedPath = path.parse(filePath);

      return {
        name: parsedPath.base,
        path: path.resolve(filePath),
        size: stats.size,
        extension: parsedPath.ext.toLowerCase(),
        mimeType: this.getMimeType(parsedPath.ext.toLowerCase()),
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime,
        isDirectory: stats.isDirectory()
      };
    } catch (error) {
      throw new Error(`Failed to get file info for ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * List directory contents
   */
  static async listDirectory(dirPath: string, recursive: boolean = false): Promise<DirectoryListing> {
    try {
      const items = await fs.readdir(dirPath, { withFileTypes: true });
      const files: FileInfo[] = [];
      const directories: FileInfo[] = [];
      let totalSize = 0;

      for (const item of items) {
        const fullPath = path.join(dirPath, item.name);

        try {
          const stats = await fs.stat(fullPath);
          const parsedPath = path.parse(fullPath);
          const fileInfo: FileInfo = {
            name: item.name,
            path: fullPath,
            size: stats.size,
            extension: parsedPath.ext.toLowerCase(),
            mimeType: this.getMimeType(parsedPath.ext.toLowerCase()),
            createdAt: stats.birthtime,
            modifiedAt: stats.mtime,
            isDirectory: item.isDirectory()
          };

          if (item.isDirectory()) {
            directories.push(fileInfo);
            if (recursive) {
              const subListing = await this.listDirectory(fullPath, recursive);
              files.push(...subListing.files);
              directories.push(...subListing.directories);
              totalSize += subListing.totalSize;
            }
          } else {
            files.push(fileInfo);
            totalSize += stats.size;
          }
        } catch (error) {
          // Skip files we can't access
          console.warn(`Warning: Could not access ${fullPath}: ${error}`);
          continue;
        }
      }

      return {
        files,
        directories,
        totalSize,
        totalCount: files.length + directories.length
      };
    } catch (error) {
      throw new Error(`Failed to list directory ${dirPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create directory
   */
  static async createDirectory(dirPath: string, recursive: boolean = true): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive });
    } catch (error) {
      throw new Error(`Failed to create directory ${dirPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete file or directory
   */
  static async delete(targetPath: string, recursive: boolean = false): Promise<void> {
    try {
      const stats = await fs.stat(targetPath);

      if (stats.isDirectory()) {
        if (recursive) {
          await fs.rmdir(targetPath, { recursive: true });
        } else {
          await fs.rmdir(targetPath);
        }
      } else {
        await fs.unlink(targetPath);
      }
    } catch (error) {
      throw new Error(`Failed to delete ${targetPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Copy file or directory
   */
  static async copy(sourcePath: string, destPath: string, overwrite: boolean = false): Promise<void> {
    try {
      const sourceStats = await fs.stat(sourcePath);

      if (sourceStats.isDirectory()) {
        await this.copyDirectory(sourcePath, destPath, overwrite);
      } else {
        await this.copyFile(sourcePath, destPath, overwrite);
      }
    } catch (error) {
      throw new Error(`Failed to copy ${sourcePath} to ${destPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Move file or directory
   */
  static async move(sourcePath: string, destPath: string, overwrite: boolean = false): Promise<void> {
    try {
      // Check if destination exists
      try {
        await fs.access(destPath);
        if (!overwrite) {
          throw new Error(`Destination ${destPath} already exists`);
        }
        // Delete existing destination if overwriting
        await this.delete(destPath, true);
      } catch {
        // Destination doesn't exist, that's fine
      }

      await fs.rename(sourcePath, destPath);
    } catch (error) {
      throw new Error(`Failed to move ${sourcePath} to ${destPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Write base64 data to file
   */
  static async writeBase64File(filePath: string, base64Data: string): Promise<FileInfo> {
    try {
      const buffer = Buffer.from(base64Data, 'base64');

      // Ensure directory exists
      const dir = path.dirname(filePath);
      await this.createDirectory(dir, true);

      await fs.writeFile(filePath, buffer);
      return await this.getFileInfo(filePath);
    } catch (error) {
      throw new Error(`Failed to write base64 file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Read file as base64
   */
  static async readBase64File(filePath: string): Promise<{
    data: string;
    mimeType: string;
    size: number;
  }> {
    try {
      const buffer = await fs.readFile(filePath);
      const fileInfo = await this.getFileInfo(filePath);

      return {
        data: buffer.toString('base64'),
        mimeType: fileInfo.mimeType,
        size: buffer.length
      };
    } catch (error) {
      throw new Error(`Failed to read file ${filePath} as base64: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Download file from URL
   */
  static async downloadFile(url: string, destPath: string): Promise<FileInfo> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
      }

      // Ensure directory exists
      const dir = path.dirname(destPath);
      await this.createDirectory(dir, true);

      // Write file
      const fileStream = createWriteStream(destPath);
      await pipeline(
        response.body as any, // Node.js fetch Response.body is a ReadableStream
        fileStream
      );

      return await this.getFileInfo(destPath);
    } catch (error) {
      throw new Error(`Failed to download file from ${url} to ${destPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get MIME type from file extension
   */
  private static getMimeType(extension: string): string {
    const mimeTypes: Record<string, string> = {
      // 3D Models
      '.fbx': 'application/octet-stream',
      '.obj': 'model/obj',
      '.gltf': 'model/gltf+json',
      '.glb': 'model/gltf-binary',
      '.dae': 'model/vnd.collada+xml',
      '.3ds': 'application/x-3ds',
      '.blend': 'application/x-blender',

      // Images
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
      '.tga': 'image/x-targa',
      '.hdr': 'image/vnd.radiance',
      '.exr': 'image/x-exr',

      // Archives
      '.zip': 'application/zip',
      '.rar': 'application/x-rar-compressed',
      '.7z': 'application/x-7z-compressed',

      // Documents
      '.txt': 'text/plain',
      '.json': 'application/json',
      '.xml': 'application/xml',
      '.csv': 'text/csv',

      // Audio
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',

      // Video
      '.mp4': 'video/mp4',
      '.avi': 'video/x-msvideo',
      '.mov': 'video/quicktime'
    };

    return mimeTypes[extension] || 'application/octet-stream';
  }

  /**
   * Copy file helper
   */
  private static async copyFile(sourcePath: string, destPath: string, overwrite: boolean): Promise<void> {
    // Check if destination exists
    try {
      await fs.access(destPath);
      if (!overwrite) {
        throw new Error(`Destination ${destPath} already exists`);
      }
    } catch {
      // Destination doesn't exist, that's fine
    }

    await fs.copyFile(sourcePath, destPath);
  }

  /**
   * Copy directory helper
   */
  private static async copyDirectory(sourcePath: string, destPath: string, overwrite: boolean): Promise<void> {
    // Ensure destination directory exists
    await this.createDirectory(destPath, true);

    const items = await fs.readdir(sourcePath, { withFileTypes: true });

    for (const item of items) {
      const sourceItemPath = path.join(sourcePath, item.name);
      const destItemPath = path.join(destPath, item.name);

      if (item.isDirectory()) {
        await this.copyDirectory(sourceItemPath, destItemPath, overwrite);
      } else {
        await this.copyFile(sourceItemPath, destItemPath, overwrite);
      }
    }
  }

  /**
   * Validate file path for security
   */
  static validatePath(filePath: string, allowedBasePaths: string[] = []): boolean {
    try {
      const resolvedPath = path.resolve(filePath);

      // Check path doesn't contain dangerous patterns
      if (filePath.includes('..') || filePath.includes('~')) {
        return false;
      }

      // If allowed base paths are specified, ensure file is within one of them
      if (allowedBasePaths.length > 0) {
        return allowedBasePaths.some(basePath => {
          const resolvedBase = path.resolve(basePath);
          return resolvedPath.startsWith(resolvedBase);
        });
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file size in human-readable format
   */
  static formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }
}