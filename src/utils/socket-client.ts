import * as net from 'net';
import { BLENDER_HOST, BLENDER_PORT, SOCKET_TIMEOUT } from '../constants.js';
import type { BlenderSocketMessage, BlenderSocketResponse } from '../types/index.js';

class BlenderSocketClient {
  private connection: net.Socket | null = null;
  private readonly host: string;
  private readonly port: number;
  private readonly timeout: number;

  constructor(
    host: string = BLENDER_HOST,
    port: number = BLENDER_PORT,
    timeout: number = SOCKET_TIMEOUT
  ) {
    this.host = host;
    this.port = port;
    this.timeout = timeout;
  }

  /**
   * Establish connection to Blender addon socket server
   */
  async connect(): Promise<void> {
    if (this.connection && !this.connection.destroyed) {
      // Connection already active
      return;
    }

    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      socket.setTimeout(this.timeout);

      socket.connect(this.port, this.host, () => {
        this.connection = socket;
        resolve();
      });

      socket.on('error', (error) => {
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

  /**
   * Send command to Blender and receive response
   */
  async sendCommand(
    type: string,
    params?: Record<string, unknown>
  ): Promise<BlenderSocketResponse> {
    try {
      // Ensure connection
      if (!this.connection || this.connection.destroyed) {
        await this.connect();
      }

      if (!this.connection) {
        throw new Error('Failed to establish connection');
      }

      // Build message
      const message: BlenderSocketMessage = { type };
      if (params) {
        message.params = params;
      }

      const messageStr = JSON.stringify(message) + '\n';

      // Send message
      this.connection.write(messageStr);

      // Receive response
      const responseStr = await this.receiveFullResponse(this.connection);
      const response = JSON.parse(responseStr) as BlenderSocketResponse;

      return response;

    } catch (error) {
      // Cleanup connection on error
      if (this.connection) {
        this.connection.destroy();
        this.connection = null;
      }

      throw error;
    }
  }

  /**
   * Accumulate socket data until complete JSON received
   * Handles chunked responses from Blender addon
   */
  private async receiveFullResponse(socket: net.Socket): Promise<string> {
    return new Promise((resolve, reject) => {
      let buffer = '';

      const onData = (chunk: Buffer) => {
        buffer += chunk.toString('utf-8');

        // Try parsing accumulated buffer
        try {
          JSON.parse(buffer);
          // Success - complete JSON received
          cleanup();
          resolve(buffer);
        } catch {
          // Incomplete JSON - wait for more data
          // Continue accumulating
        }
      };

      const onError = (error: Error) => {
        cleanup();
        reject(new Error(`Socket error: ${error.message}`));
      };

      const onTimeout = () => {
        cleanup();
        reject(new Error('Response timeout - no complete JSON received within 180s'));
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

  /**
   * Validate existing connection
   */
  validateConnection(): boolean {
    return this.connection !== null && !this.connection.destroyed;
  }

  /**
   * Gracefully disconnect
   */
  async disconnect(): Promise<void> {
    if (this.connection) {
      this.connection.destroy();
      this.connection = null;
    }
  }
}

// Singleton instance
let clientInstance: BlenderSocketClient | null = null;

export function getBlenderClient(): BlenderSocketClient {
  if (!clientInstance) {
    clientInstance = new BlenderSocketClient();
  }
  return clientInstance;
}

export { BlenderSocketClient };