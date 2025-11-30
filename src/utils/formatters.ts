import { ResponseFormat } from '../types/index.js';

/**
 * Format scene info as markdown
 */
export function formatSceneInfoMarkdown(data: any): string {
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

/**
 * Format object info as markdown
 */
export function formatObjectInfoMarkdown(data: any): string {
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

/**
 * Format data based on requested format
 */
export function formatResponse(
  data: any,
  format: ResponseFormat,
  formatter?: (data: any) => string
): string {
  if (format === ResponseFormat.JSON) {
    return JSON.stringify(data, null, 2);
  }

  if (formatter) {
    return formatter(data);
  }

  // Default markdown
  return JSON.stringify(data, null, 2);
}

/**
 * Truncate response if exceeds character limit
 */
export function truncateResponse(
  text: string,
  limit: number = 25000
): { text: string; truncated: boolean } {
  if (text.length <= limit) {
    return { text, truncated: false };
  }

  const truncatedText = text.slice(0, limit) + '\n\n[Response truncated - exceeded character limit]';
  return { text: truncatedText, truncated: true };
}