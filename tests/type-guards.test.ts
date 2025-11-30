/**
 * Unit Tests for Type Guards
 */

import { describe, it, expect } from 'vitest';

// Re-implement type guards for testing
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && isFinite(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(item => typeof item === 'number' && isFinite(item));
}

function isVector3(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every(v => typeof v === 'number' && isFinite(v))
  );
}

function isRGBAColor(value: unknown): value is [number, number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every(v => typeof v === 'number' && v >= 0 && v <= 1)
  );
}

interface BlenderSocketResponse {
  status: 'success' | 'error';
  result?: unknown;
  message?: string;
}

function isBlenderSocketResponse(value: unknown): value is BlenderSocketResponse {
  if (!isObject(value)) return false;
  if (value.status !== 'success' && value.status !== 'error') return false;
  if (value.message !== undefined && typeof value.message !== 'string') return false;
  return true;
}

interface TextContent {
  type: 'text';
  text: string;
}

function isTextContent(value: unknown): value is TextContent {
  if (!isObject(value)) return false;
  return value.type === 'text' && typeof value.text === 'string';
}

interface ImageContent {
  type: 'image';
  data: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
}

function isImageContent(value: unknown): value is ImageContent {
  if (!isObject(value)) return false;
  if (value.type !== 'image') return false;
  if (typeof value.data !== 'string') return false;
  const validMimeTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
  return validMimeTypes.includes(value.mimeType as string);
}

function assertType<T>(
  value: unknown,
  guard: (v: unknown) => v is T,
  errorMessage = 'Type assertion failed'
): T {
  if (!guard(value)) {
    throw new TypeError(errorMessage);
  }
  return value;
}

function safeGet<T>(
  obj: unknown,
  key: string,
  guard: (v: unknown) => v is T
): T | undefined {
  if (!isObject(obj)) return undefined;
  const value = obj[key];
  return guard(value) ? value : undefined;
}

describe('Primitive Type Guards', () => {
  describe('isObject', () => {
    it('should return true for plain objects', () => {
      expect(isObject({})).toBe(true);
      expect(isObject({ a: 1 })).toBe(true);
    });

    it('should return false for arrays', () => {
      expect(isObject([])).toBe(false);
      expect(isObject([1, 2, 3])).toBe(false);
    });

    it('should return false for null', () => {
      expect(isObject(null)).toBe(false);
    });

    it('should return false for primitives', () => {
      expect(isObject('string')).toBe(false);
      expect(isObject(123)).toBe(false);
      expect(isObject(true)).toBe(false);
      expect(isObject(undefined)).toBe(false);
    });
  });

  describe('isString', () => {
    it('should return true for strings', () => {
      expect(isString('')).toBe(true);
      expect(isString('hello')).toBe(true);
      expect(isString('123')).toBe(true);
    });

    it('should return false for non-strings', () => {
      expect(isString(123)).toBe(false);
      expect(isString(null)).toBe(false);
      expect(isString(undefined)).toBe(false);
      expect(isString({})).toBe(false);
    });
  });

  describe('isNumber', () => {
    it('should return true for finite numbers', () => {
      expect(isNumber(0)).toBe(true);
      expect(isNumber(123)).toBe(true);
      expect(isNumber(-456)).toBe(true);
      expect(isNumber(3.14)).toBe(true);
    });

    it('should return false for non-finite numbers', () => {
      expect(isNumber(Infinity)).toBe(false);
      expect(isNumber(-Infinity)).toBe(false);
      expect(isNumber(NaN)).toBe(false);
    });

    it('should return false for non-numbers', () => {
      expect(isNumber('123')).toBe(false);
      expect(isNumber(null)).toBe(false);
    });
  });

  describe('isBoolean', () => {
    it('should return true for booleans', () => {
      expect(isBoolean(true)).toBe(true);
      expect(isBoolean(false)).toBe(true);
    });

    it('should return false for non-booleans', () => {
      expect(isBoolean(0)).toBe(false);
      expect(isBoolean(1)).toBe(false);
      expect(isBoolean('true')).toBe(false);
      expect(isBoolean(null)).toBe(false);
    });
  });
});

describe('Array Type Guards', () => {
  describe('isArray', () => {
    it('should return true for arrays', () => {
      expect(isArray([])).toBe(true);
      expect(isArray([1, 2, 3])).toBe(true);
      expect(isArray(['a', 'b'])).toBe(true);
    });

    it('should return false for non-arrays', () => {
      expect(isArray({})).toBe(false);
      expect(isArray('array')).toBe(false);
      expect(isArray(null)).toBe(false);
    });
  });

  describe('isStringArray', () => {
    it('should return true for string arrays', () => {
      expect(isStringArray([])).toBe(true);
      expect(isStringArray(['a', 'b', 'c'])).toBe(true);
    });

    it('should return false for mixed arrays', () => {
      expect(isStringArray(['a', 1])).toBe(false);
      expect(isStringArray([1, 2, 3])).toBe(false);
    });
  });

  describe('isNumberArray', () => {
    it('should return true for number arrays', () => {
      expect(isNumberArray([])).toBe(true);
      expect(isNumberArray([1, 2, 3])).toBe(true);
      expect(isNumberArray([0.1, 0.2, 0.3])).toBe(true);
    });

    it('should return false for non-number arrays', () => {
      expect(isNumberArray(['1', '2'])).toBe(false);
      expect(isNumberArray([NaN])).toBe(false);
    });
  });
});

describe('Vector and Color Guards', () => {
  describe('isVector3', () => {
    it('should return true for valid 3D vectors', () => {
      expect(isVector3([0, 0, 0])).toBe(true);
      expect(isVector3([1, 2, 3])).toBe(true);
      expect(isVector3([-1.5, 2.5, -3.5])).toBe(true);
    });

    it('should return false for invalid vectors', () => {
      expect(isVector3([1, 2])).toBe(false);
      expect(isVector3([1, 2, 3, 4])).toBe(false);
      expect(isVector3(['1', '2', '3'])).toBe(false);
      expect(isVector3([1, NaN, 3])).toBe(false);
    });
  });

  describe('isRGBAColor', () => {
    it('should return true for valid RGBA colors', () => {
      expect(isRGBAColor([0, 0, 0, 0])).toBe(true);
      expect(isRGBAColor([1, 1, 1, 1])).toBe(true);
      expect(isRGBAColor([0.5, 0.5, 0.5, 0.5])).toBe(true);
    });

    it('should return false for out-of-range values', () => {
      expect(isRGBAColor([1.5, 0, 0, 1])).toBe(false);
      expect(isRGBAColor([-0.1, 0, 0, 1])).toBe(false);
    });

    it('should return false for wrong length', () => {
      expect(isRGBAColor([1, 1, 1])).toBe(false);
      expect(isRGBAColor([1, 1, 1, 1, 1])).toBe(false);
    });
  });
});

describe('Blender Response Guards', () => {
  describe('isBlenderSocketResponse', () => {
    it('should return true for valid success responses', () => {
      expect(isBlenderSocketResponse({ status: 'success' })).toBe(true);
      expect(isBlenderSocketResponse({ status: 'success', result: {} })).toBe(true);
    });

    it('should return true for valid error responses', () => {
      expect(isBlenderSocketResponse({ status: 'error' })).toBe(true);
      expect(isBlenderSocketResponse({ status: 'error', message: 'Failed' })).toBe(true);
    });

    it('should return false for invalid responses', () => {
      expect(isBlenderSocketResponse({ status: 'unknown' })).toBe(false);
      expect(isBlenderSocketResponse({ status: 'success', message: 123 })).toBe(false);
      expect(isBlenderSocketResponse(null)).toBe(false);
      expect(isBlenderSocketResponse({})).toBe(false);
    });
  });
});

describe('Content Type Guards', () => {
  describe('isTextContent', () => {
    it('should return true for valid text content', () => {
      expect(isTextContent({ type: 'text', text: 'Hello' })).toBe(true);
      expect(isTextContent({ type: 'text', text: '' })).toBe(true);
    });

    it('should return false for invalid text content', () => {
      expect(isTextContent({ type: 'text' })).toBe(false);
      expect(isTextContent({ type: 'image', text: 'Hello' })).toBe(false);
      expect(isTextContent({ type: 'text', text: 123 })).toBe(false);
    });
  });

  describe('isImageContent', () => {
    it('should return true for valid image content', () => {
      expect(isImageContent({ type: 'image', data: 'base64data', mimeType: 'image/png' })).toBe(true);
      expect(isImageContent({ type: 'image', data: 'base64data', mimeType: 'image/jpeg' })).toBe(true);
    });

    it('should return false for invalid image content', () => {
      expect(isImageContent({ type: 'image', data: 'data' })).toBe(false);
      expect(isImageContent({ type: 'image', data: 'data', mimeType: 'invalid' })).toBe(false);
      expect(isImageContent({ type: 'text', data: 'data', mimeType: 'image/png' })).toBe(false);
    });
  });
});

describe('Utility Functions', () => {
  describe('assertType', () => {
    it('should return value when guard passes', () => {
      const result = assertType('hello', isString);
      expect(result).toBe('hello');
    });

    it('should throw when guard fails', () => {
      expect(() => assertType(123, isString)).toThrow(TypeError);
      expect(() => assertType(123, isString, 'Custom message')).toThrow('Custom message');
    });
  });

  describe('safeGet', () => {
    it('should return value when property exists and passes guard', () => {
      const obj = { name: 'test', count: 42 };
      expect(safeGet(obj, 'name', isString)).toBe('test');
      expect(safeGet(obj, 'count', isNumber)).toBe(42);
    });

    it('should return undefined when property missing or fails guard', () => {
      const obj = { name: 'test' };
      expect(safeGet(obj, 'missing', isString)).toBeUndefined();
      expect(safeGet(obj, 'name', isNumber)).toBeUndefined();
    });

    it('should return undefined for non-objects', () => {
      expect(safeGet(null, 'key', isString)).toBeUndefined();
      expect(safeGet('string', 'length', isNumber)).toBeUndefined();
    });
  });
});

describe('Edge Cases', () => {
  it('should handle empty values correctly', () => {
    expect(isString('')).toBe(true);
    expect(isNumber(0)).toBe(true);
    expect(isArray([])).toBe(true);
    expect(isObject({})).toBe(true);
  });

  it('should handle special numeric values', () => {
    expect(isNumber(Number.MAX_VALUE)).toBe(true);
    expect(isNumber(Number.MIN_VALUE)).toBe(true);
    expect(isNumber(Number.EPSILON)).toBe(true);
  });

  it('should handle nested objects', () => {
    const nested = { a: { b: { c: 1 } } };
    expect(isObject(nested)).toBe(true);
    expect(isObject(nested.a)).toBe(true);
    expect(isObject(nested.a.b)).toBe(true);
  });
});
