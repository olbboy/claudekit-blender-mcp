export interface BlenderSocketMessage {
  type: string;
  params?: Record<string, unknown>;
}

export interface BlenderSocketResponse {
  status: 'success' | 'error';
  result?: unknown;
  message?: string;
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

// ToolResult interface matching MCP SDK CallToolResult structure
export interface ToolResult {
  [x: string]: unknown;
  content: Array<{
    type: 'text';
    text: string;
    _meta?: Record<string, unknown>;
  }>;
  _meta?: Record<string, unknown>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}