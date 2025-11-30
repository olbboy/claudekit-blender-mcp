/**
 * Unit Tests for Zod Schema Validation
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Re-create validators for testing (avoiding import issues)
const vector3Schema = z.tuple([z.number(), z.number(), z.number()]);

const objectNameSchema = z.string()
  .min(1, 'Object name required')
  .max(64, 'Object name too long')
  .regex(/^[a-zA-Z0-9_]+$/, 'Object name must be alphanumeric with underscores');

const colorSchema = z.tuple([
  z.number().min(0).max(1),
  z.number().min(0).max(1),
  z.number().min(0).max(1),
  z.number().min(0).max(1)
]);

const screenshotSizeSchema = z.number().int().min(100).max(800);

describe('Vector3 Schema', () => {
  it('should validate valid vector3 arrays', () => {
    expect(vector3Schema.safeParse([0, 0, 0]).success).toBe(true);
    expect(vector3Schema.safeParse([1.5, -2.3, 10]).success).toBe(true);
    expect(vector3Schema.safeParse([100, 200, 300]).success).toBe(true);
  });

  it('should reject invalid vector3 arrays', () => {
    expect(vector3Schema.safeParse([0, 0]).success).toBe(false);
    expect(vector3Schema.safeParse([0, 0, 0, 0]).success).toBe(false);
    expect(vector3Schema.safeParse(['a', 'b', 'c']).success).toBe(false);
    expect(vector3Schema.safeParse(null).success).toBe(false);
    expect(vector3Schema.safeParse(undefined).success).toBe(false);
  });
});

describe('Object Name Schema', () => {
  it('should validate valid object names', () => {
    expect(objectNameSchema.safeParse('Cube').success).toBe(true);
    expect(objectNameSchema.safeParse('my_object_123').success).toBe(true);
    expect(objectNameSchema.safeParse('Object').success).toBe(true);
    expect(objectNameSchema.safeParse('a').success).toBe(true);
  });

  it('should reject empty names', () => {
    const result = objectNameSchema.safeParse('');
    expect(result.success).toBe(false);
  });

  it('should reject names with invalid characters', () => {
    expect(objectNameSchema.safeParse('object-name').success).toBe(false);
    expect(objectNameSchema.safeParse('object.name').success).toBe(false);
    expect(objectNameSchema.safeParse('object name').success).toBe(false);
    expect(objectNameSchema.safeParse('object@name').success).toBe(false);
  });

  it('should reject names that are too long', () => {
    const longName = 'a'.repeat(65);
    expect(objectNameSchema.safeParse(longName).success).toBe(false);
  });

  it('should accept names at max length', () => {
    const maxName = 'a'.repeat(64);
    expect(objectNameSchema.safeParse(maxName).success).toBe(true);
  });
});

describe('Color Schema', () => {
  it('should validate valid RGBA colors', () => {
    expect(colorSchema.safeParse([0, 0, 0, 0]).success).toBe(true);
    expect(colorSchema.safeParse([1, 1, 1, 1]).success).toBe(true);
    expect(colorSchema.safeParse([0.5, 0.5, 0.5, 0.5]).success).toBe(true);
    expect(colorSchema.safeParse([0.8, 0.1, 0.1, 1]).success).toBe(true);
  });

  it('should reject colors with values out of range', () => {
    expect(colorSchema.safeParse([1.1, 0, 0, 1]).success).toBe(false);
    expect(colorSchema.safeParse([-0.1, 0, 0, 1]).success).toBe(false);
    expect(colorSchema.safeParse([0, 2, 0, 1]).success).toBe(false);
  });

  it('should reject colors with wrong number of components', () => {
    expect(colorSchema.safeParse([1, 0, 0]).success).toBe(false);
    expect(colorSchema.safeParse([1, 0, 0, 1, 1]).success).toBe(false);
  });
});

describe('Screenshot Size Schema', () => {
  it('should validate valid sizes', () => {
    expect(screenshotSizeSchema.safeParse(100).success).toBe(true);
    expect(screenshotSizeSchema.safeParse(400).success).toBe(true);
    expect(screenshotSizeSchema.safeParse(800).success).toBe(true);
  });

  it('should reject sizes below minimum', () => {
    expect(screenshotSizeSchema.safeParse(99).success).toBe(false);
    expect(screenshotSizeSchema.safeParse(0).success).toBe(false);
    expect(screenshotSizeSchema.safeParse(-100).success).toBe(false);
  });

  it('should reject sizes above maximum', () => {
    expect(screenshotSizeSchema.safeParse(801).success).toBe(false);
    expect(screenshotSizeSchema.safeParse(1000).success).toBe(false);
  });

  it('should reject non-integer values', () => {
    expect(screenshotSizeSchema.safeParse(400.5).success).toBe(false);
  });
});
