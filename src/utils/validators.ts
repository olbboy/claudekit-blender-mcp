import { z } from 'zod';
import { resolve, normalize } from 'path';
import { logger } from './logger.js';

/**
 * Security constants for validation
 */
const MAX_PATH_LENGTH = 512;
const PROJECT_ROOT = process.cwd();

/**
 * Validate Blender object name (alphanumeric + underscores)
 */
export const objectNameSchema = z.string()
  .min(1, 'Object name required')
  .max(64, 'Object name too long')
  .regex(/^[a-zA-Z0-9_]+$/, 'Object name must be alphanumeric with underscores');

/**
 * Validate 3D vector (location, rotation, scale)
 *
 * EDGE-002 FIX: Added .finite() constraint to reject NaN and Infinity values
 * which would cause rendering issues or crashes in Blender.
 */
export const vector3Schema = z.tuple([
  z.number().finite('X coordinate must be finite'),
  z.number().finite('Y coordinate must be finite'),
  z.number().finite('Z coordinate must be finite')
]).refine(
  ([x, y, z]) => !Number.isNaN(x) && !Number.isNaN(y) && !Number.isNaN(z),
  { message: 'Coordinates cannot be NaN' }
).describe('3D vector [x, y, z]');

/**
 * Validate color (RGBA)
 *
 * EDGE-003 FIX: Added .finite() constraint to reject NaN values
 * which would cause color rendering issues in Blender.
 */
export const colorSchema = z.tuple([
  z.number().min(0).max(1).finite('Red channel must be finite'),
  z.number().min(0).max(1).finite('Green channel must be finite'),
  z.number().min(0).max(1).finite('Blue channel must be finite'),
  z.number().min(0).max(1).finite('Alpha channel must be finite')
]).refine(
  ([r, g, b, a]) => !Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b) && !Number.isNaN(a),
  { message: 'Color values cannot be NaN' }
).describe('RGBA color [r, g, b, a] with values 0-1');

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
 * Decode URL-encoded strings recursively to prevent double-encoding bypass
 * @param input - Potentially URL-encoded string
 * @returns Fully decoded string
 */
function decodePathFully(input: string): string {
  let decoded = input;
  let previous = '';
  let iterations = 0;
  const maxIterations = 10; // Prevent infinite loops on malformed input

  // Keep decoding until no change (handles double/triple encoding)
  while (decoded !== previous && iterations < maxIterations) {
    previous = decoded;
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      // Invalid URI encoding - stop decoding
      break;
    }
    iterations++;
  }

  return decoded;
}

/**
 * Sanitize path by removing dangerous characters and patterns
 * @param input - Raw path input
 * @returns Sanitized path
 */
function sanitizePath(input: string): string {
  let sanitized = input;

  // Step 1: Remove null bytes (null byte injection attack)
  sanitized = sanitized.replace(/\0/g, '');

  // Step 2: Remove backslash variations (Windows path confusion)
  sanitized = sanitized.replace(/\\/g, '/');

  // Step 3: Remove unicode homoglyphs that look like dots/slashes
  // Common attack: using similar-looking characters
  sanitized = sanitized.replace(/[\u2024\u2025\u2026]/g, '.'); // One dot leader, two dot leader, ellipsis
  sanitized = sanitized.replace(/[\u2215\u2044\u29f8]/g, '/'); // Division slash, fraction slash, big solidus

  // Step 4: Collapse multiple slashes
  sanitized = sanitized.replace(/\/+/g, '/');

  // Step 5: Remove leading/trailing slashes and whitespace
  sanitized = sanitized.trim().replace(/^\/+|\/+$/g, '');

  return sanitized;
}

/**
 * Detect path traversal attack patterns
 * @param path - Path to check
 * @returns Object with detection result and attack vector details
 */
function detectPathTraversal(path: string): { isAttack: boolean; vector?: string } {
  // Pattern 1: Direct parent directory reference
  if (path.includes('..')) {
    return { isAttack: true, vector: 'parent_directory_reference' };
  }

  // Pattern 2: Encoded parent directory (even after decoding)
  if (/%2e%2e/i.test(path) || /%252e/i.test(path)) {
    return { isAttack: true, vector: 'encoded_traversal' };
  }

  // Pattern 3: Dot-slash combinations that could bypass
  if (/\.\.\//i.test(path) || /\.\.$/i.test(path)) {
    return { isAttack: true, vector: 'dot_slash_traversal' };
  }

  // Pattern 4: Backslash variants (Windows-style traversal)
  if (/\.\.\\/.test(path) || /\\\.\./.test(path)) {
    return { isAttack: true, vector: 'backslash_traversal' };
  }

  return { isAttack: false };
}

/**
 * Validate that resolved path stays within project root
 * @param normalizedPath - Already normalized relative path
 * @returns True if path is safely within project boundary
 */
function isWithinProjectBoundary(normalizedPath: string): boolean {
  try {
    const absolutePath = resolve(PROJECT_ROOT, normalizedPath);
    const normalizedAbsolute = normalize(absolutePath);
    const normalizedRoot = normalize(PROJECT_ROOT);

    // Ensure the resolved path starts with project root
    // Use path separator to prevent prefix attacks (e.g., /project vs /project-other)
    return normalizedAbsolute === normalizedRoot ||
           normalizedAbsolute.startsWith(normalizedRoot + '/');
  } catch {
    return false;
  }
}

/**
 * Validate file path with comprehensive security checks
 *
 * Security measures:
 * - URL decoding (prevents double-encoding bypass)
 * - Null byte removal (prevents null byte injection)
 * - Path normalization (prevents path confusion)
 * - Traversal detection (prevents directory escape)
 * - Boundary validation (ensures path stays in project)
 * - Character allowlist (prevents injection)
 * - Hidden file protection (prevents dotfile access)
 *
 * @example
 * filePathSchema.parse('assets/model.blend'); // OK
 * filePathSchema.parse('../../../etc/passwd'); // Throws
 * filePathSchema.parse('..%2F..%2Fetc%2Fpasswd'); // Throws
 */
export const filePathSchema = z.string()
  .min(1, 'File path required')
  .max(MAX_PATH_LENGTH, `File path too long (max ${MAX_PATH_LENGTH} chars)`)
  // Step 1: Decode and sanitize the path
  .transform((rawPath) => {
    const decoded = decodePathFully(rawPath);
    const sanitized = sanitizePath(decoded);
    return { original: rawPath, sanitized };
  })
  // Step 2: Check for traversal attacks AFTER decoding
  .refine(
    ({ sanitized }) => {
      const detection = detectPathTraversal(sanitized);
      if (detection.isAttack) {
        logger.warn('Path traversal attack blocked', {
          vector: detection.vector,
          operation: 'file_path_validation'
        });
      }
      return !detection.isAttack;
    },
    { message: 'Path traversal not allowed' }
  )
  // Step 3: Check for absolute paths
  .refine(
    ({ sanitized }) => !sanitized.startsWith('/'),
    { message: 'Absolute paths not allowed' }
  )
  // Step 4: Check for hidden files (dotfiles) - security risk
  .refine(
    ({ sanitized }) => {
      // Block paths starting with dot or containing /. (hidden directories)
      const hasHiddenComponent = sanitized.startsWith('.') ||
                                  /\/\./.test(sanitized) ||
                                  sanitized.includes('/.');
      if (hasHiddenComponent) {
        logger.warn('Hidden file access blocked', {
          operation: 'file_path_validation'
        });
      }
      return !hasHiddenComponent;
    },
    { message: 'Hidden files/directories not allowed' }
  )
  // Step 5: Validate character allowlist
  .refine(
    ({ sanitized }) => /^[a-zA-Z0-9_\-./]+$/.test(sanitized),
    { message: 'Invalid characters in file path' }
  )
  // Step 6: Ensure path stays within project boundary
  .refine(
    ({ sanitized }) => {
      const withinBoundary = isWithinProjectBoundary(sanitized);
      if (!withinBoundary) {
        logger.error('Path boundary escape blocked', undefined, {
          operation: 'file_path_validation'
        });
      }
      return withinBoundary;
    },
    { message: 'Path escapes project directory' }
  )
  // Step 7: Return only the sanitized path
  .transform(({ sanitized }) => sanitized);

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
 *
 * BUG-008 FIX: Enhanced sanitization to prevent injection attacks
 * - Removes control characters
 * - Removes consecutive spaces
 * - Validates after cleaning
 */
export const searchQuerySchema = z.string()
  .min(1, 'Search query required')
  .max(200, 'Search query too long')
  .regex(/^[a-zA-Z0-9\s\-_.,]+$/, 'Invalid characters in search query')
  .transform((query) => {
    // BUG-008 FIX: Remove control characters (null byte injection attack)
    let cleaned = query.trim().replace(/[\x00-\x1f\x7f]/g, '');

    // BUG-008 FIX: Remove consecutive spaces
    cleaned = cleaned.replace(/\s+/g, ' ');

    return cleaned;
  })
  .refine(
    (query) => query.length > 0,
    { message: 'Query cannot be empty after cleaning' }
  )
  .describe('Asset search query');

/**
 * Safely encode search query for URL usage
 * BUG-008 FIX: Always URL encode validated queries before API calls
 */
export function safeSearchQuery(query: string): string {
  const validated = searchQuerySchema.parse(query);
  return encodeURIComponent(validated);
}

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
 *
 * BUG-014 FIX: Enhanced validation for proper base64 structure:
 * - Valid characters only (A-Z, a-z, 0-9, +, /)
 * - Proper padding (= or ==) at the end only
 * - Length must be multiple of 4 (with padding)
 * - Attempt actual decode to verify validity
 */
export const base64Schema = z.string()
  .min(1, 'Base64 data required')
  .regex(/^[A-Za-z0-9+/]*={0,2}$/, 'Invalid base64 format - only A-Za-z0-9+/= allowed')
  .refine(
    (b64) => {
      // BUG-014 FIX: Validate length is multiple of 4 (including padding)
      if (b64.length % 4 !== 0) {
        return false;
      }

      // BUG-014 FIX: Validate padding structure
      const paddingIndex = b64.indexOf('=');
      if (paddingIndex !== -1) {
        // Padding must be at the end
        const afterPadding = b64.substring(paddingIndex);
        if (!/^={1,2}$/.test(afterPadding)) {
          return false;
        }
      }

      return true;
    },
    { message: 'Invalid base64 structure - length must be multiple of 4 with proper padding' }
  )
  .refine(
    (b64) => {
      // BUG-014 FIX: Attempt decode to verify validity
      try {
        Buffer.from(b64, 'base64');
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Base64 decoding failed - data may be corrupted' }
  )
  .describe('Base64 encoded data (properly padded)');

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
 *
 * BUG-013 FIX: Enhanced validation with:
 * - Clear error message for max limit
 * - Automatic deduplication
 * - Whitespace trimming
 * - Debug logging for removed duplicates
 */
export const tagsSchema = z.array(
  z.string()
    .min(1, 'Tag cannot be empty')
    .max(32, 'Tag too long (max 32 characters)')
    .regex(/^[a-zA-Z0-9_\-]+$/, 'Invalid tag characters - use only alphanumeric, underscore, dash')
    .transform(tag => tag.trim())
)
  .max(20, 'Maximum 20 tags allowed - please reduce the number of tags')
  .default([])
  .transform((tags) => {
    // BUG-013 FIX: Remove duplicates and normalize
    const uniqueTags = [...new Set(tags)];

    if (uniqueTags.length !== tags.length) {
      logger.debug('Duplicate tags removed during validation', {
        operation: 'tagsSchema',
        original: tags.length,
        unique: uniqueTags.length,
        removed: tags.length - uniqueTags.length
      });
    }

    return uniqueTags;
  })
  .describe('Asset tags array (max 20, deduplicated)');

/**
 * Helper to handle Zod validation errors
 */
export function formatZodError(error: z.ZodError): string {
  const issues = error.issues.map(issue =>
    `${issue.path.join('.')}: ${issue.message}`
  );
  return `Validation error: ${issues.join(', ')}`;
}