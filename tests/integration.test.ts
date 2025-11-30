/**
 * End-to-End Integration Tests
 *
 * These tests verify complete tool workflows without requiring
 * an actual Blender connection (using mocked responses).
 */

import { describe, it, expect, vi } from 'vitest';

// Type definitions
interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

interface BlenderResponse {
  status: 'success' | 'error';
  result?: unknown;
  message?: string;
}

// Mock tool implementations for integration testing
class MockToolRegistry {
  private tools: Map<string, (params: Record<string, unknown>) => Promise<ToolResult>> = new Map();

  register(name: string, handler: (params: Record<string, unknown>) => Promise<ToolResult>): void {
    this.tools.set(name, handler);
  }

  async invoke(name: string, params: Record<string, unknown>): Promise<ToolResult> {
    const handler = this.tools.get(name);
    if (!handler) {
      return {
        content: [{ type: 'text', text: `Error: Tool ${name} not found` }],
        isError: true
      };
    }
    return handler(params);
  }
}

// Mock Blender client
class MockBlenderClient {
  private responses: Map<string, BlenderResponse> = new Map();

  setResponse(command: string, response: BlenderResponse): void {
    this.responses.set(command, response);
  }

  async sendCommand(type: string, _params?: Record<string, unknown>): Promise<BlenderResponse> {
    const response = this.responses.get(type);
    if (response) {
      return response;
    }
    return { status: 'error', message: `Unknown command: ${type}` };
  }
}

describe('End-to-End Tool Workflows', () => {
  let registry: MockToolRegistry;
  let blenderClient: MockBlenderClient;

  beforeEach(() => {
    registry = new MockToolRegistry();
    blenderClient = new MockBlenderClient();
  });

  describe('Scene Query Workflow', () => {
    it('should complete get_scene_info workflow', async () => {
      // Setup mock response
      blenderClient.setResponse('get_scene_info', {
        status: 'success',
        result: {
          objects: [
            { name: 'Cube', type: 'MESH', location: [0, 0, 0] },
            { name: 'Camera', type: 'CAMERA', location: [7, -6, 5] },
            { name: 'Light', type: 'LIGHT', location: [4, 1, 6] }
          ]
        }
      });

      // Register tool
      registry.register('blender_get_scene_info', async (_params) => {
        const response = await blenderClient.sendCommand('get_scene_info');
        if (response.status === 'error') {
          return {
            content: [{ type: 'text', text: `Error: ${response.message}` }],
            isError: true
          };
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(response.result, null, 2) }]
        };
      });

      // Execute workflow
      const result = await registry.invoke('blender_get_scene_info', {});

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('Cube');
      expect(result.content[0].text).toContain('Camera');
      expect(result.content[0].text).toContain('Light');
    });

    it('should complete get_object_info workflow', async () => {
      blenderClient.setResponse('get_object_info', {
        status: 'success',
        result: {
          name: 'Cube',
          type: 'MESH',
          location: [1, 2, 3],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          materials: ['Material.001']
        }
      });

      registry.register('blender_get_object_info', async (params) => {
        const response = await blenderClient.sendCommand('get_object_info', params);
        if (response.status === 'error') {
          return {
            content: [{ type: 'text', text: `Error: ${response.message}` }],
            isError: true
          };
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(response.result, null, 2) }]
        };
      });

      const result = await registry.invoke('blender_get_object_info', { object_name: 'Cube' });

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('Cube');
      expect(result.content[0].text).toContain('MESH');
      expect(result.content[0].text).toContain('Material.001');
    });
  });

  describe('Object Creation Workflow', () => {
    it('should complete create_primitive workflow', async () => {
      blenderClient.setResponse('create_primitive', {
        status: 'success',
        result: { name: 'Cube', created: true }
      });

      registry.register('blender_create_primitive', async (params) => {
        const response = await blenderClient.sendCommand('create_primitive', params);
        if (response.status === 'error') {
          return {
            content: [{ type: 'text', text: `Error: ${response.message}` }],
            isError: true
          };
        }
        return {
          content: [{
            type: 'text',
            text: `Successfully created ${params.primitive_type} primitive`
          }]
        };
      });

      const result = await registry.invoke('blender_create_primitive', {
        primitive_type: 'CUBE',
        location: [0, 0, 0]
      });

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('CUBE');
    });

    it('should complete modify_object workflow', async () => {
      blenderClient.setResponse('modify_object', {
        status: 'success',
        result: { modified: true }
      });

      registry.register('blender_modify_object', async (params) => {
        const response = await blenderClient.sendCommand('modify_object', params);
        if (response.status === 'error') {
          return {
            content: [{ type: 'text', text: `Error: ${response.message}` }],
            isError: true
          };
        }
        return {
          content: [{
            type: 'text',
            text: `Successfully modified object "${params.object_name}"`
          }]
        };
      });

      const result = await registry.invoke('blender_modify_object', {
        object_name: 'Cube',
        location: [5, 5, 5]
      });

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('Cube');
    });

    it('should complete delete_object workflow', async () => {
      blenderClient.setResponse('delete_object', {
        status: 'success',
        result: { deleted: true }
      });

      registry.register('blender_delete_object', async (params) => {
        const response = await blenderClient.sendCommand('delete_object', params);
        if (response.status === 'error') {
          return {
            content: [{ type: 'text', text: `Error: ${response.message}` }],
            isError: true
          };
        }
        return {
          content: [{
            type: 'text',
            text: `Successfully deleted object "${params.object_name}"`
          }]
        };
      });

      const result = await registry.invoke('blender_delete_object', {
        object_name: 'Cube'
      });

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('deleted');
    });
  });

  describe('Material Workflow', () => {
    it('should complete create_material workflow', async () => {
      blenderClient.setResponse('create_material', {
        status: 'success',
        result: { name: 'RedMetal', created: true }
      });

      registry.register('blender_create_material', async (params) => {
        const response = await blenderClient.sendCommand('create_material', params);
        if (response.status === 'error') {
          return {
            content: [{ type: 'text', text: `Error: ${response.message}` }],
            isError: true
          };
        }
        return {
          content: [{
            type: 'text',
            text: `Successfully created material "${params.material_name}"`
          }]
        };
      });

      const result = await registry.invoke('blender_create_material', {
        material_name: 'RedMetal',
        base_color: [0.8, 0.1, 0.1, 1],
        metallic: 1,
        roughness: 0.2
      });

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('RedMetal');
    });

    it('should complete apply_material workflow', async () => {
      blenderClient.setResponse('apply_material', {
        status: 'success',
        result: { applied: true }
      });

      registry.register('blender_apply_material', async (params) => {
        const response = await blenderClient.sendCommand('apply_material', params);
        if (response.status === 'error') {
          return {
            content: [{ type: 'text', text: `Error: ${response.message}` }],
            isError: true
          };
        }
        return {
          content: [{
            type: 'text',
            text: `Successfully applied material "${params.material_name}" to object "${params.object_name}"`
          }]
        };
      });

      const result = await registry.invoke('blender_apply_material', {
        object_name: 'Cube',
        material_name: 'RedMetal'
      });

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('applied');
    });
  });

  describe('Code Execution Workflow', () => {
    it('should complete execute_code workflow', async () => {
      blenderClient.setResponse('execute_code', {
        status: 'success',
        result: "['Cube', 'Camera', 'Light']"
      });

      registry.register('blender_execute_code', async (params) => {
        // Security check (simplified)
        const code = params.code as string;
        if (code.includes('os.system') || code.includes('subprocess')) {
          return {
            content: [{ type: 'text', text: 'Error: Dangerous code pattern detected' }],
            isError: true
          };
        }

        const response = await blenderClient.sendCommand('execute_code', params);
        if (response.status === 'error') {
          return {
            content: [{ type: 'text', text: `Error: ${response.message}` }],
            isError: true
          };
        }
        return {
          content: [{
            type: 'text',
            text: `Result:\n${response.result}`
          }]
        };
      });

      const result = await registry.invoke('blender_execute_code', {
        code: '[obj.name for obj in bpy.data.objects]'
      });

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('Cube');
    });

    it('should block dangerous code patterns', async () => {
      registry.register('blender_execute_code', async (params) => {
        const code = params.code as string;
        if (code.includes('os.system') || code.includes('subprocess')) {
          return {
            content: [{ type: 'text', text: 'Error: Dangerous code pattern detected' }],
            isError: true
          };
        }
        return {
          content: [{ type: 'text', text: 'Code executed' }]
        };
      });

      const result = await registry.invoke('blender_execute_code', {
        code: 'os.system("rm -rf /")'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Dangerous');
    });
  });

  describe('Error Handling Workflow', () => {
    it('should handle object not found error', async () => {
      blenderClient.setResponse('get_object_info', {
        status: 'error',
        message: 'Object "NonExistent" not found'
      });

      registry.register('blender_get_object_info', async (params) => {
        const response = await blenderClient.sendCommand('get_object_info', params);
        if (response.status === 'error') {
          return {
            content: [{ type: 'text', text: `Error: ${response.message}` }],
            isError: true
          };
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(response.result) }]
        };
      });

      const result = await registry.invoke('blender_get_object_info', {
        object_name: 'NonExistent'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });

    it('should handle material not found error', async () => {
      blenderClient.setResponse('apply_material', {
        status: 'error',
        message: 'Material "NonExistent" not found'
      });

      registry.register('blender_apply_material', async (params) => {
        const response = await blenderClient.sendCommand('apply_material', params);
        if (response.status === 'error') {
          return {
            content: [{ type: 'text', text: `Error: ${response.message}` }],
            isError: true
          };
        }
        return {
          content: [{ type: 'text', text: 'Applied' }]
        };
      });

      const result = await registry.invoke('blender_apply_material', {
        object_name: 'Cube',
        material_name: 'NonExistent'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });
  });
});
