/**
 * PolyHaven API Client
 *
 * Provides access to PolyHaven's free 3D assets library.
 * PolyHaven offers 10,000+ free CC0-licensed 3D models, textures, and HDRIs.
 */

import type { AssetMetadata, AssetSearchOptions } from '../types/index.js';
import { AssetType, AssetFormat, AssetSource } from '../types/index.js';

// Type mapping between PolyHaven and our types
const polyhavenToAssetType: Record<string, AssetType> = {
  'model': AssetType.MODEL,
  'texture': AssetType.TEXTURE,
  'hdri': AssetType.HDRI
};

const polyhavenToAssetFormat: Record<string, AssetFormat> = {
  'fbx': AssetFormat.FBX,
  'obj': AssetFormat.OBJ,
  'gltf': AssetFormat.GLTF,
  'glb': AssetFormat.GLB,
  'stl': AssetFormat.STL,
  'ply': AssetFormat.PLY,
  'abc': AssetFormat.ABC,
  'blend': AssetFormat.BLEND,
  'png': AssetFormat.PNG,
  'jpg': AssetFormat.JPG,
  'hdr': AssetFormat.HDR,
  'exr': AssetFormat.EXR,
  'tga': AssetFormat.TGA
};

export interface PolyHavenAsset {
  id: string;
  name: string;
  type: 'model' | 'texture' | 'hdri';
  categories: string[];
  tags: string[];
  download_urls: {
    [key: string]: {
      hd?: string;
      '1k'?: string;
      '2k'?: string;
      '4k'?: string;
      '8k'?: string;
    };
  };
  thumb_urls: {
    [key: string]: string;
  };
  maps: {
    [key: string]: {
      [key: string]: string;
    };
  };
  attributes: {
    size?: [number, number, number];
    polycount?: number;
    resolution?: [number, number];
    filesize?: number;
    format?: string;
    license?: string;
  };
  author: string;
  license: string;
  url: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export class PolyHavenClient {
  private static readonly BASE_URL = 'https://api.polyhaven.com';
  private static readonly BASE_CDN = 'https://dl.polyhaven.org';

  /**
   * Search for assets on PolyHaven
   */
  static async searchAssets(options: AssetSearchOptions = {}): Promise<{
    assets: PolyHavenAsset[];
    total: number;
    hasMore: boolean;
  }> {
    const params = new URLSearchParams();

    if (options.query) params.append('q', options.query);
    if (options.type) params.append('type', options.type);
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.offset) params.append('offset', options.offset.toString());
    if (options.tags?.length) {
      params.append('tags', options.tags.join(','));
    }
    if (options.sortBy) {
      const sortMap = {
        name: 'name',
        created: 'created_at',
        updated: 'updated_at',
        downloads: 'downloads'
      };
      params.append('sort', sortMap[options.sortBy] || options.sortBy);
    }
    if (options.sortOrder) {
      params.append('order', options.sortOrder);
    }

    try {
      const response = await fetch(`${this.BASE_URL}/search?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`PolyHaven API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as {
        results?: PolyHavenAsset[];
        total?: number;
        has_more?: boolean;
      };
      return {
        assets: data.results || [],
        total: data.total || 0,
        hasMore: data.has_more || false
      };
    } catch (error) {
      throw new Error(`Failed to search PolyHaven assets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get detailed information about a specific asset
   */
  static async getAssetDetails(assetId: string): Promise<PolyHavenAsset> {
    try {
      const response = await fetch(`${this.BASE_URL}/asset/${assetId}`);
      if (!response.ok) {
        throw new Error(`PolyHaven API error: ${response.status} ${response.statusText}`);
      }

      return await response.json() as PolyHavenAsset;
    } catch (error) {
      throw new Error(`Failed to get PolyHaven asset details: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get download URL for an asset at specific quality
   */
  static getDownloadUrl(asset: PolyHavenAsset, quality: 'hd' | '1k' | '2k' | '4k' | '8k' = '2k'): string | null {
    if (!asset.download_urls || !asset.download_urls[quality]) {
      return null;
    }
    const urls = asset.download_urls as Record<string, string>;
    return urls[quality] || null;
  }

  /**
   * Get thumbnail URL for an asset
   */
  static getThumbnailUrl(asset: PolyHavenAsset): string | null {
    if (!asset.thumb_urls || !asset.thumb_urls['512']) {
      return null;
    }
    return asset.thumb_urls['512'];
  }

  /**
   * Convert PolyHaven asset to our standard AssetMetadata format
   */
  static toAssetMetadata(asset: PolyHavenAsset): AssetMetadata {
    // Determine format from asset type or attributes
    let format: AssetFormat = AssetFormat.BLEND;
    if (asset.type === 'texture' || asset.type === 'hdri') {
      format = asset.type === 'hdri' ? AssetFormat.HDR : AssetFormat.PNG;
    } else if (asset.attributes?.format) {
      const formatLower = asset.attributes.format.toLowerCase();
      format = polyhavenToAssetFormat[formatLower] || AssetFormat.BLEND;
    }

    return {
      id: asset.id,
      name: asset.name,
      type: polyhavenToAssetType[asset.type] || AssetType.MODEL,
      format,
      source: AssetSource.POLYHAVEN,
      size: asset.attributes?.filesize,
      resolution: asset.attributes?.resolution,
      polyCount: asset.attributes?.polycount,
      tags: [...(asset.categories || []), ...(asset.tags || [])],
      author: asset.author,
      license: asset.license,
      url: asset.url,
      downloadUrl: this.getDownloadUrl(asset) || undefined,
      thumbnailUrl: this.getThumbnailUrl(asset) || undefined,
      description: asset.description,
      createdAt: asset.created_at,
      updatedAt: asset.updated_at
    };
  }

  /**
   * Download an asset file (returns the file content as base64)
   */
  static async downloadAsset(assetId: string, quality: 'hd' | '1k' | '2k' | '4k' | '8k' = '2k'): Promise<{
    data: string; // base64 encoded
    filename: string;
    mimeType: string;
    size: number;
  }> {
    const asset = await this.getAssetDetails(assetId);
    const downloadUrl = this.getDownloadUrl(asset, quality);

    if (!downloadUrl) {
      throw new Error(`No download URL available for asset ${assetId} at quality ${quality}`);
    }

    try {
      const response = await fetch(downloadUrl);
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Extract filename from URL headers or generate one
      let filename = `${asset.name}_${quality}`;
      const contentDisposition = response.headers.get('content-disposition');
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }

      // Determine MIME type
      let mimeType = 'application/octet-stream';
      if (asset.type === 'texture' || asset.type === 'hdri') {
        mimeType = asset.type === 'hdri' ? 'image/vnd.radiance' : 'image/png';
      } else if (asset.attributes?.format) {
        const formatMap: Record<string, string> = {
          'fbx': 'application/octet-stream',
          'obj': 'model/obj',
          'gltf': 'model/gltf+json',
          'glb': 'model/gltf-binary'
        };
        mimeType = formatMap[asset.attributes.format.toLowerCase()] || 'application/octet-stream';
      }

      return {
        data: buffer.toString('base64'),
        filename,
        mimeType,
        size: buffer.length
      };
    } catch (error) {
      throw new Error(`Failed to download asset ${assetId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get popular/trending assets
   */
  static async getPopularAssets(type?: AssetType, limit: number = 20): Promise<PolyHavenAsset[]> {
    return this.searchAssets({
      type,
      limit,
      sortBy: 'downloads',
      sortOrder: 'desc'
    }).then(result => result.assets);
  }

  /**
   * Get recently added assets
   */
  static async getRecentAssets(type?: AssetType, limit: number = 20): Promise<PolyHavenAsset[]> {
    return this.searchAssets({
      type,
      limit,
      sortBy: 'created',
      sortOrder: 'desc'
    }).then(result => result.assets);
  }
}