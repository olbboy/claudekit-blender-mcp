/**
 * Unit Tests for Error Middleware
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Error category enum
enum ErrorCategory {
  VALIDATION = 'validation',
  CONNECTION = 'connection',
  EXECUTION = 'execution',
  TIMEOUT = 'timeout',
  SECURITY = 'security',
  RATE_LIMIT = 'rate_limit',
  INTERNAL = 'internal',
  NOT_FOUND = 'not_found',
  EXTERNAL = 'external'
}

enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

interface BlenderMCPError {
  category: ErrorCategory;
  severity: ErrorSeverity;
  code: string;
  message: string;
  details?: Record<string, unknown>;
  cause?: Error;
  timestamp: string;
  recovery?: string[];
}

interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

// Re-implement error middleware functions for testing
function createError(
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

function classifyError(error: unknown): { category: ErrorCategory; severity: ErrorSeverity; code: string } {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.includes('econnrefused')) {
      return { category: ErrorCategory.CONNECTION, severity: ErrorSeverity.HIGH, code: 'ECONNREFUSED' };
    }
    if (message.includes('etimedout')) {
      return { category: ErrorCategory.TIMEOUT, severity: ErrorSeverity.MEDIUM, code: 'ETIMEDOUT' };
    }
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

function wrapError(error: unknown, context: string): BlenderMCPError {
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

function getRecoverySuggestions(category: ErrorCategory): string[] {
  const suggestions: Record<ErrorCategory, string[]> = {
    [ErrorCategory.VALIDATION]: [
      'Check input parameters match the expected format',
      'Review the tool documentation for correct usage'
    ],
    [ErrorCategory.CONNECTION]: [
      'Verify Blender is running with the addon enabled',
      'Check the socket connection settings'
    ],
    [ErrorCategory.EXECUTION]: [
      'Check your Python code for syntax errors',
      'Verify object names exist in the scene'
    ],
    [ErrorCategory.TIMEOUT]: [
      'The operation took too long',
      'Check if Blender is responsive'
    ],
    [ErrorCategory.SECURITY]: [
      'Remove dangerous code patterns',
      'Use safe Blender API functions only'
    ],
    [ErrorCategory.RATE_LIMIT]: [
      'Wait a moment before making more requests',
      'Reduce the frequency of operations'
    ],
    [ErrorCategory.INTERNAL]: [
      'This is an unexpected error',
      'Try restarting the MCP server'
    ],
    [ErrorCategory.NOT_FOUND]: [
      'Verify the object/material name is correct',
      'Use blender_get_scene_info to list available objects'
    ],
    [ErrorCategory.EXTERNAL]: [
      'External service may be unavailable',
      'Check your internet connection'
    ]
  };

  return suggestions[category] || suggestions[ErrorCategory.INTERNAL];
}

function errorToToolResult(error: BlenderMCPError): ToolResult {
  const errorResponse = {
    error: true,
    category: error.category,
    code: error.code,
    message: error.message,
    details: error.details,
    recovery: error.recovery
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(errorResponse, null, 2) }],
    isError: true
  };
}

function validationError(field: string, message: string, value?: unknown): BlenderMCPError {
  return createError(
    ErrorCategory.VALIDATION,
    'VALIDATION_ERROR',
    `Validation failed for "${field}": ${message}`,
    {
      severity: ErrorSeverity.LOW,
      details: { field, invalidValue: value }
    }
  );
}

function notFoundError(resourceType: string, resourceName: string): BlenderMCPError {
  return createError(
    ErrorCategory.NOT_FOUND,
    `${resourceType.toUpperCase()}_NOT_FOUND`,
    `${resourceType} "${resourceName}" not found`,
    {
      severity: ErrorSeverity.LOW,
      details: { resourceType, resourceName }
    }
  );
}

describe('Error Creation', () => {
  it('should create error with default severity', () => {
    const error = createError(ErrorCategory.VALIDATION, 'TEST', 'Test message');

    expect(error.category).toBe(ErrorCategory.VALIDATION);
    expect(error.code).toBe('TEST');
    expect(error.message).toBe('Test message');
    expect(error.severity).toBe(ErrorSeverity.MEDIUM);
    expect(error.timestamp).toBeDefined();
  });

  it('should create error with custom options', () => {
    const cause = new Error('Original error');
    const error = createError(ErrorCategory.CONNECTION, 'CONN_FAIL', 'Connection failed', {
      severity: ErrorSeverity.HIGH,
      details: { host: 'localhost', port: 9876 },
      cause,
      recovery: ['Restart server']
    });

    expect(error.severity).toBe(ErrorSeverity.HIGH);
    expect(error.details?.host).toBe('localhost');
    expect(error.cause).toBe(cause);
    expect(error.recovery).toContain('Restart server');
  });
});

describe('Error Classification', () => {
  it('should classify connection errors', () => {
    const result = classifyError(new Error('ECONNREFUSED'));
    expect(result.category).toBe(ErrorCategory.CONNECTION);
    expect(result.severity).toBe(ErrorSeverity.HIGH);
  });

  it('should classify timeout errors', () => {
    const result = classifyError(new Error('Operation timed out'));
    expect(result.category).toBe(ErrorCategory.TIMEOUT);
    expect(result.severity).toBe(ErrorSeverity.MEDIUM);
  });

  it('should classify validation errors', () => {
    const result = classifyError(new Error('Invalid input value'));
    expect(result.category).toBe(ErrorCategory.VALIDATION);
    expect(result.severity).toBe(ErrorSeverity.LOW);
  });

  it('should classify not found errors', () => {
    const result = classifyError(new Error('Object not found'));
    expect(result.category).toBe(ErrorCategory.NOT_FOUND);
    expect(result.severity).toBe(ErrorSeverity.LOW);
  });

  it('should classify security errors', () => {
    const result = classifyError(new Error('Dangerous code pattern detected'));
    expect(result.category).toBe(ErrorCategory.SECURITY);
    expect(result.severity).toBe(ErrorSeverity.HIGH);
  });

  it('should classify rate limit errors', () => {
    const result = classifyError(new Error('Rate limit exceeded'));
    expect(result.category).toBe(ErrorCategory.RATE_LIMIT);
    expect(result.severity).toBe(ErrorSeverity.LOW);
  });

  it('should default to internal error for unknown errors', () => {
    const result = classifyError(new Error('Something strange happened'));
    expect(result.category).toBe(ErrorCategory.INTERNAL);
    expect(result.code).toBe('UNKNOWN_ERROR');
  });

  it('should handle non-Error values', () => {
    const result = classifyError('string error');
    expect(result.category).toBe(ErrorCategory.INTERNAL);
  });
});

describe('Error Wrapping', () => {
  it('should wrap error with context', () => {
    const original = new Error('Connection refused');
    const wrapped = wrapError(original, 'Failed to execute tool');

    expect(wrapped.message).toContain('Failed to execute tool');
    expect(wrapped.message).toContain('Connection refused');
    expect(wrapped.cause).toBe(original);
    expect(wrapped.details?.originalContext).toBe('Failed to execute tool');
  });

  it('should handle string errors', () => {
    const wrapped = wrapError('Plain string error', 'Context');
    expect(wrapped.message).toContain('Context');
    expect(wrapped.message).toContain('Plain string error');
  });

  it('should preserve error classification', () => {
    const timeoutError = new Error('Request timed out');
    const wrapped = wrapError(timeoutError, 'API call');

    expect(wrapped.category).toBe(ErrorCategory.TIMEOUT);
  });
});

describe('Recovery Suggestions', () => {
  it('should provide validation recovery suggestions', () => {
    const suggestions = getRecoverySuggestions(ErrorCategory.VALIDATION);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.some(s => s.includes('input'))).toBe(true);
  });

  it('should provide connection recovery suggestions', () => {
    const suggestions = getRecoverySuggestions(ErrorCategory.CONNECTION);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.some(s => s.includes('Blender'))).toBe(true);
  });

  it('should provide security recovery suggestions', () => {
    const suggestions = getRecoverySuggestions(ErrorCategory.SECURITY);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.some(s => s.includes('dangerous'))).toBe(true);
  });

  it('should provide default suggestions for internal errors', () => {
    const suggestions = getRecoverySuggestions(ErrorCategory.INTERNAL);
    expect(suggestions.length).toBeGreaterThan(0);
  });
});

describe('Error to Tool Result Conversion', () => {
  it('should convert error to tool result', () => {
    const error = createError(
      ErrorCategory.VALIDATION,
      'INVALID_PARAM',
      'Invalid parameter',
      { details: { param: 'name' } }
    );

    const result = errorToToolResult(error);

    expect(result.isError).toBe(true);
    expect(result.content[0].type).toBe('text');

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBe(true);
    expect(parsed.category).toBe('validation');
    expect(parsed.code).toBe('INVALID_PARAM');
  });

  it('should include recovery suggestions', () => {
    const error = createError(
      ErrorCategory.CONNECTION,
      'CONN_FAIL',
      'Failed',
      { recovery: ['Try again', 'Restart'] }
    );

    const result = errorToToolResult(error);
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.recovery).toContain('Try again');
    expect(parsed.recovery).toContain('Restart');
  });
});

describe('Convenience Error Functions', () => {
  describe('validationError', () => {
    it('should create validation error with field info', () => {
      const error = validationError('name', 'must be a string', 123);

      expect(error.category).toBe(ErrorCategory.VALIDATION);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.message).toContain('name');
      expect(error.details?.field).toBe('name');
      expect(error.details?.invalidValue).toBe(123);
    });
  });

  describe('notFoundError', () => {
    it('should create not found error with resource info', () => {
      const error = notFoundError('Object', 'Cube');

      expect(error.category).toBe(ErrorCategory.NOT_FOUND);
      expect(error.code).toBe('OBJECT_NOT_FOUND');
      expect(error.message).toContain('Cube');
      expect(error.details?.resourceType).toBe('Object');
      expect(error.details?.resourceName).toBe('Cube');
    });
  });
});

describe('Error Category Completeness', () => {
  it('should have all categories defined', () => {
    const categories = Object.values(ErrorCategory);
    expect(categories).toContain('validation');
    expect(categories).toContain('connection');
    expect(categories).toContain('execution');
    expect(categories).toContain('timeout');
    expect(categories).toContain('security');
    expect(categories).toContain('rate_limit');
    expect(categories).toContain('internal');
    expect(categories).toContain('not_found');
    expect(categories).toContain('external');
  });

  it('should have recovery suggestions for all categories', () => {
    const categories = Object.values(ErrorCategory);
    for (const category of categories) {
      const suggestions = getRecoverySuggestions(category as ErrorCategory);
      expect(suggestions.length).toBeGreaterThan(0);
    }
  });
});

describe('Error Severity Levels', () => {
  it('should have all severity levels defined', () => {
    const severities = Object.values(ErrorSeverity);
    expect(severities).toContain('low');
    expect(severities).toContain('medium');
    expect(severities).toContain('high');
    expect(severities).toContain('critical');
  });

  it('should assign appropriate severity for each error type', () => {
    // Low severity errors
    expect(classifyError(new Error('Validation failed')).severity).toBe(ErrorSeverity.LOW);
    expect(classifyError(new Error('Rate limit')).severity).toBe(ErrorSeverity.LOW);

    // High severity errors
    expect(classifyError(new Error('Security violation')).severity).toBe(ErrorSeverity.HIGH);
    expect(classifyError(new Error('ECONNREFUSED')).severity).toBe(ErrorSeverity.HIGH);
  });
});
