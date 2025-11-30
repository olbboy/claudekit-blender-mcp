/**
 * Error Propagation Tests
 *
 * Tests that errors are properly propagated through the system
 * with appropriate context and without losing information.
 */

import { describe, it, expect, vi } from 'vitest';

// Error types matching the system
enum ErrorCategory {
  VALIDATION = 'validation',
  CONNECTION = 'connection',
  EXECUTION = 'execution',
  TIMEOUT = 'timeout',
  SECURITY = 'security',
  INTERNAL = 'internal'
}

interface BlenderError {
  category: ErrorCategory;
  code: string;
  message: string;
  details?: Record<string, unknown>;
  cause?: Error;
}

// Error factory for consistent error creation
function createBlenderError(
  category: ErrorCategory,
  code: string,
  message: string,
  details?: Record<string, unknown>,
  cause?: Error
): BlenderError {
  return { category, code, message, details, cause };
}

// Error wrapper that preserves stack traces
function wrapError(error: Error, context: string): Error {
  const wrapped = new Error(`${context}: ${error.message}`);
  wrapped.cause = error;
  wrapped.stack = `${wrapped.stack}\nCaused by: ${error.stack}`;
  return wrapped;
}

// Tool result type
interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

// Error to tool result converter
function errorToToolResult(error: BlenderError): ToolResult {
  const errorInfo = {
    error: true,
    category: error.category,
    code: error.code,
    message: error.message,
    details: error.details
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(errorInfo, null, 2) }],
    isError: true
  };
}

describe('Error Creation', () => {
  it('should create validation errors with details', () => {
    const error = createBlenderError(
      ErrorCategory.VALIDATION,
      'INVALID_PARAM',
      'Invalid parameter value',
      { param: 'location', expected: 'array', received: 'string' }
    );

    expect(error.category).toBe(ErrorCategory.VALIDATION);
    expect(error.code).toBe('INVALID_PARAM');
    expect(error.details?.param).toBe('location');
  });

  it('should create connection errors with cause', () => {
    const cause = new Error('ECONNREFUSED');
    const error = createBlenderError(
      ErrorCategory.CONNECTION,
      'CONNECT_FAILED',
      'Failed to connect to Blender',
      { host: 'localhost', port: 9876 },
      cause
    );

    expect(error.category).toBe(ErrorCategory.CONNECTION);
    expect(error.cause).toBe(cause);
    expect(error.details?.port).toBe(9876);
  });

  it('should create security errors', () => {
    const error = createBlenderError(
      ErrorCategory.SECURITY,
      'DANGEROUS_CODE',
      'Code contains dangerous patterns',
      { patterns: ['os.system', 'subprocess'] }
    );

    expect(error.category).toBe(ErrorCategory.SECURITY);
    expect(error.code).toBe('DANGEROUS_CODE');
  });

  it('should create timeout errors', () => {
    const error = createBlenderError(
      ErrorCategory.TIMEOUT,
      'RESPONSE_TIMEOUT',
      'Blender did not respond in time',
      { timeoutMs: 5000 }
    );

    expect(error.category).toBe(ErrorCategory.TIMEOUT);
    expect(error.details?.timeoutMs).toBe(5000);
  });

  it('should create execution errors', () => {
    const error = createBlenderError(
      ErrorCategory.EXECUTION,
      'SCRIPT_ERROR',
      'Python script execution failed',
      { line: 5, error: "NameError: name 'undefined_var' is not defined" }
    );

    expect(error.category).toBe(ErrorCategory.EXECUTION);
    expect(error.details?.line).toBe(5);
  });
});

describe('Error Wrapping', () => {
  it('should wrap errors with context', () => {
    const original = new Error('Connection refused');
    const wrapped = wrapError(original, 'Failed to execute tool');

    expect(wrapped.message).toBe('Failed to execute tool: Connection refused');
    expect(wrapped.cause).toBe(original);
  });

  it('should preserve original stack trace', () => {
    const original = new Error('Original error');
    const wrapped = wrapError(original, 'Context');

    expect(wrapped.stack).toContain('Caused by:');
    expect(wrapped.stack).toContain('Original error');
  });

  it('should support multiple levels of wrapping', () => {
    const level1 = new Error('Root cause');
    const level2 = wrapError(level1, 'Database layer');
    const level3 = wrapError(level2, 'Service layer');

    expect(level3.message).toBe('Service layer: Database layer: Root cause');
    expect(level3.cause).toBe(level2);
  });
});

describe('Error to Tool Result Conversion', () => {
  it('should convert validation errors to tool results', () => {
    const error = createBlenderError(
      ErrorCategory.VALIDATION,
      'INVALID_OBJECT_NAME',
      'Object name cannot be empty'
    );

    const result = errorToToolResult(error);

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBe(true);
    expect(parsed.category).toBe('validation');
    expect(parsed.code).toBe('INVALID_OBJECT_NAME');
  });

  it('should include error details in tool result', () => {
    const error = createBlenderError(
      ErrorCategory.EXECUTION,
      'OBJECT_NOT_FOUND',
      'Object not found in scene',
      { objectName: 'NonExistent', availableObjects: ['Cube', 'Camera'] }
    );

    const result = errorToToolResult(error);
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.details.objectName).toBe('NonExistent');
    expect(parsed.details.availableObjects).toContain('Cube');
  });

  it('should format connection errors appropriately', () => {
    const error = createBlenderError(
      ErrorCategory.CONNECTION,
      'BLENDER_UNAVAILABLE',
      'Cannot connect to Blender',
      { host: 'localhost', port: 9876, retries: 3 }
    );

    const result = errorToToolResult(error);
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.category).toBe('connection');
    expect(parsed.details.retries).toBe(3);
  });
});

describe('Error Chain Propagation', () => {
  // Simulate a chain of operations
  async function lowLevelOperation(): Promise<void> {
    throw new Error('Socket closed unexpectedly');
  }

  async function midLevelOperation(): Promise<void> {
    try {
      await lowLevelOperation();
    } catch (e) {
      throw wrapError(e as Error, 'Command execution failed');
    }
  }

  async function highLevelOperation(): Promise<ToolResult> {
    try {
      await midLevelOperation();
      return { content: [{ type: 'text', text: 'Success' }] };
    } catch (e) {
      const error = createBlenderError(
        ErrorCategory.CONNECTION,
        'OPERATION_FAILED',
        (e as Error).message,
        { originalError: (e as Error).cause?.message }
      );
      return errorToToolResult(error);
    }
  }

  it('should propagate errors through the chain', async () => {
    const result = await highLevelOperation();

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.message).toContain('Command execution failed');
    expect(parsed.message).toContain('Socket closed unexpectedly');
  });

  it('should preserve original error context', async () => {
    const result = await highLevelOperation();
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.details.originalError).toBe('Socket closed unexpectedly');
  });
});

describe('Validation Error Scenarios', () => {
  function validateObjectName(name: unknown): BlenderError | null {
    if (typeof name !== 'string') {
      return createBlenderError(
        ErrorCategory.VALIDATION,
        'INVALID_TYPE',
        'Object name must be a string',
        { expected: 'string', received: typeof name }
      );
    }
    if (name.length === 0) {
      return createBlenderError(
        ErrorCategory.VALIDATION,
        'EMPTY_VALUE',
        'Object name cannot be empty'
      );
    }
    if (name.length > 63) {
      return createBlenderError(
        ErrorCategory.VALIDATION,
        'VALUE_TOO_LONG',
        'Object name exceeds maximum length',
        { maxLength: 63, actualLength: name.length }
      );
    }
    return null;
  }

  it('should detect type errors', () => {
    const error = validateObjectName(123);
    expect(error?.code).toBe('INVALID_TYPE');
    expect(error?.details?.expected).toBe('string');
  });

  it('should detect empty values', () => {
    const error = validateObjectName('');
    expect(error?.code).toBe('EMPTY_VALUE');
  });

  it('should detect length violations', () => {
    const error = validateObjectName('a'.repeat(100));
    expect(error?.code).toBe('VALUE_TOO_LONG');
    expect(error?.details?.maxLength).toBe(63);
  });

  it('should pass valid values', () => {
    const error = validateObjectName('Cube');
    expect(error).toBeNull();
  });
});

describe('Connection Error Scenarios', () => {
  interface ConnectionState {
    connected: boolean;
    lastError?: Error;
    retryCount: number;
  }

  function handleConnectionError(
    error: Error,
    state: ConnectionState
  ): BlenderError {
    state.lastError = error;
    state.connected = false;
    state.retryCount++;

    if (error.message.includes('ECONNREFUSED')) {
      return createBlenderError(
        ErrorCategory.CONNECTION,
        'CONNECTION_REFUSED',
        'Blender is not running or not accepting connections',
        { retryCount: state.retryCount }
      );
    }

    if (error.message.includes('ETIMEDOUT')) {
      return createBlenderError(
        ErrorCategory.CONNECTION,
        'CONNECTION_TIMEOUT',
        'Connection to Blender timed out',
        { retryCount: state.retryCount }
      );
    }

    return createBlenderError(
      ErrorCategory.CONNECTION,
      'CONNECTION_ERROR',
      'Unknown connection error',
      { originalMessage: error.message, retryCount: state.retryCount }
    );
  }

  it('should handle ECONNREFUSED', () => {
    const state: ConnectionState = { connected: true, retryCount: 0 };
    const error = handleConnectionError(new Error('ECONNREFUSED'), state);

    expect(error.code).toBe('CONNECTION_REFUSED');
    expect(state.connected).toBe(false);
    expect(state.retryCount).toBe(1);
  });

  it('should handle ETIMEDOUT', () => {
    const state: ConnectionState = { connected: true, retryCount: 0 };
    const error = handleConnectionError(new Error('ETIMEDOUT'), state);

    expect(error.code).toBe('CONNECTION_TIMEOUT');
  });

  it('should handle unknown errors', () => {
    const state: ConnectionState = { connected: true, retryCount: 0 };
    const error = handleConnectionError(new Error('Something went wrong'), state);

    expect(error.code).toBe('CONNECTION_ERROR');
    expect(error.details?.originalMessage).toBe('Something went wrong');
  });

  it('should track retry count', () => {
    const state: ConnectionState = { connected: true, retryCount: 2 };
    const error = handleConnectionError(new Error('ECONNREFUSED'), state);

    expect(error.details?.retryCount).toBe(3);
  });
});

describe('Security Error Scenarios', () => {
  const DANGEROUS_PATTERNS = [
    'os.system',
    'subprocess',
    'eval(',
    'exec(',
    '__import__',
    'open(',
    'shutil.rmtree'
  ];

  function checkCodeSecurity(code: string): BlenderError | null {
    const detectedPatterns: string[] = [];

    for (const pattern of DANGEROUS_PATTERNS) {
      if (code.includes(pattern)) {
        detectedPatterns.push(pattern);
      }
    }

    if (detectedPatterns.length > 0) {
      return createBlenderError(
        ErrorCategory.SECURITY,
        'DANGEROUS_CODE_DETECTED',
        'Code contains potentially dangerous patterns',
        { patterns: detectedPatterns, patternCount: detectedPatterns.length }
      );
    }

    return null;
  }

  it('should detect os.system calls', () => {
    const error = checkCodeSecurity('os.system("rm -rf /")');
    expect(error?.code).toBe('DANGEROUS_CODE_DETECTED');
    expect(error?.details?.patterns).toContain('os.system');
  });

  it('should detect subprocess usage', () => {
    const error = checkCodeSecurity('subprocess.call(["ls"])');
    expect(error?.code).toBe('DANGEROUS_CODE_DETECTED');
    expect(error?.details?.patterns).toContain('subprocess');
  });

  it('should detect multiple dangerous patterns', () => {
    const error = checkCodeSecurity('eval(os.system("cmd"))');
    expect(error?.details?.patternCount).toBe(2);
    expect(error?.details?.patterns).toContain('eval(');
    expect(error?.details?.patterns).toContain('os.system');
  });

  it('should allow safe code', () => {
    const error = checkCodeSecurity('[obj.name for obj in bpy.data.objects]');
    expect(error).toBeNull();
  });
});

describe('Execution Error Recovery', () => {
  interface RetryConfig {
    maxRetries: number;
    delayMs: number;
    backoffMultiplier: number;
  }

  async function executeWithRetry<T>(
    operation: () => Promise<T>,
    config: RetryConfig
  ): Promise<{ result?: T; error?: BlenderError; attempts: number }> {
    let lastError: Error | undefined;
    let delay = config.delayMs;

    for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
      try {
        const result = await operation();
        return { result, attempts: attempt };
      } catch (e) {
        lastError = e as Error;
        if (attempt < config.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= config.backoffMultiplier;
        }
      }
    }

    return {
      error: createBlenderError(
        ErrorCategory.EXECUTION,
        'MAX_RETRIES_EXCEEDED',
        'Operation failed after maximum retries',
        { maxRetries: config.maxRetries, lastError: lastError?.message }
      ),
      attempts: config.maxRetries
    };
  }

  it('should succeed on first attempt', async () => {
    const result = await executeWithRetry(
      async () => 'success',
      { maxRetries: 3, delayMs: 10, backoffMultiplier: 2 }
    );

    expect(result.result).toBe('success');
    expect(result.attempts).toBe(1);
    expect(result.error).toBeUndefined();
  });

  it('should retry on failure and eventually succeed', async () => {
    let attempts = 0;
    const result = await executeWithRetry(
      async () => {
        attempts++;
        if (attempts < 3) throw new Error('Temporary failure');
        return 'success';
      },
      { maxRetries: 5, delayMs: 1, backoffMultiplier: 1 }
    );

    expect(result.result).toBe('success');
    expect(result.attempts).toBe(3);
  });

  it('should return error after max retries', async () => {
    const result = await executeWithRetry(
      async () => { throw new Error('Persistent failure'); },
      { maxRetries: 3, delayMs: 1, backoffMultiplier: 1 }
    );

    expect(result.error?.code).toBe('MAX_RETRIES_EXCEEDED');
    expect(result.attempts).toBe(3);
    expect(result.error?.details?.lastError).toBe('Persistent failure');
  });
});

describe('Error Aggregation', () => {
  interface BatchResult {
    successes: number;
    failures: BlenderError[];
  }

  async function executeBatch(
    operations: Array<() => Promise<void>>
  ): Promise<BatchResult> {
    const result: BatchResult = { successes: 0, failures: [] };

    for (let i = 0; i < operations.length; i++) {
      try {
        await operations[i]();
        result.successes++;
      } catch (e) {
        result.failures.push(createBlenderError(
          ErrorCategory.EXECUTION,
          'BATCH_ITEM_FAILED',
          `Operation ${i} failed: ${(e as Error).message}`,
          { operationIndex: i }
        ));
      }
    }

    return result;
  }

  it('should aggregate multiple errors', async () => {
    const operations = [
      async () => { /* success */ },
      async () => { throw new Error('Error 1'); },
      async () => { /* success */ },
      async () => { throw new Error('Error 2'); }
    ];

    const result = await executeBatch(operations);

    expect(result.successes).toBe(2);
    expect(result.failures).toHaveLength(2);
    expect(result.failures[0].details?.operationIndex).toBe(1);
    expect(result.failures[1].details?.operationIndex).toBe(3);
  });

  it('should handle all successes', async () => {
    const operations = [
      async () => { /* success */ },
      async () => { /* success */ }
    ];

    const result = await executeBatch(operations);

    expect(result.successes).toBe(2);
    expect(result.failures).toHaveLength(0);
  });

  it('should handle all failures', async () => {
    const operations = [
      async () => { throw new Error('Error 1'); },
      async () => { throw new Error('Error 2'); }
    ];

    const result = await executeBatch(operations);

    expect(result.successes).toBe(0);
    expect(result.failures).toHaveLength(2);
  });
});
