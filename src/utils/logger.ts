/**
 * Structured Logging System for ClaudeKit Blender MCP
 *
 * Provides consistent, configurable logging with:
 * - Multiple log levels (DEBUG, INFO, WARN, ERROR)
 * - Structured JSON output for production
 * - Human-readable format for development
 * - Context/metadata support
 * - Performance timing utilities
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4
}

export interface LogContext {
  tool?: string;
  operation?: string;
  requestId?: string;
  duration?: number;
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: string;
  level: keyof typeof LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

interface LoggerConfig {
  level: LogLevel;
  format: 'json' | 'pretty';
  includeTimestamp: boolean;
  includeStack: boolean;
}

const DEFAULT_CONFIG: LoggerConfig = {
  level: LogLevel.INFO,
  format: 'pretty',
  includeTimestamp: true,
  includeStack: true
};

class Logger {
  private config: LoggerConfig;
  private static instance: Logger | null = null;

  private constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Override from environment
    const envLevel = process.env.LOG_LEVEL?.toUpperCase();
    if (envLevel && envLevel in LogLevel) {
      this.config.level = LogLevel[envLevel as keyof typeof LogLevel];
    }

    const envFormat = process.env.LOG_FORMAT?.toLowerCase();
    if (envFormat === 'json' || envFormat === 'pretty') {
      this.config.format = envFormat;
    }
  }

  static getInstance(config?: Partial<LoggerConfig>): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(config);
    }
    return Logger.instance;
  }

  /**
   * Configure logger settings
   */
  configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current log level
   */
  getLevel(): LogLevel {
    return this.config.level;
  }

  /**
   * Set log level
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.config.level;
  }

  private formatEntry(entry: LogEntry): string {
    if (this.config.format === 'json') {
      return JSON.stringify(entry);
    }

    // Pretty format for development
    const parts: string[] = [];

    if (this.config.includeTimestamp) {
      parts.push(`[${entry.timestamp}]`);
    }

    const levelColors: Record<string, string> = {
      DEBUG: '\x1b[36m', // Cyan
      INFO: '\x1b[32m',  // Green
      WARN: '\x1b[33m',  // Yellow
      ERROR: '\x1b[31m'  // Red
    };
    const reset = '\x1b[0m';
    const color = levelColors[entry.level] || reset;

    parts.push(`${color}${entry.level}${reset}`);
    parts.push(entry.message);

    if (entry.context && Object.keys(entry.context).length > 0) {
      const contextStr = Object.entries(entry.context)
        .filter(([_, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
        .join(' ');
      if (contextStr) {
        parts.push(`| ${contextStr}`);
      }
    }

    if (entry.error) {
      parts.push(`| Error: ${entry.error.message}`);
      if (this.config.includeStack && entry.error.stack) {
        parts.push(`\n${entry.error.stack}`);
      }
    }

    return parts.join(' ');
  }

  private log(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel[level] as keyof typeof LogLevel,
      message,
      context
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: this.config.includeStack ? error.stack : undefined
      };
    }

    const formatted = this.formatEntry(entry);

    // Use stderr for logging to not interfere with MCP stdio transport
    if (level >= LogLevel.ERROR) {
      console.error(formatted);
    } else {
      console.error(formatted);
    }
  }

  debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log(LogLevel.WARN, message, context);
  }

  error(message: string, error?: Error, context?: LogContext): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  /**
   * Create a child logger with preset context
   */
  child(baseContext: LogContext): ChildLogger {
    return new ChildLogger(this, baseContext);
  }

  /**
   * Time an async operation and log the duration
   */
  async time<T>(
    operation: string,
    fn: () => Promise<T>,
    context?: LogContext
  ): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      const duration = Math.round(performance.now() - start);
      this.debug(`${operation} completed`, { ...context, operation, duration });
      return result;
    } catch (error) {
      const duration = Math.round(performance.now() - start);
      this.error(`${operation} failed`, error instanceof Error ? error : undefined, {
        ...context,
        operation,
        duration
      });
      throw error;
    }
  }
}

class ChildLogger {
  private parent: Logger;
  private baseContext: LogContext;

  constructor(parent: Logger, baseContext: LogContext) {
    this.parent = parent;
    this.baseContext = baseContext;
  }

  private mergeContext(context?: LogContext): LogContext {
    return { ...this.baseContext, ...context };
  }

  debug(message: string, context?: LogContext): void {
    this.parent.debug(message, this.mergeContext(context));
  }

  info(message: string, context?: LogContext): void {
    this.parent.info(message, this.mergeContext(context));
  }

  warn(message: string, context?: LogContext): void {
    this.parent.warn(message, this.mergeContext(context));
  }

  error(message: string, error?: Error, context?: LogContext): void {
    this.parent.error(message, error, this.mergeContext(context));
  }
}

// Export singleton instance
export const logger = Logger.getInstance();

// Export class for testing/customization
export { Logger, ChildLogger };
