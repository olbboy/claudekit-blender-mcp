import type { ToolResult, BlenderSocketResponse } from '../types/index.js';

/**
 * Standard error messages for common failure scenarios
 */
export const ErrorMessages = {
  UNKNOWN_ERROR: 'Unknown error occurred',
  CONNECTION_FAILED: 'Failed to connect to Blender',
  INVALID_RESPONSE: 'Invalid response from Blender',
  OPERATION_TIMEOUT: 'Operation timed out',
  OBJECT_NOT_FOUND: 'Object not found',
  MATERIAL_NOT_FOUND: 'Material not found',
  PERMISSION_DENIED: 'Permission denied',
  INVALID_INPUT: 'Invalid input parameters'
} as const;

/**
 * Creates a standardized error response for MCP tools
 *
 * @param message - The error message to display
 * @returns A properly formatted ToolResult with isError flag
 */
export function createErrorResponse(message: string): ToolResult {
  return {
    content: [{
      type: 'text',
      text: `Error: ${message}`
    }],
    isError: true
  };
}

/**
 * Creates a standardized success response for MCP tools
 *
 * @param message - The success message to display
 * @returns A properly formatted ToolResult
 */
export function createSuccessResponse(message: string): ToolResult {
  return {
    content: [{
      type: 'text',
      text: message
    }]
  };
}

/**
 * Extracts error message from BlenderSocketResponse with fallback
 *
 * @param response - The socket response from Blender
 * @param fallbackMessage - Default message if response.message is empty
 * @returns The error message string
 */
export function getErrorMessage(
  response: BlenderSocketResponse,
  fallbackMessage: string = ErrorMessages.UNKNOWN_ERROR
): string {
  return response.message || fallbackMessage;
}

/**
 * Handles Blender response and returns appropriate ToolResult
 *
 * @param response - The socket response from Blender
 * @param successMessage - Message to show on success
 * @param errorFallback - Default error message if response.message is empty
 * @returns A properly formatted ToolResult
 */
export function handleBlenderResponse(
  response: BlenderSocketResponse,
  successMessage: string,
  errorFallback: string = ErrorMessages.UNKNOWN_ERROR
): ToolResult {
  if (response.status === 'error') {
    return createErrorResponse(getErrorMessage(response, errorFallback));
  }
  return createSuccessResponse(successMessage);
}

/**
 * Handles caught errors and returns appropriate ToolResult
 *
 * @param error - The caught error
 * @returns A properly formatted ToolResult with isError flag
 */
export function handleCaughtError(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : ErrorMessages.UNKNOWN_ERROR;
  return createErrorResponse(message);
}
