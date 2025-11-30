/**
 * Centralized Error Handling Middleware
 *
 * Provides unified error handling, categorization, and transformation
 * for consistent error responses across all tools.
 */

import { logger } from './logger.js';
import { getMetrics } from './metrics.js';
import type { ToolResult } from '../types/index.js';

/**
 * Error categories for classification
 */
export enum ErrorCategory {
  /** Input validation errors */
  VALIDATION = 'validation',
  /** Network/socket connection errors */
  CONNECTION = 'connection',
  /** Blender execution errors */
  EXECUTION = 'execution',
  /** Timeout errors */
  TIMEOUT = 'timeout',
  /** Security-related errors */
  SECURITY = 'security',
  /** Rate limiting errors */
  RATE_LIMIT = 'rate_limit',
  /** Internal server errors */
  INTERNAL = 'internal',
  /** Resource not found */
  NOT_FOUND = 'not_found',
  /** External service errors */
  EXTERNAL = 'external'
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  /** Low severity - recoverable user errors */
  LOW = 'low',
  /** Medium severity - operational issues */
  MEDIUM = 'medium',
  /** High severity - system-level issues */
  HIGH = 'high',
  /** Critical severity - requires immediate attention */
  CRITICAL = 'critical'
}

/**
 * Structured error interface
 */
export interface BlenderMCPError {
  /** Error category for classification */
  category: ErrorCategory;
  /** Error severity level */
  severity: ErrorSeverity;
  /** Machine-readable error code */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Additional error details */
  details?: Record<string, unknown>;
  /** Original error if wrapping another error */
  cause?: Error;
  /** Timestamp when error occurred */
  timestamp: string;
  /** Suggested recovery actions */
  recovery?: string[];
}

/**
 * Error code mappings for common scenarios
 */
const ERROR_CODES: Record<string, { category: ErrorCategory; severity: ErrorSeverity }> = {
  'ECONNREFUSED': { category: ErrorCategory.CONNECTION, severity: ErrorSeverity.HIGH },
  'ECONNRESET': { category: ErrorCategory.CONNECTION, severity: ErrorSeverity.MEDIUM },
  'ETIMEDOUT': { category: ErrorCategory.TIMEOUT, severity: ErrorSeverity.MEDIUM },
  'ENOTFOUND': { category: ErrorCategory.CONNECTION, severity: ErrorSeverity.HIGH },
  'VALIDATION_ERROR': { category: ErrorCategory.VALIDATION, severity: ErrorSeverity.LOW },
  'RATE_LIMIT_EXCEEDED': { category: ErrorCategory.RATE_LIMIT, severity: ErrorSeverity.LOW },
  'SECURITY_VIOLATION': { category: ErrorCategory.SECURITY, severity: ErrorSeverity.HIGH },
  'OBJECT_NOT_FOUND': { category: ErrorCategory.NOT_FOUND, severity: ErrorSeverity.LOW },
  'MATERIAL_NOT_FOUND': { category: ErrorCategory.NOT_FOUND, severity: ErrorSeverity.LOW },
  'SCRIPT_ERROR': { category: ErrorCategory.EXECUTION, severity: ErrorSeverity.MEDIUM },
  'BLENDER_ERROR': { category: ErrorCategory.EXECUTION, severity: ErrorSeverity.MEDIUM }
};

/**
 * Create a structured BlenderMCPError
 * @param category - Error category
 * @param code - Error code
 * @param message - Error message
 * @param options - Additional options
 * @returns Structured error object
 */
export function createError(
  category: ErrorCategory,
  code: string,
  message: string,
  options?: {
    severity?: ErrorSeverity;
    details?: Record<string, unknown>;
    cause?: Error;
    recovery?: string[];
  }
): BlenderMCPError {
  return {
    category,
    severity: options?.severity || ErrorSeverity.MEDIUM,
    code,
    message,
    details: options?.details,
    cause: options?.cause,
    timestamp: new Date().toISOString(),
    recovery: options?.recovery
  };
}

/**
 * Classify an error based on its type and message
 * @param error - Error to classify
 * @returns Classified error category and severity
 */
export function classifyError(error: unknown): { category: ErrorCategory; severity: ErrorSeverity; code: string } {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Check for known error codes
    for (const [code, mapping] of Object.entries(ERROR_CODES)) {
      if (message.includes(code.toLowerCase())) {
        return { ...mapping, code };
      }
    }

    // Pattern-based classification
    if (message.includes('timeout') || message.includes('timed out')) {
      return { category: ErrorCategory.TIMEOUT, severity: ErrorSeverity.MEDIUM, code: 'TIMEOUT' };
    }
    if (message.includes('connection') || message.includes('socket') || message.includes('network')) {
      return { category: ErrorCategory.CONNECTION, severity: ErrorSeverity.HIGH, code: 'CONNECTION_ERROR' };
    }
    if (message.includes('validation') || message.includes('invalid') || message.includes('required')) {
      return { category: ErrorCategory.VALIDATION, severity: ErrorSeverity.LOW, code: 'VALIDATION_ERROR' };
    }
    if (message.includes('not found') || message.includes('does not exist')) {
      return { category: ErrorCategory.NOT_FOUND, severity: ErrorSeverity.LOW, code: 'NOT_FOUND' };
    }
    if (message.includes('security') || message.includes('dangerous') || message.includes('forbidden')) {
      return { category: ErrorCategory.SECURITY, severity: ErrorSeverity.HIGH, code: 'SECURITY_VIOLATION' };
    }
    if (message.includes('rate limit') || message.includes('too many')) {
      return { category: ErrorCategory.RATE_LIMIT, severity: ErrorSeverity.LOW, code: 'RATE_LIMIT_EXCEEDED' };
    }
  }

  return { category: ErrorCategory.INTERNAL, severity: ErrorSeverity.MEDIUM, code: 'UNKNOWN_ERROR' };
}

/**
 * Wrap an error with additional context
 * @param error - Original error
 * @param context - Additional context
 * @returns Wrapped BlenderMCPError
 */
export function wrapError(error: unknown, context: string): BlenderMCPError {
  const classification = classifyError(error);
  const originalMessage = error instanceof Error ? error.message : String(error);

  return createError(
    classification.category,
    classification.code,
    `${context}: ${originalMessage}`,
    {
      severity: classification.severity,
      cause: error instanceof Error ? error : undefined,
      details: { originalContext: context }
    }
  );
}

/**
 * Get recovery suggestions based on error category
 *
 * TYPE_SAFETY_003 FIX: Added explicit null check and validation
 * to handle unknown category values that might bypass TypeScript
 * at runtime (e.g., from external input or JSON parsing).
 *
 * @param category - Error category
 * @returns Array of recovery suggestions
 */
export function getRecoverySuggestions(category: ErrorCategory): string[] {
  const suggestions: Record<ErrorCategory, string[]> = {
    [ErrorCategory.VALIDATION]: [
      'Check input parameters match the expected format',
      'Review the tool documentation for correct usage',
      'Ensure required fields are provided'
    ],
    [ErrorCategory.CONNECTION]: [
      'Verify Blender is running with the addon enabled',
      'Check the socket connection settings (host: localhost, port: 9876)',
      'Restart Blender and try again'
    ],
    [ErrorCategory.EXECUTION]: [
      'Check your Python code for syntax errors',
      'Verify object names and references exist in the scene',
      'Review Blender console for detailed error messages'
    ],
    [ErrorCategory.TIMEOUT]: [
      'The operation took too long - try with simpler parameters',
      'Check if Blender is responsive',
      'Consider breaking the operation into smaller steps'
    ],
    [ErrorCategory.SECURITY]: [
      'Remove dangerous code patterns from your script',
      'Use safe Blender API functions only',
      'Review the security guidelines'
    ],
    [ErrorCategory.RATE_LIMIT]: [
      'Wait a moment before making more requests',
      'Reduce the frequency of scripting operations',
      'Consider batching multiple operations'
    ],
    [ErrorCategory.INTERNAL]: [
      'This is an unexpected error - please report it',
      'Try restarting the MCP server',
      'Check the server logs for more details'
    ],
    [ErrorCategory.NOT_FOUND]: [
      'Verify the object/material name is correct',
      'Use blender_get_scene_info to list available objects',
      'Check for typos in the name'
    ],
    [ErrorCategory.EXTERNAL]: [
      'External service may be temporarily unavailable',
      'Check your internet connection',
      'Try again in a few moments'
    ]
  };

  // TYPE_SAFETY_003 FIX: Explicit validation with fallback
  // This handles cases where category might be an unexpected value at runtime
  const categorySuggestions = suggestions[category];

  if (!categorySuggestions || categorySuggestions.length === 0) {
    logger.warn('Unknown or invalid error category for recovery suggestions', {
      operation: 'getRecoverySuggestions',
      category,
      categoryType: typeof category
    });
    return suggestions[ErrorCategory.INTERNAL];
  }

  return categorySuggestions;
}

/**
 * Convert a BlenderMCPError to a ToolResult
 * @param error - Structured error
 * @param includeDetails - Whether to include detailed error info
 * @returns ToolResult with error information
 */
export function errorToToolResult(error: BlenderMCPError, includeDetails = true): ToolResult {
  const errorResponse: Record<string, unknown> = {
    error: true,
    category: error.category,
    code: error.code,
    message: error.message
  };

  if (includeDetails) {
    if (error.details) errorResponse.details = error.details;
    if (error.recovery) errorResponse.recovery = error.recovery;
  }

  // Log the error
  logger.error(`Tool error [${error.code}]: ${error.message}`, error.cause || new Error(error.message), {
    category: error.category,
    severity: error.severity,
    details: error.details
  });

  // Record metrics
  getMetrics().recordError(error.category);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify(errorResponse, null, 2)
    }],
    isError: true
  };
}

/**
 * Higher-order function to wrap tool handlers with error handling
 * @param toolName - Name of the tool
 * @param handler - Tool handler function
 * @returns Wrapped handler with error handling
 */
export function withErrorHandling<T extends Record<string, unknown>>(
  toolName: string,
  handler: (params: T) => Promise<ToolResult>
): (params: T) => Promise<ToolResult> {
  return async (params: T): Promise<ToolResult> => {
    const startTime = Date.now();

    try {
      const result = await handler(params);
      getMetrics().recordToolInvocation(toolName, true, Date.now() - startTime);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      getMetrics().recordToolInvocation(toolName, false, duration);

      const wrappedError = wrapError(error, `Error in ${toolName}`);
      wrappedError.recovery = getRecoverySuggestions(wrappedError.category);

      return errorToToolResult(wrappedError);
    }
  };
}

/**
 * Create a validation error
 * @param field - Field that failed validation
 * @param message - Validation message
 * @param value - The invalid value
 * @returns BlenderMCPError
 */
export function validationError(field: string, message: string, value?: unknown): BlenderMCPError {
  return createError(
    ErrorCategory.VALIDATION,
    'VALIDATION_ERROR',
    `Validation failed for "${field}": ${message}`,
    {
      severity: ErrorSeverity.LOW,
      details: { field, invalidValue: value },
      recovery: getRecoverySuggestions(ErrorCategory.VALIDATION)
    }
  );
}

/**
 * Create a not found error
 * @param resourceType - Type of resource not found
 * @param resourceName - Name of the resource
 * @returns BlenderMCPError
 */
export function notFoundError(resourceType: string, resourceName: string): BlenderMCPError {
  return createError(
    ErrorCategory.NOT_FOUND,
    `${resourceType.toUpperCase()}_NOT_FOUND`,
    `${resourceType} "${resourceName}" not found`,
    {
      severity: ErrorSeverity.LOW,
      details: { resourceType, resourceName },
      recovery: getRecoverySuggestions(ErrorCategory.NOT_FOUND)
    }
  );
}

/**
 * Create a connection error
 * @param message - Error message
 * @param details - Additional details
 * @returns BlenderMCPError
 */
export function connectionError(message: string, details?: Record<string, unknown>): BlenderMCPError {
  return createError(
    ErrorCategory.CONNECTION,
    'CONNECTION_ERROR',
    message,
    {
      severity: ErrorSeverity.HIGH,
      details,
      recovery: getRecoverySuggestions(ErrorCategory.CONNECTION)
    }
  );
}

/**
 * Create a security error
 * @param message - Error message
 * @param details - Additional details
 * @returns BlenderMCPError
 */
export function securityError(message: string, details?: Record<string, unknown>): BlenderMCPError {
  return createError(
    ErrorCategory.SECURITY,
    'SECURITY_VIOLATION',
    message,
    {
      severity: ErrorSeverity.HIGH,
      details,
      recovery: getRecoverySuggestions(ErrorCategory.SECURITY)
    }
  );
}
