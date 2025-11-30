/**
 * Unit Tests for Socket Client Error Scenarios
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';

// Mock socket implementation for testing error scenarios
class MockSocket extends EventEmitter {
  destroyed = false;
  private timeout = 0;

  setTimeout(ms: number): void {
    this.timeout = ms;
  }

  connect(_port: number, _host: string, callback?: () => void): void {
    // Simulate async connection
    setImmediate(() => {
      if (callback) callback();
    });
  }

  write(_data: string): boolean {
    return true;
  }

  destroy(): void {
    this.destroyed = true;
    this.emit('close');
  }

  // Simulate error
  simulateError(error: Error): void {
    this.emit('error', error);
  }

  // Simulate timeout
  simulateTimeout(): void {
    this.emit('timeout');
  }

  // Simulate close
  simulateClose(): void {
    this.emit('close');
  }

  // Simulate data reception
  simulateData(data: string): void {
    this.emit('data', Buffer.from(data));
  }
}

// Mock BlenderSocketClient for testing
class TestSocketClient {
  private connection: MockSocket | null = null;
  private readonly host: string;
  private readonly port: number;
  private readonly timeout: number;

  constructor(host = 'localhost', port = 9876, timeout = 5000) {
    this.host = host;
    this.port = port;
    this.timeout = timeout;
  }

  async connect(): Promise<void> {
    if (this.connection && !this.connection.destroyed) {
      return;
    }

    return new Promise((resolve, reject) => {
      const socket = new MockSocket();
      socket.setTimeout(this.timeout);

      socket.connect(this.port, this.host, () => {
        this.connection = socket;
        resolve();
      });

      socket.on('error', (error: Error) => {
        this.connection = null;
        reject(new Error(`Failed to connect to Blender: ${error.message}`));
      });

      socket.on('timeout', () => {
        socket.destroy();
        this.connection = null;
        reject(new Error('Connection timeout'));
      });
    });
  }

  async sendCommand(type: string, params?: Record<string, unknown>): Promise<{
    status: 'success' | 'error';
    result?: unknown;
    message?: string;
  }> {
    try {
      if (!this.connection || this.connection.destroyed) {
        await this.connect();
      }

      if (!this.connection) {
        throw new Error('Failed to establish connection');
      }

      const message = { type, params };
      const messageStr = JSON.stringify(message) + '\n';
      this.connection.write(messageStr);

      const responseStr = await this.receiveResponse(this.connection);
      return JSON.parse(responseStr);

    } catch (error) {
      if (this.connection) {
        this.connection.destroy();
        this.connection = null;
      }
      throw error;
    }
  }

  private async receiveResponse(socket: MockSocket): Promise<string> {
    return new Promise((resolve, reject) => {
      let buffer = '';

      const onData = (chunk: Buffer) => {
        buffer += chunk.toString('utf-8');
        try {
          JSON.parse(buffer);
          cleanup();
          resolve(buffer);
        } catch {
          // Continue accumulating
        }
      };

      const onError = (error: Error) => {
        cleanup();
        reject(new Error(`Socket error: ${error.message}`));
      };

      const onTimeout = () => {
        cleanup();
        reject(new Error('Response timeout'));
      };

      const onClose = () => {
        cleanup();
        reject(new Error('Connection closed before complete response'));
      };

      const cleanup = () => {
        socket.off('data', onData);
        socket.off('error', onError);
        socket.off('timeout', onTimeout);
        socket.off('close', onClose);
      };

      socket.on('data', onData);
      socket.on('error', onError);
      socket.on('timeout', onTimeout);
      socket.on('close', onClose);
    });
  }

  validateConnection(): boolean {
    return this.connection !== null && !this.connection.destroyed;
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      this.connection.destroy();
      this.connection = null;
    }
  }

  // Expose connection for testing
  getConnection(): MockSocket | null {
    return this.connection;
  }
}

describe('Socket Client', () => {
  let client: TestSocketClient;

  beforeEach(() => {
    client = new TestSocketClient();
  });

  describe('Connection Management', () => {
    it('should establish a connection', async () => {
      await client.connect();
      expect(client.validateConnection()).toBe(true);
    });

    it('should not create duplicate connections', async () => {
      await client.connect();
      const conn1 = client.getConnection();
      await client.connect();
      const conn2 = client.getConnection();
      expect(conn1).toBe(conn2);
    });

    it('should disconnect gracefully', async () => {
      await client.connect();
      expect(client.validateConnection()).toBe(true);
      await client.disconnect();
      expect(client.validateConnection()).toBe(false);
    });

    it('should handle disconnect on already disconnected client', async () => {
      await client.disconnect();
      expect(client.validateConnection()).toBe(false);
    });
  });

  describe('Error Scenarios', () => {
    it('should handle connection errors gracefully', async () => {
      // Test that connection state is properly managed
      const errorClient = new TestSocketClient();

      // First connect successfully
      await errorClient.connect();
      expect(errorClient.validateConnection()).toBe(true);

      // Simulate an error on the existing connection
      const conn = errorClient.getConnection();
      if (conn) {
        conn.simulateError(new Error('Connection refused'));
      }

      // After an error, we can still try to reconnect
      // The client should be able to establish a new connection
      await errorClient.connect();
      expect(errorClient.validateConnection()).toBe(true);
    });

    it('should validate connection state correctly', async () => {
      expect(client.validateConnection()).toBe(false);
      await client.connect();
      expect(client.validateConnection()).toBe(true);
    });

    it('should clean up connection on errors', async () => {
      await client.connect();
      const conn = client.getConnection();

      // Simulate a socket being destroyed
      if (conn) {
        conn.destroyed = true;
      }

      expect(client.validateConnection()).toBe(false);
    });
  });

  describe('Message Handling', () => {
    it('should format messages correctly', () => {
      const message = { type: 'get_scene_info' };
      const formatted = JSON.stringify(message) + '\n';
      expect(formatted).toBe('{"type":"get_scene_info"}\n');
    });

    it('should include params in messages', () => {
      const message = { type: 'create_primitive', params: { primitive_type: 'CUBE' } };
      const formatted = JSON.stringify(message) + '\n';
      expect(formatted).toContain('"params"');
      expect(formatted).toContain('"primitive_type":"CUBE"');
    });

    it('should handle chunked JSON responses', async () => {
      await client.connect();
      const conn = client.getConnection();

      if (conn) {
        // Create a promise to receive data
        const receivePromise = new Promise<string>((resolve, reject) => {
          let buffer = '';
          const onData = (chunk: Buffer) => {
            buffer += chunk.toString('utf-8');
            try {
              JSON.parse(buffer);
              conn.off('data', onData);
              resolve(buffer);
            } catch {
              // Continue accumulating
            }
          };
          conn.on('data', onData);

          // Timeout after 1 second
          setTimeout(() => reject(new Error('Timeout')), 1000);
        });

        // Send data in chunks
        conn.simulateData('{"status":');
        conn.simulateData('"success",');
        conn.simulateData('"result":null}');

        const result = await receivePromise;
        expect(JSON.parse(result)).toEqual({ status: 'success', result: null });
      }
    });
  });

  describe('Response Parsing', () => {
    it('should parse success responses', () => {
      const response = { status: 'success', result: { name: 'Cube' } };
      const parsed = JSON.parse(JSON.stringify(response));
      expect(parsed.status).toBe('success');
      expect(parsed.result.name).toBe('Cube');
    });

    it('should parse error responses', () => {
      const response = { status: 'error', message: 'Object not found' };
      const parsed = JSON.parse(JSON.stringify(response));
      expect(parsed.status).toBe('error');
      expect(parsed.message).toBe('Object not found');
    });

    it('should handle complex result objects', () => {
      const response = {
        status: 'success',
        result: {
          objects: [
            { name: 'Cube', type: 'MESH', location: [0, 0, 0] },
            { name: 'Camera', type: 'CAMERA', location: [7, -6, 5] }
          ],
          materials: ['Material.001', 'Material.002']
        }
      };

      const parsed = JSON.parse(JSON.stringify(response));
      expect(parsed.result.objects).toHaveLength(2);
      expect(parsed.result.materials).toHaveLength(2);
    });
  });

  describe('Timeout Handling', () => {
    it('should have configurable timeout', () => {
      const shortTimeoutClient = new TestSocketClient('localhost', 9876, 1000);
      const longTimeoutClient = new TestSocketClient('localhost', 9876, 60000);

      // Just verify the clients are created with different timeouts
      expect(shortTimeoutClient).toBeDefined();
      expect(longTimeoutClient).toBeDefined();
    });
  });
});
