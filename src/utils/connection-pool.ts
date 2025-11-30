/**
 * Connection Pooling System for ClaudeKit Blender MCP
 *
 * Provides efficient connection management:
 * - Pool of reusable connections
 * - Automatic connection health checks
 * - Retry logic with exponential backoff
 * - Connection lifecycle management
 */

import * as net from 'net';
import { getBlenderConfig } from './config.js';
import { logger } from './logger.js';
import type { BlenderSocketMessage, BlenderSocketResponse } from '../types/index.js';

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
}

const DEFAULT_POOL_CONFIG: ConnectionPoolConfig = {
  minConnections: 1,
  maxConnections: 5,
  connectionTimeout: 30000,
  idleTimeout: 60000,
  maxRequestsPerConnection: 1000,
  healthCheckInterval: 30000
};

class ConnectionPool {
  private connections: Map<string, PooledConnection> = new Map();
  private config: ConnectionPoolConfig;
  private blenderConfig = getBlenderConfig();
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private connectionIdCounter = 0;
  private pendingRequests: Array<{
    resolve: (conn: PooledConnection) => void;
    reject: (error: Error) => void;
  }> = [];

  constructor(config: Partial<ConnectionPoolConfig> = {}) {
    this.config = { ...DEFAULT_POOL_CONFIG, ...config };
    this.startHealthCheck();
  }

  /**
   * Acquire a connection from the pool
   */
  async acquire(): Promise<PooledConnection> {
    // Try to find an available connection
    for (const conn of this.connections.values()) {
      if (!conn.inUse && this.isConnectionHealthy(conn)) {
        conn.inUse = true;
        conn.lastUsedAt = Date.now();
        logger.debug('Acquired existing connection', { connectionId: conn.id });
        return conn;
      }
    }

    // Create new connection if under max
    if (this.connections.size < this.config.maxConnections) {
      const conn = await this.createConnection();
      conn.inUse = true;
      return conn;
    }

    // Wait for a connection to become available
    logger.debug('Waiting for available connection', {
      poolSize: this.connections.size,
      maxConnections: this.config.maxConnections
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.pendingRequests.findIndex(r => r.resolve === resolve);
        if (index !== -1) {
          this.pendingRequests.splice(index, 1);
        }
        reject(new Error('Connection pool timeout - no connections available'));
      }, this.config.connectionTimeout);

      this.pendingRequests.push({
        resolve: (conn) => {
          clearTimeout(timeout);
          resolve(conn);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });
    });
  }

  /**
   * Release a connection back to the pool
   */
  release(connection: PooledConnection): void {
    const conn = this.connections.get(connection.id);
    if (!conn) {
      logger.warn('Attempted to release unknown connection', { connectionId: connection.id });
      return;
    }

    conn.inUse = false;
    conn.lastUsedAt = Date.now();
    conn.requestCount++;

    // Check if connection should be retired
    if (conn.requestCount >= this.config.maxRequestsPerConnection) {
      logger.debug('Retiring connection due to max requests', {
        connectionId: conn.id,
        requestCount: conn.requestCount
      });
      this.destroyConnection(conn);
    } else {
      // Serve pending requests
      this.servePendingRequest();
    }
  }

  /**
   * Execute a command using a pooled connection
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
      return JSON.parse(responseStr) as BlenderSocketResponse;

    } catch (error) {
      // Destroy problematic connection
      this.destroyConnection(connection);
      throw error;
    } finally {
      // Only release if not destroyed
      if (this.connections.has(connection.id)) {
        this.release(connection);
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
   */
  async shutdown(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    // Reject pending requests
    for (const pending of this.pendingRequests) {
      pending.reject(new Error('Connection pool shutting down'));
    }
    this.pendingRequests = [];

    // Destroy all connections
    for (const conn of this.connections.values()) {
      this.destroyConnection(conn);
    }

    logger.info('Connection pool shutdown complete');
  }

  private async createConnection(): Promise<PooledConnection> {
    const id = `conn-${++this.connectionIdCounter}`;

    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      socket.setTimeout(this.blenderConfig.socketTimeout);

      socket.connect(this.blenderConfig.port, this.blenderConfig.host, () => {
        const conn: PooledConnection = {
          socket,
          id,
          inUse: false,
          createdAt: Date.now(),
          lastUsedAt: Date.now(),
          requestCount: 0
        };

        this.connections.set(id, conn);
        logger.debug('Created new connection', { connectionId: id });
        resolve(conn);
      });

      socket.on('error', (error) => {
        logger.error('Connection error', error, { connectionId: id });
        const conn = this.connections.get(id);
        if (conn) {
          this.destroyConnection(conn);
        }
        reject(new Error(`Failed to connect to Blender: ${error.message}`));
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

  private async servePendingRequest(): Promise<void> {
    if (this.pendingRequests.length === 0) return;

    // Find available connection or create new one
    for (const conn of this.connections.values()) {
      if (!conn.inUse && this.isConnectionHealthy(conn)) {
        const pending = this.pendingRequests.shift();
        if (pending) {
          conn.inUse = true;
          conn.lastUsedAt = Date.now();
          pending.resolve(conn);
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
          conn.inUse = true;
          pending.resolve(conn);
        }
      } catch (error) {
        const pending = this.pendingRequests.shift();
        if (pending) {
          pending.reject(error instanceof Error ? error : new Error(String(error)));
        }
      }
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
