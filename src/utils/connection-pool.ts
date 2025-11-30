/**
 * Connection Pooling System for ClaudeKit Blender MCP
 *
 * Provides efficient connection management:
 * - Pool of reusable connections with mutex-based synchronization
 * - Atomic acquire/release operations (RACE_CONDITION_001 fix)
 * - Automatic connection health checks
 * - Retry logic with exponential backoff
 * - Connection lifecycle management
 */

import * as net from 'net';
import { getBlenderConfig } from './config.js';
import { logger } from './logger.js';
import type { BlenderSocketMessage, BlenderSocketResponse } from '../types/index.js';
import { isBlenderSocketResponse } from '../types/index.js';

interface PooledConnection {
  socket: net.Socket;
  id: string;
  inUse: boolean;
  createdAt: number;
  lastUsedAt: number;
  requestCount: number;
}

export interface ConnectionPoolConfig {
  minConnections: number;
  maxConnections: number;
  connectionTimeout: number;
  idleTimeout: number;
  maxRequestsPerConnection: number;
  healthCheckInterval: number;
  /** Timeout for mutex acquisition in ms (default: 30000) */
  mutexTimeout: number;
}

const DEFAULT_POOL_CONFIG: ConnectionPoolConfig = {
  minConnections: 1,
  maxConnections: 5,
  connectionTimeout: 30000,
  idleTimeout: 60000,
  maxRequestsPerConnection: 1000,
  healthCheckInterval: 30000,
  mutexTimeout: 30000
};

/**
 * Error thrown when mutex acquisition times out
 */
export class MutexTimeoutError extends Error {
  constructor(operation: string, timeoutMs: number) {
    super(`Mutex acquisition timeout after ${timeoutMs}ms during ${operation}`);
    this.name = 'MutexTimeoutError';
  }
}

class ConnectionPool {
  private connections: Map<string, PooledConnection> = new Map();
  private config: ConnectionPoolConfig;
  private blenderConfig = getBlenderConfig();
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private connectionIdCounter = 0;
  private pendingRequests: Array<{
    resolve: (conn: PooledConnection) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = [];

  /**
   * Mutex state for atomic connection operations (RACE_CONDITION_001 fix)
   * Ensures only one thread can acquire/release connections at a time
   */
  private acquireLock = false;
  private lockQueue: Array<{
    resolve: () => void;
    reject: (error: Error) => void;
  }> = [];

  constructor(config: Partial<ConnectionPoolConfig> = {}) {
    this.config = { ...DEFAULT_POOL_CONFIG, ...config };

    // MEMORY_LEAK_002 FIX: Start health check with proper error handling
    // Ensure timer is cleaned up if construction fails after timer starts
    try {
      this.startHealthCheck();
    } catch (error) {
      // Clean up timer if construction fails after timer started
      this.stopHealthCheck();
      throw error;
    }
  }

  /**
   * Stop the health check timer
   * MEMORY_LEAK_002 FIX: Centralized timer cleanup
   */
  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
      logger.debug('Health check timer stopped');
    }
  }

  /**
   * Acquire mutex lock for atomic connection operations
   * Implements fair queuing - requests are processed in order
   *
   * @param operation - Name of operation (for logging/debugging)
   * @throws MutexTimeoutError if lock cannot be acquired within timeout
   */
  private async acquireMutex(operation: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Set up timeout for deadlock prevention
      const timeoutHandle = setTimeout(() => {
        // Remove from queue if still pending
        const index = this.lockQueue.findIndex(item => item.resolve === resolve);
        if (index !== -1) {
          this.lockQueue.splice(index, 1);
        }

        logger.error('Mutex acquisition timeout - potential deadlock', undefined, {
          operation,
          timeoutMs: this.config.mutexTimeout,
          queueLength: this.lockQueue.length
        });

        reject(new MutexTimeoutError(operation, this.config.mutexTimeout));
      }, this.config.mutexTimeout);

      const wrappedResolve = () => {
        clearTimeout(timeoutHandle);
        resolve();
      };

      const wrappedReject = (error: Error) => {
        clearTimeout(timeoutHandle);
        reject(error);
      };

      if (!this.acquireLock) {
        // Lock is free - acquire immediately
        this.acquireLock = true;
        wrappedResolve();
      } else {
        // Lock is held - queue this request
        this.lockQueue.push({
          resolve: wrappedResolve,
          reject: wrappedReject
        });
      }
    });
  }

  /**
   * Release mutex lock and process next waiting request
   * Must be called in finally block to ensure lock release
   */
  private releaseMutex(): void {
    const next = this.lockQueue.shift();
    if (next) {
      // Pass lock to next in queue (keeps acquireLock = true)
      next.resolve();
    } else {
      // No waiters - release lock
      this.acquireLock = false;
    }
  }

  /**
   * Acquire a connection from the pool with atomic synchronization
   * Uses mutex to prevent race conditions (RACE_CONDITION_001 fix)
   *
   * @returns Promise resolving to a pooled connection
   * @throws Error if no connection available within timeout
   */
  async acquire(): Promise<PooledConnection> {
    // Acquire mutex for atomic check-and-set
    await this.acquireMutex('acquire');

    try {
      // Try to find an available connection (protected by mutex)
      for (const conn of this.connections.values()) {
        if (!conn.inUse && this.isConnectionHealthy(conn)) {
          // Atomic: mark as in-use within mutex
          conn.inUse = true;
          conn.lastUsedAt = Date.now();
          logger.debug('Acquired existing connection', { connectionId: conn.id });
          return conn;
        }
      }

      // Create new connection if under max
      if (this.connections.size < this.config.maxConnections) {
        try {
          const conn = await this.createConnection();
          conn.inUse = true;
          conn.lastUsedAt = Date.now();
          logger.debug('Created new connection for acquire', { connectionId: conn.id });
          return conn;
        } catch (error) {
          throw new Error(
            `Failed to create connection: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      // Pool exhausted - must wait for a connection
      logger.debug('Waiting for available connection', {
        poolSize: this.connections.size,
        maxConnections: this.config.maxConnections,
        pendingRequests: this.pendingRequests.length
      });

      // Create pending request (will be resolved when connection released)
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          const index = this.pendingRequests.findIndex(r => r.resolve === resolve);
          if (index !== -1) {
            this.pendingRequests.splice(index, 1);
          }
          reject(new Error('Connection pool timeout - no connections available'));
        }, this.config.connectionTimeout);

        this.pendingRequests.push({
          resolve,
          reject,
          timeout
        });
      });

    } finally {
      // CRITICAL: Always release mutex
      this.releaseMutex();
    }
  }

  /**
   * Release a connection back to the pool with atomic synchronization
   * Uses mutex to prevent race conditions (RACE_CONDITION_001 fix)
   *
   * @param connection - Connection to release
   */
  async release(connection: PooledConnection): Promise<void> {
    // Acquire mutex for atomic release
    await this.acquireMutex('release');

    try {
      const conn = this.connections.get(connection.id);
      if (!conn) {
        logger.warn('Attempted to release unknown connection', { connectionId: connection.id });
        return;
      }

      // Atomic: mark as not in-use within mutex
      conn.inUse = false;
      conn.lastUsedAt = Date.now();
      conn.requestCount++;

      logger.debug('Connection released', {
        connectionId: conn.id,
        requestCount: conn.requestCount,
        pendingRequests: this.pendingRequests.length
      });

      // Check if connection should be retired
      if (conn.requestCount >= this.config.maxRequestsPerConnection) {
        logger.debug('Retiring connection due to max requests', {
          connectionId: conn.id,
          requestCount: conn.requestCount
        });
        this.destroyConnection(conn);
      }

      // Serve pending requests (within mutex for atomicity)
      await this.servePendingRequestLocked();

    } finally {
      // CRITICAL: Always release mutex
      this.releaseMutex();
    }
  }

  /**
   * Execute a command using a pooled connection
   * Connection acquire/release is atomic (protected by mutex)
   */
  async execute(
    type: string,
    params?: Record<string, unknown>
  ): Promise<BlenderSocketResponse> {
    const connection = await this.acquire();

    try {
      const message: BlenderSocketMessage = { type };
      if (params) {
        message.params = params;
      }

      const messageStr = JSON.stringify(message) + '\n';
      connection.socket.write(messageStr);

      const responseStr = await this.receiveResponse(connection.socket);
      const parsed: unknown = JSON.parse(responseStr);

      // TYPE_SAFETY_001 FIX: Validate response structure before type cast
      if (!isBlenderSocketResponse(parsed)) {
        const truncatedResponse = responseStr.length > 200
          ? responseStr.substring(0, 200) + '...'
          : responseStr;

        logger.error('Invalid Blender response structure in pool', undefined, {
          operation: 'execute',
          connectionId: connection.id,
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
      // Destroy problematic connection (no mutex needed - destroyConnection handles it)
      this.destroyConnection(connection);
      throw error;
    } finally {
      // Only release if not destroyed (release is now async)
      if (this.connections.has(connection.id)) {
        await this.release(connection);
      }
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    totalConnections: number;
    activeConnections: number;
    idleConnections: number;
    pendingRequests: number;
    totalRequests: number;
  } {
    let active = 0;
    let idle = 0;
    let totalRequests = 0;

    for (const conn of this.connections.values()) {
      if (conn.inUse) {
        active++;
      } else {
        idle++;
      }
      totalRequests += conn.requestCount;
    }

    return {
      totalConnections: this.connections.size,
      activeConnections: active,
      idleConnections: idle,
      pendingRequests: this.pendingRequests.length,
      totalRequests
    };
  }

  /**
   * Close all connections and shutdown pool
   * Acquires mutex to ensure clean shutdown
   */
  async shutdown(): Promise<void> {
    // MEMORY_LEAK_002 FIX: Use centralized timer cleanup
    this.stopHealthCheck();

    // Acquire mutex for clean shutdown
    await this.acquireMutex('shutdown');

    try {
      // Reject pending requests with proper cleanup
      for (const pending of this.pendingRequests) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('Connection pool shutting down'));
      }
      this.pendingRequests = [];

      // Reject any mutex waiters
      for (const waiter of this.lockQueue) {
        waiter.reject(new Error('Connection pool shutting down'));
      }
      this.lockQueue = [];

      // Destroy all connections
      for (const conn of this.connections.values()) {
        conn.socket.destroy();
      }
      this.connections.clear();

      logger.info('Connection pool shutdown complete');

    } finally {
      // Release mutex (though pool is now unusable)
      this.acquireLock = false;
    }
  }

  /**
   * Create a new connection to Blender
   *
   * ASYNC_CLEANUP_001 FIX: Ensures socket is destroyed on any exception
   * during connection creation to prevent socket leaks.
   */
  private async createConnection(): Promise<PooledConnection> {
    const id = `conn-${++this.connectionIdCounter}`;

    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      let connectionEstablished = false;

      // ASYNC_CLEANUP_001 FIX: Cleanup function to destroy socket if not established
      const cleanup = () => {
        if (!connectionEstablished) {
          socket.destroy();
          logger.debug('Socket cleanup on connection failure', { connectionId: id });
        }
      };

      socket.setTimeout(this.blenderConfig.socketTimeout);

      socket.connect(this.blenderConfig.port, this.blenderConfig.host, () => {
        try {
          const conn: PooledConnection = {
            socket,
            id,
            inUse: false,
            createdAt: Date.now(),
            lastUsedAt: Date.now(),
            requestCount: 0
          };

          this.connections.set(id, conn);
          connectionEstablished = true;
          logger.debug('Created new connection', { connectionId: id });
          resolve(conn);
        } catch (error) {
          // ASYNC_CLEANUP_001 FIX: Exception during connection object creation
          cleanup();
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });

      socket.on('error', (error) => {
        logger.error('Connection error', error, { connectionId: id });
        // ASYNC_CLEANUP_001 FIX: Ensure socket cleanup on error
        cleanup();
        const conn = this.connections.get(id);
        if (conn) {
          this.destroyConnection(conn);
        }
        reject(new Error(`Failed to connect to Blender: ${error.message}`));
      });

      socket.on('timeout', () => {
        // ASYNC_CLEANUP_001 FIX: Handle timeout - cleanup socket
        cleanup();
        reject(new Error('Connection timeout'));
      });

      socket.on('close', () => {
        const conn = this.connections.get(id);
        if (conn) {
          logger.debug('Connection closed', { connectionId: id });
          this.destroyConnection(conn);
        }
      });
    });
  }

  private destroyConnection(connection: PooledConnection): void {
    connection.socket.destroy();
    this.connections.delete(connection.id);
    logger.debug('Destroyed connection', { connectionId: connection.id });

    // Serve pending requests with new connections
    this.servePendingRequest();
  }

  /**
   * Serve pending request - called WITHIN mutex lock
   * This is the internal version used by release() which already holds the mutex
   */
  private async servePendingRequestLocked(): Promise<void> {
    if (this.pendingRequests.length === 0) return;

    // Find available connection (already within mutex)
    for (const conn of this.connections.values()) {
      if (!conn.inUse && this.isConnectionHealthy(conn)) {
        const pending = this.pendingRequests.shift();
        if (pending) {
          clearTimeout(pending.timeout);
          conn.inUse = true;
          conn.lastUsedAt = Date.now();
          pending.resolve(conn);

          logger.debug('Pending request served', {
            connectionId: conn.id,
            remainingQueue: this.pendingRequests.length
          });
        }
        return;
      }
    }

    // Create new connection if under max
    if (this.connections.size < this.config.maxConnections) {
      try {
        const conn = await this.createConnection();
        const pending = this.pendingRequests.shift();
        if (pending) {
          clearTimeout(pending.timeout);
          conn.inUse = true;
          conn.lastUsedAt = Date.now();
          pending.resolve(conn);

          logger.debug('New connection created for pending request', {
            connectionId: conn.id,
            remainingQueue: this.pendingRequests.length
          });
        }
      } catch (error) {
        const pending = this.pendingRequests.shift();
        if (pending) {
          clearTimeout(pending.timeout);
          pending.reject(error instanceof Error ? error : new Error(String(error)));
        }
      }
    }
  }

  /**
   * Serve pending request - public version that acquires mutex
   * Used by destroyConnection which doesn't hold the mutex
   */
  private async servePendingRequest(): Promise<void> {
    if (this.pendingRequests.length === 0) return;

    await this.acquireMutex('servePendingRequest');
    try {
      await this.servePendingRequestLocked();
    } finally {
      this.releaseMutex();
    }
  }

  private isConnectionHealthy(connection: PooledConnection): boolean {
    // Check if socket is still valid
    if (connection.socket.destroyed) {
      return false;
    }

    // Check idle timeout
    const idleTime = Date.now() - connection.lastUsedAt;
    if (idleTime > this.config.idleTimeout) {
      logger.debug('Connection idle timeout', {
        connectionId: connection.id,
        idleTimeMs: idleTime
      });
      return false;
    }

    return true;
  }

  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckInterval);
  }

  private performHealthCheck(): void {
    const now = Date.now();
    let removed = 0;

    for (const conn of this.connections.values()) {
      if (!conn.inUse && !this.isConnectionHealthy(conn)) {
        this.destroyConnection(conn);
        removed++;
      }
    }

    // Ensure minimum connections
    const deficit = this.config.minConnections - this.connections.size;
    if (deficit > 0) {
      logger.debug('Creating connections to meet minimum', { deficit });
      for (let i = 0; i < deficit; i++) {
        this.createConnection().catch(err => {
          logger.warn('Failed to create minimum connection', { error: err.message });
        });
      }
    }

    if (removed > 0) {
      logger.debug('Health check completed', {
        removedConnections: removed,
        currentPoolSize: this.connections.size
      });
    }
  }

  private async receiveResponse(socket: net.Socket): Promise<string> {
    return new Promise((resolve, reject) => {
      let buffer = '';
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Response timeout'));
      }, this.blenderConfig.socketTimeout);

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

      const onClose = () => {
        cleanup();
        reject(new Error('Connection closed'));
      };

      const cleanup = () => {
        clearTimeout(timeout);
        socket.off('data', onData);
        socket.off('error', onError);
        socket.off('close', onClose);
      };

      socket.on('data', onData);
      socket.on('error', onError);
      socket.on('close', onClose);
    });
  }
}

// Singleton pool instance
let poolInstance: ConnectionPool | null = null;

export function getConnectionPool(): ConnectionPool {
  if (!poolInstance) {
    poolInstance = new ConnectionPool();
  }
  return poolInstance;
}

export { ConnectionPool };
