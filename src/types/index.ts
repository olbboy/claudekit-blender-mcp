export interface BlenderSocketMessage {
  type: string;
  params?: Record<string, unknown>;
}

export interface BlenderSocketResponse {
  status: 'success' | 'error';
  result?: unknown;
  message?: string;
}

/**
 * Type guard for BlenderSocketResponse (TYPE_SAFETY_001 fix)
 * Validates response structure before type casting to prevent runtime errors
 */
export function isBlenderSocketResponse(obj: unknown): obj is BlenderSocketResponse {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const response = obj as Record<string, unknown>;

  // status must be 'success' or 'error'
  if (response.status !== 'success' && response.status !== 'error') {
    return false;
  }

  // message, if present, must be string
  if (response.message !== undefined && typeof response.message !== 'string') {
    return false;
  }

  // result can be anything (unknown) so no validation needed

  return true;
}

export enum ResponseFormat {
  MARKDOWN = 'markdown',
  JSON = 'json'
}

// Asset Integration Types
export enum AssetFormat {
  FBX = 'fbx',
  OBJ = 'obj',
  GLTF = 'gltf',
  GLB = 'glb',
  STL = 'stl',
  PLY = 'ply',
  ABC = 'abc',
  BLEND = 'blend',
  PNG = 'png',
  JPG = 'jpg',
  HDR = 'hdr',
  EXR = 'exr',
  TGA = 'tga'
}

export enum AssetType {
  MODEL = 'model',
  MATERIAL = 'material',
  TEXTURE = 'texture',
  HDRI = 'hdri',
  BRUSH = 'brush',
  SCENE = 'scene'
}

export enum AssetSource {
  LOCAL = 'local',
  POLYHAVEN = 'polyhaven',
  SKETCHFAB = 'sketchfab',
  HYPER3D = 'hyper3d',
  HUNYUAN3D = 'hunyuan3d'
}

export interface AssetMetadata {
  id: string;
  name: string;
  type: AssetType;
  format: AssetFormat;
  source: AssetSource;
  size?: number;
  resolution?: [number, number];
  polyCount?: number;
  tags?: string[];
  author?: string;
  license?: string;
  url?: string;
  downloadUrl?: string;
  thumbnailUrl?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AssetSearchOptions {
  query?: string;
  type?: AssetType;
  format?: AssetFormat;
  source?: AssetSource;
  tags?: string[];
  limit?: number;
  offset?: number;
  sortBy?: 'name' | 'created' | 'updated' | 'downloads';
  sortOrder?: 'asc' | 'desc';
}

export interface ImportOptions {
  location?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  applyTransforms?: boolean;
  mergeWithScene?: boolean;
  generateMaterials?: boolean;
  generateUVs?: boolean;
  decimate?: boolean;
  decimateRatio?: number;
}

export interface ExportOptions {
  format: AssetFormat;
  path?: string;
  selectedOnly?: boolean;
  applyModifiers?: boolean;
  includeMaterials?: boolean;
  includeTextures?: boolean;
  includeAnimations?: boolean;
  compression?: number;
}

// Content types for MCP tool results
export interface TextContent {
  type: 'text';
  text: string;
  _meta?: Record<string, unknown>;
}

export interface ImageContent {
  type: 'image';
  data: string; // Base64 encoded image data
  mimeType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
  _meta?: Record<string, unknown>;
}

export type ToolContent = TextContent | ImageContent;

// ToolResult interface matching MCP SDK CallToolResult structure
export interface ToolResult {
  [x: string]: unknown;
  content: ToolContent[];
  _meta?: Record<string, unknown>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}