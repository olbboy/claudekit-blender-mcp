/**
 * Unit Tests for Tool Response Formatting
 */

import { describe, it, expect } from 'vitest';

// Response format enum
enum ResponseFormat {
  MARKDOWN = 'markdown',
  JSON = 'json'
}

// Re-implement formatters for testing
function formatSceneInfoMarkdown(data: {
  objects?: Array<{ name: string; type: string; location?: number[] }>;
}): string {
  const lines: string[] = ['# Blender Scene Info', ''];

  if (data.objects && Array.isArray(data.objects)) {
    lines.push(`## Objects (${data.objects.length})`);
    lines.push('');
    for (const obj of data.objects) {
      lines.push(`### ${obj.name} (${obj.type})`);
      if (obj.location) {
        lines.push(`- Location: [${obj.location.join(', ')}]`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

function formatObjectInfoMarkdown(data: {
  name?: string;
  type?: string;
  location?: number[];
  rotation?: number[];
  scale?: number[];
}): string {
  const lines: string[] = [`# Object: ${data.name || 'Unknown'}`, ''];

  lines.push(`**Type**: ${data.type || 'Unknown'}`);

  if (data.location) {
    lines.push(`**Location**: [${data.location.join(', ')}]`);
  }

  if (data.rotation) {
    lines.push(`**Rotation**: [${data.rotation.join(', ')}]`);
  }

  if (data.scale) {
    lines.push(`**Scale**: [${data.scale.join(', ')}]`);
  }

  return lines.join('\n');
}

function formatResponse(
  data: unknown,
  format: ResponseFormat,
  formatter?: (data: unknown) => string
): string {
  if (format === ResponseFormat.JSON) {
    return JSON.stringify(data, null, 2);
  }

  if (formatter) {
    return formatter(data);
  }

  return JSON.stringify(data, null, 2);
}

function truncateResponse(
  text: string,
  limit: number = 25000
): { text: string; truncated: boolean } {
  if (text.length <= limit) {
    return { text, truncated: false };
  }

  const truncatedText = text.slice(0, limit) + '\n\n[Response truncated - exceeded character limit]';
  return { text: truncatedText, truncated: true };
}

describe('Scene Info Formatter', () => {
  it('should format empty scene', () => {
    const data = { objects: [] };
    const result = formatSceneInfoMarkdown(data);

    expect(result).toContain('# Blender Scene Info');
    expect(result).toContain('## Objects (0)');
  });

  it('should format scene with objects', () => {
    const data = {
      objects: [
        { name: 'Cube', type: 'MESH', location: [0, 0, 0] },
        { name: 'Camera', type: 'CAMERA', location: [7, -6, 5] }
      ]
    };

    const result = formatSceneInfoMarkdown(data);

    expect(result).toContain('## Objects (2)');
    expect(result).toContain('### Cube (MESH)');
    expect(result).toContain('### Camera (CAMERA)');
    expect(result).toContain('- Location: [0, 0, 0]');
    expect(result).toContain('- Location: [7, -6, 5]');
  });

  it('should handle objects without location', () => {
    const data = {
      objects: [
        { name: 'Light', type: 'LIGHT' }
      ]
    };

    const result = formatSceneInfoMarkdown(data);

    expect(result).toContain('### Light (LIGHT)');
    expect(result).not.toContain('Location');
  });

  it('should handle missing objects array', () => {
    const data = {};
    const result = formatSceneInfoMarkdown(data);

    expect(result).toContain('# Blender Scene Info');
    expect(result).not.toContain('## Objects');
  });
});

describe('Object Info Formatter', () => {
  it('should format complete object info', () => {
    const data = {
      name: 'Cube',
      type: 'MESH',
      location: [1, 2, 3],
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    };

    const result = formatObjectInfoMarkdown(data);

    expect(result).toContain('# Object: Cube');
    expect(result).toContain('**Type**: MESH');
    expect(result).toContain('**Location**: [1, 2, 3]');
    expect(result).toContain('**Rotation**: [0, 0, 0]');
    expect(result).toContain('**Scale**: [1, 1, 1]');
  });

  it('should handle partial object info', () => {
    const data = {
      name: 'Light',
      type: 'LIGHT',
      location: [5, 5, 5]
    };

    const result = formatObjectInfoMarkdown(data);

    expect(result).toContain('# Object: Light');
    expect(result).toContain('**Type**: LIGHT');
    expect(result).toContain('**Location**: [5, 5, 5]');
    expect(result).not.toContain('**Rotation**');
    expect(result).not.toContain('**Scale**');
  });

  it('should handle missing name', () => {
    const data = { type: 'MESH' };
    const result = formatObjectInfoMarkdown(data);

    expect(result).toContain('# Object: Unknown');
  });

  it('should handle missing type', () => {
    const data = { name: 'Test' };
    const result = formatObjectInfoMarkdown(data);

    expect(result).toContain('**Type**: Unknown');
  });
});

describe('Response Formatter', () => {
  it('should format as JSON when requested', () => {
    const data = { name: 'Test', value: 42 };
    const result = formatResponse(data, ResponseFormat.JSON);

    expect(result).toBe(JSON.stringify(data, null, 2));
  });

  it('should use custom formatter for markdown', () => {
    const data = { name: 'Cube', type: 'MESH' };
    const result = formatResponse(
      data,
      ResponseFormat.MARKDOWN,
      formatObjectInfoMarkdown
    );

    expect(result).toContain('# Object: Cube');
  });

  it('should fall back to JSON if no formatter provided', () => {
    const data = { custom: 'data' };
    const result = formatResponse(data, ResponseFormat.MARKDOWN);

    expect(result).toBe(JSON.stringify(data, null, 2));
  });
});

describe('Response Truncation', () => {
  it('should not truncate short responses', () => {
    const text = 'Short response';
    const result = truncateResponse(text, 1000);

    expect(result.truncated).toBe(false);
    expect(result.text).toBe(text);
  });

  it('should truncate long responses', () => {
    const text = 'a'.repeat(2000);
    const result = truncateResponse(text, 1000);

    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThan(2000);
    expect(result.text).toContain('[Response truncated');
  });

  it('should use default limit', () => {
    const text = 'a'.repeat(30000);
    const result = truncateResponse(text);

    expect(result.truncated).toBe(true);
    expect(result.text).toContain('[Response truncated');
  });

  it('should handle exact limit boundary', () => {
    const text = 'a'.repeat(1000);
    const result = truncateResponse(text, 1000);

    expect(result.truncated).toBe(false);
    expect(result.text).toBe(text);
  });
});

describe('Complex Formatting Scenarios', () => {
  it('should handle deeply nested scene data', () => {
    const data = {
      objects: [
        {
          name: 'Parent',
          type: 'EMPTY',
          location: [0, 0, 0],
          children: [
            { name: 'Child1', type: 'MESH' },
            { name: 'Child2', type: 'MESH' }
          ]
        }
      ]
    };

    const result = formatSceneInfoMarkdown(data);
    expect(result).toContain('### Parent (EMPTY)');
  });

  it('should handle special characters in names', () => {
    const data = {
      objects: [
        { name: 'Object.001', type: 'MESH', location: [0, 0, 0] },
        { name: 'My-Custom_Object', type: 'MESH', location: [1, 1, 1] }
      ]
    };

    const result = formatSceneInfoMarkdown(data);
    expect(result).toContain('Object.001');
    expect(result).toContain('My-Custom_Object');
  });

  it('should handle floating point locations', () => {
    const data = {
      name: 'Cube',
      type: 'MESH',
      location: [1.123456, 2.654321, 3.111111]
    };

    const result = formatObjectInfoMarkdown(data);
    expect(result).toContain('1.123456');
    expect(result).toContain('2.654321');
  });

  it('should handle negative coordinates', () => {
    const data = {
      name: 'Cube',
      type: 'MESH',
      location: [-5, -10, -15]
    };

    const result = formatObjectInfoMarkdown(data);
    expect(result).toContain('-5, -10, -15');
  });
});
