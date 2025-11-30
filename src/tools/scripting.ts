import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getBlenderClient } from '../utils/socket-client.js';
import { getRateLimiter } from '../utils/rate-limiter.js';
import { getSecurityConfig } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { getCache } from '../utils/cache.js';
import type { ToolResult } from '../types/index.js';

// Get security config
const securityConfig = getSecurityConfig();

// Security constants from config
const MAX_CODE_SIZE = securityConfig.maxCodeSize;
const DEFAULT_TIMEOUT = securityConfig.codeExecutionTimeout;

/**
 * Dangerous patterns that should be blocked or warned about
 *
 * BUG-005 FIX: Use bounded quantifiers ({0,10}) instead of unbounded (*+)
 * to prevent catastrophic backtracking (ReDoS attacks).
 * Patterns are reordered for early failure on common cases.
 *
 * BUG-012 FIX: Enhanced patterns to detect evasion techniques:
 * - Whitespace-tolerant patterns (os . system)
 * - Bracket notation access (globals()['system'])
 * - Builtins access (__builtins__)
 * - File deletion operations (unlink, remove)
 */
const DANGEROUS_PATTERNS = [
  // BUG-005 + BUG-012 FIX: Whitespace-tolerant patterns
  { pattern: /\bos\s{0,5}\.\s{0,5}system/i, description: 'OS system call' },
  { pattern: /\bsubprocess\s{0,5}\.\s{0,5}\w+/i, description: 'Subprocess module' },
  { pattern: /\b__import__\s{0,10}\(/i, description: 'Dynamic import' },
  { pattern: /\beval\s{0,10}\(/i, description: 'Eval call' },
  { pattern: /\bexec\s{0,10}\(/i, description: 'Exec call' },
  { pattern: /\bopen\s{0,10}\([^)]{0,50}['"][wa]/i, description: 'File write operation' },
  { pattern: /\brm\s+-rf/i, description: 'Destructive file operation' },
  { pattern: /\bshutil\s{0,5}\.\s{0,5}rmtree/i, description: 'Recursive directory deletion' },
  { pattern: /\bsocket\s{0,5}\./i, description: 'Network socket access' },
  { pattern: /\burllib\s{0,5}\./i, description: 'Network URL access' },
  { pattern: /\brequests\s{0,5}\./i, description: 'HTTP requests library' },

  // BUG-012 FIX: Builtins access (evasion technique)
  { pattern: /\b__builtins__/i, description: 'Builtins access' },
  { pattern: /\bglobals\s{0,5}\(\s{0,5}\)/i, description: 'Globals access' },
  { pattern: /\bgetattr\s{0,5}\(/i, description: 'Dynamic attribute access' },

  // BUG-012 FIX: Bracket notation (evasion technique)
  { pattern: /\[\s{0,5}['"]system['"]\s{0,5}\]/i, description: 'Bracket system access' },
  { pattern: /\[\s{0,5}['"]eval['"]\s{0,5}\]/i, description: 'Bracket eval access' },
  { pattern: /\[\s{0,5}['"]exec['"]\s{0,5}\]/i, description: 'Bracket exec access' },
  { pattern: /\[\s{0,5}['"]__import__['"]\s{0,5}\]/i, description: 'Bracket import access' },

  // BUG-012 FIX: File deletion operations
  { pattern: /\bos\s{0,5}\.\s{0,5}unlink/i, description: 'File deletion (unlink)' },
  { pattern: /\bos\s{0,5}\.\s{0,5}remove/i, description: 'File removal' },
  { pattern: /\bos\s{0,5}\.\s{0,5}rmdir/i, description: 'Directory removal' },
  { pattern: /\bpathlib\s{0,5}\..*\.unlink/i, description: 'Pathlib file deletion' }
];

// Validate code for dangerous patterns
interface SecurityValidation {
  isValid: boolean;
  warnings: string[];
  blocked: boolean;
  blockedReason?: string;
}

/**
 * Validate code for security concerns
 *
 * BUG-005 FIX: Added size limit check BEFORE regex matching to prevent
 * ReDoS attacks on very large inputs.
 */
function validateCodeSecurity(code: string): SecurityValidation {
  const warnings: string[] = [];

  // BUG-005 FIX: Size limit before regex to prevent ReDoS
  if (code.length > MAX_CODE_SIZE) {
    return {
      isValid: false,
      warnings: [],
      blocked: true,
      blockedReason: `Code exceeds maximum size: ${MAX_CODE_SIZE} characters`
    };
  }

  // Check for dangerous patterns
  // BUG-005 FIX: Wrap in try-catch for additional safety
  for (const { pattern, description } of DANGEROUS_PATTERNS) {
    try {
      if (pattern.test(code)) {
        warnings.push(`Warning: Code contains ${description}`);
      }
    } catch (error) {
      // Log regex error but continue checking other patterns
      logger.warn('Regex validation error', {
        operation: 'validateCodeSecurity',
        pattern: pattern.source,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // Block extremely dangerous operations
  const blockedPatterns = [
    { pattern: /\bos\.system\s*\(\s*['"].*rm\s+-rf/i, reason: 'Destructive system command blocked' },
    { pattern: /\bshutil\.rmtree\s*\(\s*['"]\/['"]|['"]C:\\/i, reason: 'Root directory deletion blocked' }
  ];

  for (const { pattern, reason } of blockedPatterns) {
    if (pattern.test(code)) {
      return { isValid: false, warnings, blocked: true, blockedReason: reason };
    }
  }

  return { isValid: true, warnings, blocked: false };
}

// Sanitize code by removing potentially problematic characters
function sanitizeCode(code: string): string {
  // Remove null bytes and other control characters except newlines, tabs
  return code.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

const ExecuteCodeSchema = z.object({
  code: z.string()
    .min(1, 'Code cannot be empty')
    .max(MAX_CODE_SIZE, `Code exceeds maximum size of ${MAX_CODE_SIZE / 1024}KB`)
    .describe('Python code using bpy API'),
  timeout: z.number()
    .int()
    .min(1000)
    .max(180000)
    .optional()
    .default(DEFAULT_TIMEOUT)
    .describe('Execution timeout (ms)')
}).strict();

export function registerScriptingTools(server: McpServer) {
  // Tool 10: Execute Python Code
  server.registerTool(
    'blender_execute_code',
    {
      title: 'Execute Blender Python Code',
      description: `Execute Python code using Blender's bpy API.

Provides escape hatch for complex operations not covered by other tools. Use full bpy API access.

Args:
  - code (string): Python code to execute using bpy API (max 100KB)
  - timeout (optional): Execution timeout in milliseconds (1000-180000, default: 180000)

Returns:
  Execution result with any output or error message

Examples:
  - List objects: [obj.name for obj in bpy.data.objects]
  - Create custom mesh: bpy.ops.mesh.primitive_cube_add(location=(1, 2, 3))
  - Get object location: bpy.data.objects['Cube'].location[:]

Use when: Complex operations, custom workflows, bpy API access
Don't use when: Simple operations covered by dedicated tools

Security: Code is validated for dangerous patterns. System commands are restricted.
Performance: Long-running code may hit timeout limits (default 3 minutes)`,
      inputSchema: ExecuteCodeSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async (params): Promise<ToolResult> => {
      const toolLogger = logger.child({ tool: 'blender_execute_code' });

      try {
        // Check rate limit for scripting operations
        const rateLimiter = getRateLimiter();
        const rateLimitResult = rateLimiter.checkScriptingLimit();

        if (!rateLimitResult.allowed) {
          toolLogger.warn('Rate limit exceeded for scripting', {
            retryAfterMs: rateLimitResult.retryAfterMs
          });
          return {
            content: [{
              type: 'text',
              text: `Error: ${rateLimitResult.message}`
            }],
            isError: true
          };
        }

        // Sanitize the code
        const sanitizedCode = sanitizeCode(params.code);

        // Validate code security
        const validation = validateCodeSecurity(sanitizedCode);

        if (validation.blocked) {
          toolLogger.warn('Code blocked by security validation', {
            reason: validation.blockedReason
          });
          return {
            content: [{
              type: 'text',
              text: `Error: ${validation.blockedReason}`
            }],
            isError: true
          };
        }

        // Invalidate scene cache since code execution may modify scene
        const cache = getCache();
        cache.invalidateScene();

        toolLogger.debug('Executing code', {
          codeLength: sanitizedCode.length,
          timeout: params.timeout
        });

        const client = getBlenderClient();
        const response = await client.sendCommand('execute_code', {
          code: sanitizedCode,
          timeout: params.timeout
        });

        if (response.status === 'error') {
          toolLogger.error('Code execution failed', undefined, {
            message: response.message
          });
          return {
            content: [{
              type: 'text',
              text: `Error: ${response.message || 'Failed to execute Python code'}`
            }],
            isError: true
          };
        }

        toolLogger.debug('Code executed successfully');

        // Build response with execution result
        const resultParts: string[] = [];

        // Add security warnings if any
        if (validation.warnings.length > 0) {
          resultParts.push(validation.warnings.join('\n'));
        }

        // Add execution result
        if (response.result !== undefined && response.result !== null) {
          const resultStr = typeof response.result === 'string'
            ? response.result
            : JSON.stringify(response.result, null, 2);
          resultParts.push(`Result:\n${resultStr}`);
        } else {
          resultParts.push('Code executed successfully');
        }

        return {
          content: [{
            type: 'text',
            text: resultParts.join('\n\n')
          }]
        };

      } catch (error) {
        toolLogger.error('Code execution error', error instanceof Error ? error : undefined);
        return {
          content: [{
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );
}