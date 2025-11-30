import * as net from 'net';
import { BLENDER_HOST, BLENDER_PORT, SOCKET_TIMEOUT } from '../constants.js';
import type { BlenderSocketMessage, BlenderSocketResponse } from '../types/index.js';
import { isBlenderSocketResponse } from '../types/index.js';
import { logger } from './logger.js';

/**
 * Security constants for buffer protection
 */
const MAX_BUFFER_SIZE = 50 * 1024 * 1024; // 50MB - protects against memory exhaustion
const MAX_CHUNK_COUNT = 10000; // Maximum chunks before considering it an attack

/**
 * Buffer overflow error for security logging and monitoring
 */
export class BufferOverflowError extends Error {
  public readonly totalBytes: number;
  public readonly maxSize: number;
  public readonly chunkCount: number;

  constructor(totalBytes: number, maxSize: number, chunkCount: number) {
    super(`Buffer exceeded maximum size: ${maxSize} bytes (received ${totalBytes} bytes after ${chunkCount} chunks)`);
    this.name = 'BufferOverflowError';
    this.totalBytes = totalBytes;
    this.maxSize = maxSize;
    this.chunkCount = chunkCount;
  }
}

/**
 * Chunk count exceeded error for security logging
 */
export class ChunkCountExceededError extends Error {
  public readonly chunkCount: number;
  public readonly maxChunks: number;

  constructor(chunkCount: number, maxChunks: number) {
    super(`Exceeded maximum chunk count: ${maxChunks} (received ${chunkCount} chunks)`);
    this.name = 'ChunkCountExceededError';
    this.chunkCount = chunkCount;
    this.maxChunks = maxChunks;
  }
}

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
   *
   * RUNTIME_002 FIX: Register error handlers BEFORE calling connect()
   * to prevent race conditions where errors fire before handlers are attached.
   */
  async connect(): Promise<void> {
    if (this.connection && !this.connection.destroyed) {
      // Connection already active
      return;
    }

    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      socket.setTimeout(this.timeout);

      // Track if we've already resolved/rejected to prevent double callbacks
      let isSettled = false;

      const cleanup = () => {
        socket.off('error', onError);
        socket.off('timeout', onTimeout);
      };

      // RUNTIME_002 FIX: Define handlers BEFORE connecting
      const onError = (error: Error) => {
        if (isSettled) return;
        isSettled = true;
        cleanup();
        this.connection = null;
        socket.destroy();
        reject(new Error(`Failed to connect to Blender: ${error.message}`));
      };

      const onTimeout = () => {
        if (isSettled) return;
        isSettled = true;
        cleanup();
        socket.destroy();
        this.connection = null;
        reject(new Error('Connection timeout'));
      };

      // RUNTIME_002 FIX: Register handlers BEFORE calling connect()
      socket.once('error', onError);
      socket.once('timeout', onTimeout);

      // Now connect AFTER handlers are registered
      socket.connect(this.port, this.host, () => {
        if (isSettled) return; // Error/timeout already fired
        isSettled = true;
        // Remove temporary connect-time handlers
        cleanup();
        this.connection = socket;
        resolve();
      });
    });
  }

  /**
   * Send command to Blender and receive response
   *
   * TYPE_SAFETY_002 FIX: Added explicit null check after connect()
   * to handle edge cases where connect() returns but connection is null.
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

      // TYPE_SAFETY_002 FIX: Double-check connection after connect attempt
      if (!this.connection) {
        throw new Error(
          `Failed to establish connection to ${this.host}:${this.port}`
        );
      }

      // TYPE_SAFETY_002 FIX: Additional check for destroyed socket
      if (this.connection.destroyed) {
        throw new Error('Connection was destroyed immediately after creation');
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
      const parsed: unknown = JSON.parse(responseStr);

      // TYPE_SAFETY_001 FIX: Validate response structure before type cast
      if (!isBlenderSocketResponse(parsed)) {
        const truncatedResponse = responseStr.length > 200
          ? responseStr.substring(0, 200) + '...'
          : responseStr;

        logger.error('Invalid Blender response structure', undefined, {
          operation: 'sendCommand',
          receivedType: typeof parsed,
          truncatedResponse
        });

        throw new Error(
          'Invalid response structure from Blender. ' +
          `Expected BlenderSocketResponse with status field, got: ${truncatedResponse}`
        );
      }

      return parsed;

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
   *
   * Security measures:
   * - MAX_BUFFER_SIZE (50MB) - prevents memory exhaustion DoS
   * - MAX_CHUNK_COUNT (10000) - prevents infinite accumulation attacks
   * - Socket destruction on overflow - ensures cleanup
   * - Detailed logging for security monitoring
   */
  private async receiveFullResponse(socket: net.Socket): Promise<string> {
    return new Promise((resolve, reject) => {
      let buffer = '';
      let totalBytes = 0;
      let chunkCount = 0;
      let isResolved = false;

      const cleanup = () => {
        socket.off('data', onData);
        socket.off('error', onError);
        socket.off('timeout', onTimeout);
        socket.off('close', onClose);
      };

      const safeReject = (error: Error) => {
        if (isResolved) return;
        isResolved = true;
        cleanup();
        reject(error);
      };

      const safeResolve = (data: string) => {
        if (isResolved) return;
        isResolved = true;
        cleanup();
        resolve(data);
      };

      const onData = (chunk: Buffer) => {
        if (isResolved) return;

        // BUG-009 FIX: Reset socket timeout on every data chunk received
        // This prevents timeout during large responses with slow data transfer
        socket.setTimeout(this.timeout);

        chunkCount++;
        const chunkSize = chunk.length;
        totalBytes += chunkSize;

        // Security check 1: Buffer size limit (prevents memory exhaustion)
        if (totalBytes > MAX_BUFFER_SIZE) {
          const error = new BufferOverflowError(totalBytes, MAX_BUFFER_SIZE, chunkCount);

          logger.error('Buffer overflow attack detected', error, {
            operation: 'socket_receive',
            totalBytes,
            maxSize: MAX_BUFFER_SIZE,
            chunkCount,
            remoteAddress: socket.remoteAddress
          });

          // Destroy socket to prevent further data accumulation
          socket.destroy();
          safeReject(error);
          return;
        }

        // Security check 2: Chunk count limit (prevents infinite accumulation)
        if (chunkCount > MAX_CHUNK_COUNT) {
          const error = new ChunkCountExceededError(chunkCount, MAX_CHUNK_COUNT);

          logger.error('Excessive chunk accumulation detected', error, {
            operation: 'socket_receive',
            chunkCount,
            maxChunks: MAX_CHUNK_COUNT,
            totalBytes,
            remoteAddress: socket.remoteAddress
          });

          socket.destroy();
          safeReject(error);
          return;
        }

        // Accumulate data
        buffer += chunk.toString('utf-8');

        // Try parsing accumulated buffer
        try {
          JSON.parse(buffer);
          // Success - complete JSON received
          logger.debug('Complete JSON response received', {
            operation: 'socket_receive',
            totalBytes,
            chunkCount
          });
          safeResolve(buffer);
        } catch {
          // Incomplete JSON - wait for more data
          // Log progress for very large responses
          if (totalBytes > 1024 * 1024 && chunkCount % 100 === 0) {
            logger.debug('Partial JSON received, waiting for more data', {
              operation: 'socket_receive',
              totalBytes,
              chunkCount,
              percentOfMax: Math.round((totalBytes / MAX_BUFFER_SIZE) * 100)
            });
          }
        }
      };

      const onError = (error: Error) => {
        logger.warn('Socket error during receive', {
          operation: 'socket_receive',
          error: error.message,
          totalBytes,
          chunkCount
        });
        safeReject(new Error(`Socket error: ${error.message}`));
      };

      const onTimeout = () => {
        logger.warn('Socket timeout during receive', {
          operation: 'socket_receive',
          totalBytes,
          chunkCount
        });
        safeReject(new Error('Response timeout - no complete JSON received within timeout period'));
      };

      const onClose = () => {
        // Only reject if we haven't resolved yet
        if (!isResolved) {
          logger.warn('Socket closed before complete response', {
            operation: 'socket_receive',
            totalBytes,
            chunkCount
          });
          safeReject(new Error('Connection closed before complete response'));
        }
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