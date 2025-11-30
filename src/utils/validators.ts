import { z } from 'zod';

/**
 * Validate Blender object name (alphanumeric + underscores)
 */
export const objectNameSchema = z.string()
  .min(1, 'Object name required')
  .max(64, 'Object name too long')
  .regex(/^[a-zA-Z0-9_]+$/, 'Object name must be alphanumeric with underscores');

/**
 * Validate 3D vector (location, rotation, scale)
 */
export const vector3Schema = z.tuple([
  z.number(),
  z.number(),
  z.number()
]).describe('3D vector [x, y, z]');

/**
 * Validate color (RGBA)
 */
export const colorSchema = z.tuple([
  z.number().min(0).max(1),
  z.number().min(0).max(1),
  z.number().min(0).max(1),
  z.number().min(0).max(1)
]).describe('RGBA color [r, g, b, a] with values 0-1');

/**
 * Validate screenshot resolution
 */
export const screenshotSizeSchema = z.number()
  .int()
  .min(100, 'Minimum 100px')
  .max(800, 'Maximum 800px (performance limit)');

/**
 * Asset Integration Validators
 */

/**
 * Validate file path (basic security check)
 */
export const filePathSchema = z.string()
  .min(1, 'File path required')
  .max(512, 'File path too long')
  .regex(/^[a-zA-Z0-9_\-./]+$/, 'Invalid characters in file path')
  .transform(path => path.replace(/\\/g, '/')) // Normalize path separators
  .refine(path => !path.includes('..'), 'Path traversal not allowed')
  .refine(path => !path.startsWith('/'), 'Absolute paths not allowed');

/**
 * Validate asset format
 */
export const assetFormatSchema = z.enum([
  'fbx', 'obj', 'gltf', 'glb', 'stl', 'ply', 'abc', 'blend',
  'png', 'jpg', 'hdr', 'exr', 'tga'
]).describe('Asset file format');

/**
 * Validate asset type
 */
export const assetTypeSchema = z.enum([
  'model', 'material', 'texture', 'hdri', 'brush', 'scene'
]).describe('Asset type');

/**
 * Validate asset source
 */
export const assetSourceSchema = z.enum([
  'local', 'polyhaven', 'sketchfab', 'hyper3d', 'hunyuan3d'
]).describe('Asset source platform');

/**
 * Validate import quality level
 */
export const qualitySchema = z.enum(['hd', '1k', '2k', '4k', '8k'])
  .default('2k')
  .describe('Download quality level');

/**
 * Validate search query
 */
export const searchQuerySchema = z.string()
  .min(1, 'Search query required')
  .max(200, 'Search query too long')
  .regex(/^[a-zA-Z0-9\s\-_.,]+$/, 'Invalid characters in search query')
  .transform(query => query.trim())
  .describe('Asset search query');

/**
 * Validate search limit
 */
export const searchLimitSchema = z.number()
  .int()
  .min(1, 'Minimum 1 result')
  .max(100, 'Maximum 100 results')
  .default(20)
  .describe('Search result limit');

/**
 * Validate export compression level (0-100)
 */
export const compressionSchema = z.number()
  .min(0, 'Minimum compression 0')
  .max(100, 'Maximum compression 100')
  .default(80)
  .describe('Export compression level (0-100)');

/**
 * Validate decimation ratio (0.1-1.0)
 */
export const decimationRatioSchema = z.number()
  .min(0.1, 'Minimum decimation ratio 0.1')
  .max(1.0, 'Maximum decimation ratio 1.0')
  .default(1.0)
  .describe('Decimation ratio (0.1-1.0)');

/**
 * Validate timeout duration (1-300 seconds)
 */
export const timeoutSchema = z.number()
  .int()
  .min(1000, 'Minimum 1000ms timeout')
  .max(300000, 'Maximum 300000ms (5 minutes) timeout')
  .default(30000)
  .describe('Operation timeout in milliseconds');

/**
 * Validate base64 data
 */
export const base64Schema = z.string()
  .min(1, 'Base64 data required')
  .regex(/^[A-Za-z0-9+/]*={0,2}$/, 'Invalid base64 format')
  .describe('Base64 encoded data');

/**
 * Validate URL
 */
export const urlSchema = z.string()
  .url('Invalid URL format')
  .max(2048, 'URL too long')
  .describe('Valid URL');

/**
 * Validate directory name
 */
export const directoryNameSchema = z.string()
  .min(1, 'Directory name required')
  .max(64, 'Directory name too long')
  .regex(/^[a-zA-Z0-9_\-]+$/, 'Invalid directory name')
  .describe('Directory name');

/**
 * Validate collection name
 */
export const collectionNameSchema = z.string()
  .min(1, 'Collection name required')
  .max(64, 'Collection name too long')
  .regex(/^[a-zA-Z0-9_\-\s]+$/, 'Invalid collection name')
  .transform(name => name.trim())
  .describe('Blender collection name');

/**
 * Validate tags array
 */
export const tagsSchema = z.array(z.string()
  .min(1, 'Tag cannot be empty')
  .max(32, 'Tag too long')
  .regex(/^[a-zA-Z0-9_\-]+$/, 'Invalid tag format')
)
  .max(20, 'Maximum 20 tags')
  .default([])
  .describe('Asset tags array');

/**
 * Helper to handle Zod validation errors
 */
export function formatZodError(error: z.ZodError): string {
  const issues = error.issues.map(issue =>
    `${issue.path.join('.')}: ${issue.message}`
  );
  return `Validation error: ${issues.join(', ')}`;
}