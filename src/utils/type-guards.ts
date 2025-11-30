/**
 * Runtime Type Guards
 *
 * Provides type guard functions for runtime type checking,
 * ensuring type safety at runtime boundaries.
 */

import type {
  BlenderSocketResponse,
  ToolResult,
  TextContent,
  ImageContent,
  ToolContent,
  AssetMetadata,
  AssetType,
  AssetFormat,
  AssetSource
} from '../types/index.js';

/**
 * Type guard to check if a value is a non-null object
 * @param value - Value to check
 * @returns True if value is a non-null object
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Type guard to check if a value is a string
 * @param value - Value to check
 * @returns True if value is a string
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Type guard to check if a value is a number
 * @param value - Value to check
 * @returns True if value is a finite number
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && isFinite(value);
}

/**
 * Type guard to check if a value is a boolean
 * @param value - Value to check
 * @returns True if value is a boolean
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * Type guard to check if a value is an array
 * @param value - Value to check
 * @returns True if value is an array
 */
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * Type guard to check if a value is an array of strings
 * @param value - Value to check
 * @returns True if value is an array of strings
 */
export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

/**
 * Type guard to check if a value is an array of numbers
 * @param value - Value to check
 * @returns True if value is an array of numbers
 */
export function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(item => typeof item === 'number' && isFinite(item));
}

/**
 * Type guard to check if a value is a 3D vector [x, y, z]
 * @param value - Value to check
 * @returns True if value is a tuple of 3 numbers
 */
export function isVector3(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every(v => typeof v === 'number' && isFinite(v))
  );
}

/**
 * Type guard to check if a value is an RGBA color [r, g, b, a]
 * @param value - Value to check
 * @returns True if value is a tuple of 4 numbers between 0 and 1
 */
export function isRGBAColor(value: unknown): value is [number, number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every(v => typeof v === 'number' && v >= 0 && v <= 1)
  );
}

/**
 * Type guard to check if a value is a valid BlenderSocketResponse
 * @param value - Value to check
 * @returns True if value matches BlenderSocketResponse structure
 */
export function isBlenderSocketResponse(value: unknown): value is BlenderSocketResponse {
  if (!isObject(value)) return false;
  if (value.status !== 'success' && value.status !== 'error') return false;
  if (value.message !== undefined && typeof value.message !== 'string') return false;
  return true;
}

/**
 * Type guard to check if a value is a TextContent
 * @param value - Value to check
 * @returns True if value matches TextContent structure
 */
export function isTextContent(value: unknown): value is TextContent {
  if (!isObject(value)) return false;
  return value.type === 'text' && typeof value.text === 'string';
}

/**
 * Type guard to check if a value is an ImageContent
 * @param value - Value to check
 * @returns True if value matches ImageContent structure
 */
export function isImageContent(value: unknown): value is ImageContent {
  if (!isObject(value)) return false;
  if (value.type !== 'image') return false;
  if (typeof value.data !== 'string') return false;
  const validMimeTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
  return validMimeTypes.includes(value.mimeType as string);
}

/**
 * Type guard to check if a value is valid ToolContent
 * @param value - Value to check
 * @returns True if value is either TextContent or ImageContent
 */
export function isToolContent(value: unknown): value is ToolContent {
  return isTextContent(value) || isImageContent(value);
}

/**
 * Type guard to check if a value is a valid ToolResult
 * @param value - Value to check
 * @returns True if value matches ToolResult structure
 */
export function isToolResult(value: unknown): value is ToolResult {
  if (!isObject(value)) return false;
  if (!Array.isArray(value.content)) return false;
  return value.content.every(isToolContent);
}

/**
 * Type guard to check if a value is a valid AssetType
 * @param value - Value to check
 * @returns True if value is a valid AssetType
 */
export function isAssetType(value: unknown): value is AssetType {
  const validTypes = ['model', 'material', 'texture', 'hdri', 'brush', 'scene'];
  return typeof value === 'string' && validTypes.includes(value);
}

/**
 * Type guard to check if a value is a valid AssetFormat
 * @param value - Value to check
 * @returns True if value is a valid AssetFormat
 */
export function isAssetFormat(value: unknown): value is AssetFormat {
  const validFormats = [
    'fbx', 'obj', 'gltf', 'glb', 'stl', 'ply', 'abc', 'blend',
    'png', 'jpg', 'hdr', 'exr', 'tga'
  ];
  return typeof value === 'string' && validFormats.includes(value);
}

/**
 * Type guard to check if a value is a valid AssetSource
 * @param value - Value to check
 * @returns True if value is a valid AssetSource
 */
export function isAssetSource(value: unknown): value is AssetSource {
  const validSources = ['local', 'polyhaven', 'sketchfab', 'hyper3d', 'hunyuan3d'];
  return typeof value === 'string' && validSources.includes(value);
}

/**
 * Type guard to check if a value is a valid AssetMetadata
 * @param value - Value to check
 * @returns True if value matches AssetMetadata structure
 */
export function isAssetMetadata(value: unknown): value is AssetMetadata {
  if (!isObject(value)) return false;
  if (typeof value.id !== 'string') return false;
  if (typeof value.name !== 'string') return false;
  if (!isAssetType(value.type)) return false;
  if (!isAssetFormat(value.format)) return false;
  if (!isAssetSource(value.source)) return false;
  return true;
}

/**
 * Type guard to check if a value is a valid Error
 * @param value - Value to check
 * @returns True if value is an Error instance
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

/**
 * Safely cast unknown value to a specific type with validation
 * @param value - Value to cast
 * @param guard - Type guard function
 * @param errorMessage - Error message if validation fails
 * @returns The value cast to type T
 * @throws Error if validation fails
 */
export function assertType<T>(
  value: unknown,
  guard: (v: unknown) => v is T,
  errorMessage = 'Type assertion failed'
): T {
  if (!guard(value)) {
    throw new TypeError(errorMessage);
  }
  return value;
}

/**
 * Safely extract a property from an unknown object
 * @param obj - Object to extract from
 * @param key - Property key
 * @param guard - Type guard for the property value
 * @returns The property value or undefined
 */
export function safeGet<T>(
  obj: unknown,
  key: string,
  guard: (v: unknown) => v is T
): T | undefined {
  if (!isObject(obj)) return undefined;
  const value = obj[key];
  return guard(value) ? value : undefined;
}

/**
 * Safely extract a required property from an unknown object
 * @param obj - Object to extract from
 * @param key - Property key
 * @param guard - Type guard for the property value
 * @param errorMessage - Error message if extraction fails
 * @returns The property value
 * @throws Error if property is missing or invalid
 */
export function safeGetRequired<T>(
  obj: unknown,
  key: string,
  guard: (v: unknown) => v is T,
  errorMessage?: string
): T {
  const value = safeGet(obj, key, guard);
  if (value === undefined) {
    throw new TypeError(errorMessage || `Required property "${key}" is missing or invalid`);
  }
  return value;
}

/**
 * Type narrowing utility for handling union types
 * @param value - Value to check
 * @param predicates - Array of predicate functions
 * @returns The first predicate that returns true, or undefined
 */
export function narrowType<T extends readonly ((v: unknown) => boolean)[]>(
  value: unknown,
  predicates: T
): number | undefined {
  for (let i = 0; i < predicates.length; i++) {
    if (predicates[i](value)) {
      return i;
    }
  }
  return undefined;
}
