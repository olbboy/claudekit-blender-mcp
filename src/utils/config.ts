/**
 * Configuration Management System for ClaudeKit Blender MCP
 *
 * Centralized configuration with:
 * - Environment variable support
 * - Type-safe config access
 * - Default values
 * - Runtime validation
 */

import { z } from 'zod';
import { LogLevel } from './logger.js';

// Configuration schema using Zod for validation
const ConfigSchema = z.object({
  // Blender connection settings
  blender: z.object({
    host: z.string().default('localhost'),
    port: z.number().int().min(1).max(65535).default(9876),
    socketTimeout: z.number().int().min(1000).max(600000).default(180000),
    reconnectAttempts: z.number().int().min(0).max(10).default(3),
    reconnectDelay: z.number().int().min(100).max(10000).default(1000)
  }),

  // Logging settings
  logging: z.object({
    level: z.nativeEnum(LogLevel).default(LogLevel.INFO),
    format: z.enum(['json', 'pretty']).default('pretty'),
    includeTimestamp: z.boolean().default(true),
    includeStack: z.boolean().default(true)
  }),

  // Rate limiting settings
  rateLimit: z.object({
    enabled: z.boolean().default(true),
    maxRequestsPerMinute: z.number().int().min(1).max(1000).default(60),
    maxConcurrentRequests: z.number().int().min(1).max(50).default(10),
    scriptingMaxPerMinute: z.number().int().min(1).max(100).default(20)
  }),

  // Caching settings
  cache: z.object({
    enabled: z.boolean().default(true),
    ttlSeconds: z.number().int().min(1).max(3600).default(30),
    maxEntries: z.number().int().min(10).max(10000).default(100),
    sceneInfoTtl: z.number().int().min(1).max(300).default(5),
    objectInfoTtl: z.number().int().min(1).max(300).default(10)
  }),

  // Security settings
  security: z.object({
    maxCodeSize: z.number().int().min(1024).max(1048576).default(102400), // 100KB
    codeExecutionTimeout: z.number().int().min(1000).max(600000).default(180000),
    blockDangerousPatterns: z.boolean().default(true),
    allowedPythonModules: z.array(z.string()).default(['bpy', 'mathutils', 'bmesh', 'math', 'random'])
  }),

  // Response settings
  response: z.object({
    maxSize: z.number().int().min(1000).max(100000).default(25000),
    maxScreenshotSize: z.number().int().min(100).max(2048).default(800)
  }),

  // External APIs
  externalApis: z.object({
    polyhavenApi: z.string().url().default('https://api.polyhaven.com'),
    sketchfabApi: z.string().url().default('https://api.sketchfab.com/v3'),
    hyper3dApi: z.string().url().default('https://hyper3d.ai/api')
  })
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Parse environment variable as number
 */
function parseEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse environment variable as boolean
 */
function parseEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key]?.toLowerCase();
  if (!value) return defaultValue;
  return value === 'true' || value === '1' || value === 'yes';
}

/**
 * Parse log level from environment
 */
function parseLogLevel(key: string, defaultValue: LogLevel): LogLevel {
  const value = process.env[key]?.toUpperCase();
  if (!value) return defaultValue;
  if (value in LogLevel) {
    return LogLevel[value as keyof typeof LogLevel];
  }
  return defaultValue;
}

/**
 * Build configuration from environment variables and defaults
 */
function buildConfig(): Config {
  const rawConfig = {
    blender: {
      host: process.env.BLENDER_HOST || 'localhost',
      port: parseEnvNumber('BLENDER_PORT', 9876),
      socketTimeout: parseEnvNumber('SOCKET_TIMEOUT', 180000),
      reconnectAttempts: parseEnvNumber('RECONNECT_ATTEMPTS', 3),
      reconnectDelay: parseEnvNumber('RECONNECT_DELAY', 1000)
    },
    logging: {
      level: parseLogLevel('LOG_LEVEL', LogLevel.INFO),
      format: (process.env.LOG_FORMAT?.toLowerCase() === 'json' ? 'json' : 'pretty') as 'json' | 'pretty',
      includeTimestamp: parseEnvBoolean('LOG_TIMESTAMP', true),
      includeStack: parseEnvBoolean('LOG_STACK', true)
    },
    rateLimit: {
      enabled: parseEnvBoolean('RATE_LIMIT_ENABLED', true),
      maxRequestsPerMinute: parseEnvNumber('RATE_LIMIT_MAX_PER_MIN', 60),
      maxConcurrentRequests: parseEnvNumber('RATE_LIMIT_MAX_CONCURRENT', 10),
      scriptingMaxPerMinute: parseEnvNumber('RATE_LIMIT_SCRIPTING_MAX', 20)
    },
    cache: {
      enabled: parseEnvBoolean('CACHE_ENABLED', true),
      ttlSeconds: parseEnvNumber('CACHE_TTL', 30),
      maxEntries: parseEnvNumber('CACHE_MAX_ENTRIES', 100),
      sceneInfoTtl: parseEnvNumber('CACHE_SCENE_TTL', 5),
      objectInfoTtl: parseEnvNumber('CACHE_OBJECT_TTL', 10)
    },
    security: {
      maxCodeSize: parseEnvNumber('MAX_CODE_SIZE', 102400),
      codeExecutionTimeout: parseEnvNumber('CODE_TIMEOUT', 180000),
      blockDangerousPatterns: parseEnvBoolean('BLOCK_DANGEROUS_CODE', true),
      allowedPythonModules: process.env.ALLOWED_PYTHON_MODULES?.split(',').map(s => s.trim()) ||
        ['bpy', 'mathutils', 'bmesh', 'math', 'random']
    },
    response: {
      maxSize: parseEnvNumber('MAX_RESPONSE_SIZE', 25000),
      maxScreenshotSize: parseEnvNumber('MAX_SCREENSHOT_SIZE', 800)
    },
    externalApis: {
      polyhavenApi: process.env.POLYHAVEN_API || 'https://api.polyhaven.com',
      sketchfabApi: process.env.SKETCHFAB_API || 'https://api.sketchfab.com/v3',
      hyper3dApi: process.env.HYPER3D_API || 'https://hyper3d.ai/api'
    }
  };

  // Validate and return
  return ConfigSchema.parse(rawConfig);
}

// Singleton config instance
let configInstance: Config | null = null;

/**
 * Get the configuration instance (singleton)
 */
export function getConfig(): Config {
  if (!configInstance) {
    configInstance = buildConfig();
  }
  return configInstance;
}

/**
 * Reset configuration (useful for testing)
 */
export function resetConfig(): void {
  configInstance = null;
}

/**
 * Get a specific config section
 */
export function getBlenderConfig() {
  return getConfig().blender;
}

export function getLoggingConfig() {
  return getConfig().logging;
}

export function getRateLimitConfig() {
  return getConfig().rateLimit;
}

export function getCacheConfig() {
  return getConfig().cache;
}

export function getSecurityConfig() {
  return getConfig().security;
}

export function getResponseConfig() {
  return getConfig().response;
}

export function getExternalApisConfig() {
  return getConfig().externalApis;
}
