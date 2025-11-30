# Code Standards & Guidelines

**Last Updated:** 2025-11-30
**Version:** 1.0
**Applies to:** All project code (TypeScript, Python)

## Overview

This document establishes the coding standards and best practices for the ClaudeKit Blender MCP project. These standards ensure code quality, maintainability, and consistency across the entire codebase.

## Table of Contents

1. [General Principles](#general-principles)
2. [TypeScript Standards](#typescript-standards)
3. [Python Standards](#python-standards)
4. [File Organization](#file-organization)
5. [Naming Conventions](#naming-conventions)
6. [Code Quality](#code-quality)
7. [Testing Standards](#testing-standards)
8. [Documentation Standards](#documentation-standards)
9. [Security Guidelines](#security-guidelines)
10. [Performance Guidelines](#performance-guidelines)

## General Principles

### Code Quality Philosophy
- **Clarity over cleverness**: Write code that is easy to understand
- **Consistency**: Follow established patterns throughout the codebase
- **Maintainability**: Code should be easy to modify and extend
- **Testability**: All code should be unit testable
- **Security first**: Security considerations in all development decisions

### Development Workflow
1. **Feature Branches**: All development done in feature branches
2. **Code Reviews**: Mandatory peer review for all changes
3. **Automated Testing**: CI/CD pipeline with comprehensive testing
4. **Documentation**: Documentation updated with every feature
5. **Incremental Development**: Small, frequent commits with clear messages

## TypeScript Standards

### Language Configuration

**tsconfig.json**:
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noImplicitReturns": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true
  }
}
```

### Code Style

#### Imports
```typescript
// External libraries first
import express from 'express'
import { z } from 'zod'
import net from 'net'

// Internal modules next
import { BlenderSocketClient } from '../utils/socket-client'
import { ValidationResult } from '../types'
import { CONSTANTS } from '../constants'

// Type imports separately if needed
import type { BlenderObject, Vector3D } from '../types'
```

#### Function Declarations
```typescript
// Use explicit return types
function validateVector3D(vector: unknown): ValidationResult<Vector3D> {
  // Implementation
}

// Async functions with proper error handling
async function connectToBlender(timeout: number = 180000): Promise<boolean> {
  try {
    // Implementation
    return true
  } catch (error) {
    // Proper error handling
    return false
  }
}
```

#### Class Definitions
```typescript
export class BlenderSocketClient {
  private readonly host: string
  private readonly port: number
  private socket: net.Socket | null = null

  constructor(host: string = 'localhost', port: number = 9876) {
    this.host = host
    this.port = port
  }

  public async connect(): Promise<void> {
    // Implementation
  }

  private handleError(error: Error): void {
    // Private helper methods
  }
}
```

#### Interface Definitions
```typescript
export interface BlenderObject {
  readonly name: string
  readonly type: ObjectType
  readonly location: Vector3D
  readonly rotation: Vector3D
  readonly scale: Vector3D
  readonly material?: Material
}

export interface ValidationResult<T> {
  readonly success: boolean
  readonly data?: T
  readonly error?: string
}
```

### Error Handling

```typescript
// Custom error classes
export class BlenderConnectionError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message)
    this.name = 'BlenderConnectionError'
  }
}

// Consistent error handling pattern
try {
  const result = await operation()
  return { success: true, data: result }
} catch (error) {
  if (error instanceof BlenderConnectionError) {
    return { success: false, error: error.message }
  }
  return { success: false, error: 'Unknown error occurred' }
}
```

### Validation with Zod

```typescript
// Define schemas at module level
const Vector3DSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number()
})

const BlenderObjectSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['MESH', 'LIGHT', 'CAMERA', 'EMPTY']),
  location: Vector3DSchema,
  rotation: Vector3DSchema,
  scale: Vector3DSchema
})

// Use schemas for validation
export function validateBlenderObject(data: unknown): ValidationResult<BlenderObject> {
  const result = BlenderObjectSchema.safeParse(data)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return { success: false, error: result.error.message }
}
```

## Python Standards (Blender Addon)

### Code Style

```python
# imports at top with grouping
import bpy
import mathutils
import json
import socket
import threading
from datetime import datetime
from typing import Dict, List, Optional, Union

# Constants in UPPER_SNAKE_CASE
DEFAULT_HOST = 'localhost'
DEFAULT_PORT = 9876
CONNECTION_TIMEOUT = 180  # seconds

# Class definitions with docstrings
class BlenderMCPServer:
    """TCP server for handling MCP requests from Claude."""

    def __init__(self, host: str = DEFAULT_HOST, port: int = DEFAULT_PORT):
        self.host = host
        self.port = port
        self.server_socket: Optional[socket.socket] = None
        self.is_running = False

    def start(self) -> None:
        """Start the TCP server and begin accepting connections."""
        # Implementation with proper error handling
        try:
            self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.server_socket.bind((self.host, self.port))
            self.server_socket.listen(5)
            self.is_running = True
            self._accept_connections()
        except Exception as e:
            print(f"Failed to start server: {e}")
            self.stop()

    def _accept_connections(self) -> None:
        """Accept incoming connections in a separate thread."""
        while self.is_running:
            try:
                client_socket, address = self.server_socket.accept()
                client_thread = threading.Thread(
                    target=self._handle_client,
                    args=(client_socket, address)
                )
                client_thread.daemon = True
                client_thread.start()
            except Exception as e:
                if self.is_running:
                    print(f"Error accepting connection: {e}")

    def stop(self) -> None:
        """Stop the server and clean up resources."""
        self.is_running = False
        if self.server_socket:
            self.server_socket.close()
```

### JSON-RPC Handler

```python
def handle_json_rpc_request(self, data: str) -> Dict[str, Any]:
    """Handle JSON-RPC 2.0 requests."""
    try:
        request = json.loads(data)

        # Validate JSON-RPC format
        if not self._validate_json_rpc(request):
            return self._create_error_response(-32600, "Invalid Request")

        method = request.get('method')
        params = request.get('params', {})
        request_id = request.get('id')

        # Route to appropriate handler
        if method == 'blender.create_object':
            result = self._create_object(params)
        elif method == 'blender.delete_object':
            result = self._delete_object(params)
        else:
            return self._create_error_response(-32601, "Method not found", request_id)

        return self._create_success_response(result, request_id)

    except json.JSONDecodeError:
        return self._create_error_response(-32700, "Parse error")
    except Exception as e:
        return self._create_error_response(-32603, f"Internal error: {str(e)}")
```

## File Organization

### Directory Structure

```
src/
├── types/              # TypeScript type definitions
│   └── index.ts        # All type exports
├── utils/              # Utility modules
│   ├── formatters.ts   # Response formatting
│   ├── socket-client.ts # Socket communication
│   └── validators.ts   # Data validation
├── constants.ts        # Project constants
├── index.ts           # Main entry point
└── server.ts          # MCP server implementation

blender-addon/
└── addon.py           # Blender addon (single file for simplicity)

docs/                  # Documentation
├── codebase-summary.md
├── project-overview-pdr.md
├── system-architecture.md
├── project-roadmap.md
└── code-standards.md
```

### File Naming Conventions

- **TypeScript**: kebab-case for files (`socket-client.ts`, `formatters.ts`)
- **Python**: snake_case for files (`blender_addon.py`)
- **Documentation**: kebab-case (`system-architecture.md`)

### Module Organization

```typescript
// types/index.ts - Central type exports
export interface Vector3D {
  x: number
  y: number
  z: number
}

export interface BlenderObject {
  name: string
  type: ObjectType
  location: Vector3D
  rotation: Vector3D
  scale: Vector3D
}

export type ObjectType = 'MESH' | 'LIGHT' | 'CAMERA' | 'EMPTY'

// constants.ts - Project constants
export const DEFAULT_HOST = 'localhost'
export const DEFAULT_PORT = 9876
export const CONNECTION_TIMEOUT = 180000 // 180 seconds
export const MAX_RESPONSE_SIZE = 1000000 // 1MB
```

## Naming Conventions

### TypeScript/JavaScript

```typescript
// Variables and functions: camelCase
const socketClient = new BlenderSocketClient()
function validateVector3D() {}

// Classes: PascalCase
class BlenderSocketClient {}
class ValidationResult {}

// Interfaces: PascalCase with 'I' prefix optional (prefer no prefix)
interface BlenderObject {}
interface ValidationResult {}

// Constants: UPPER_SNAKE_CASE
const DEFAULT_TIMEOUT = 180000
const MAX_RETRIES = 3

// Enums: PascalCase
enum ObjectType {
  MESH = 'MESH',
  LIGHT = 'LIGHT',
  CAMERA = 'CAMERA'
}

// Types: PascalCase
type Vector3D = {
  x: number
  y: number
  z: number
}
```

### Python

```python
# Variables and functions: snake_case
socket_client = BlenderSocketClient()
def validate_vector_3d():
    pass

# Classes: PascalCase
class BlenderMCPServer:
    pass

# Constants: UPPER_SNAKE_CASE
DEFAULT_TIMEOUT = 180000
MAX_RETRIES = 3

# Private members: underscore prefix
self._private_method()
self._internal_variable
```

## Code Quality

### Linting Configuration

**.eslintrc.json**:
```json
{
  "extends": [
    "@typescript-eslint/recommended",
    "prettier"
  ],
  "rules": {
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/explicit-function-return-type": "warn",
    "@typescript-eslint/no-explicit-any": "warn",
    "prefer-const": "error",
    "no-var": "error"
  }
}
```

**pyproject.toml** (for Python):
```toml
[tool.black]
line-length = 88
target-version = ['py37']

[tool.isort]
profile = "black"
multi_line_output = 3

[tool.flake8]
max-line-length = 88
extend-ignore = ["E203", "W503"]
```

### Code Review Checklist

#### TypeScript Reviews
- [ ] All functions have explicit return types
- [ ] Proper error handling with try-catch blocks
- [ ] Input validation using Zod schemas
- [ ] No `any` types unless absolutely necessary
- [ ] Proper import organization
- [ ] No unused variables or imports

#### Python Reviews
- [ ] Type hints used where appropriate
- [ ] Proper exception handling
- [ ] Docstrings for all public functions and classes
- [ ] PEP 8 compliance
- [ ] No hardcoded values (use constants)
- [ ] Proper import organization

#### General Reviews
- [ ] Code follows established patterns
- [ ] Security considerations addressed
- [ ] Performance implications considered
- [ ] Documentation updated
- [ ] Tests included for new functionality
- [ ] No TODO comments left in production code

## Testing Standards

### Unit Testing

```typescript
// tests/utils/validators.test.ts
import { describe, it, expect } from 'vitest'
import { validateBlenderObject } from '../../src/utils/validators'

describe('validateBlenderObject', () => {
  it('should validate a valid blender object', () => {
    const validObject = {
      name: 'TestCube',
      type: 'MESH',
      location: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    }

    const result = validateBlenderObject(validObject)
    expect(result.success).toBe(true)
    expect(result.data).toEqual(validObject)
  })

  it('should reject invalid blender object', () => {
    const invalidObject = {
      name: '',
      type: 'INVALID_TYPE'
    }

    const result = validateBlenderObject(invalidObject)
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })
})
```

### Integration Testing

```typescript
// tests/integration/socket-client.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { BlenderSocketClient } from '../../src/utils/socket-client'

describe('BlenderSocketClient Integration', () => {
  let client: BlenderSocketClient

  beforeEach(() => {
    client = new BlenderSocketClient()
  })

  afterEach(async () => {
    await client.disconnect()
  })

  it('should connect to blender server', async () => {
    const connected = await client.connect()
    expect(connected).toBe(true)
  })

  it('should send and receive messages', async () => {
    await client.connect()

    const request = {
      jsonrpc: '2.0',
      method: 'blender.create_object',
      params: { name: 'TestCube', type: 'MESH' },
      id: 'test-001'
    }

    const response = await client.sendRequest(request)
    expect(response).toHaveProperty('result')
  })
})
```

### Coverage Requirements

- **Unit Tests**: 95% line coverage minimum
- **Integration Tests**: All critical paths covered
- **E2E Tests**: Major user workflows covered
- **Security Tests**: All input validation covered

## Documentation Standards

### Code Documentation

```typescript
/**
 * Establishes a TCP connection to the Blender addon server.
 *
 * @param timeout - Connection timeout in milliseconds (default: 180000)
 * @returns Promise that resolves to true if connection successful
 *
 * @example
 * ```typescript
 * const client = new BlenderSocketClient()
 * const connected = await client.connect()
 * if (connected) {
 *   console.log('Connected to Blender')
 * }
 * ```
 */
public async connect(timeout: number = 180000): Promise<boolean> {
  // Implementation
}
```

```python
def handle_json_rpc_request(self, data: str) -> Dict[str, Any]:
    """
    Handle JSON-RPC 2.0 requests from clients.

    Args:
        data: JSON string containing the JSON-RPC request

    Returns:
        Dictionary containing the JSON-RPC response

    Raises:
        json.JSONDecodeError: If the request is not valid JSON
        ValueError: If the request format is invalid

    Example:
        >>> request = '{"jsonrpc": "2.0", "method": "test", "id": 1}'
        >>> response = server.handle_json_rpc_request(request)
        >>> print(response['result'])
    """
    # Implementation
```

### API Documentation

- **OpenAPI/Swagger**: For REST endpoints
- **JSDoc**: For TypeScript APIs
- **Docstrings**: For Python APIs
- **Examples**: Code examples for all major features

### README Standards

Each module should have a README.md containing:
- Purpose and overview
- Installation instructions
- Usage examples
- API reference
- Contributing guidelines

## Security Guidelines

### Input Validation

```typescript
// Always validate external inputs
const userInput = JSON.parse(request.body)
const validationResult = validateBlenderObject(userInput)

if (!validationResult.success) {
  return {
    status: 400,
    body: { error: validationResult.error }
  }
}
```

### Error Handling

```typescript
// Never expose internal errors to clients
try {
  const result = await sensitiveOperation()
  return { success: true, data: result }
} catch (error) {
  console.error('Internal error:', error) // Log full error
  return {
    success: false,
    error: 'An internal error occurred' // Generic message to client
  }
}
```

### Resource Limits

```typescript
// Implement timeouts and resource limits
const TIMEOUT = 180000 // 180 seconds
const MAX_SIZE = 1024 * 1024 // 1MB

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Operation timed out')), timeoutMs)
  })

  return Promise.race([promise, timeoutPromise])
}
```

## Performance Guidelines

### Async Operations

```typescript
// Use async/await consistently
async function processMultipleRequests(requests: Request[]): Promise<Response[]> {
  // Process in parallel when possible
  const responses = await Promise.all(
    requests.map(request => processRequest(request))
  )
  return responses
}

// Use batching for operations
async function batchCreateObjects(objects: BlenderObject[]): Promise<boolean> {
  const BATCH_SIZE = 10
  for (let i = 0; i < objects.length; i += BATCH_SIZE) {
    const batch = objects.slice(i, i + BATCH_SIZE)
    await createBatch(batch)
  }
  return true
}
```

### Memory Management

```typescript
// Clean up resources properly
class ResourceManager {
  private connections: Map<string, net.Socket> = new Map()

  public async cleanup(): Promise<void> {
    // Close all connections
    for (const [id, socket] of this.connections) {
      socket.destroy()
    }
    this.connections.clear()

    // Force garbage collection if needed
    if (global.gc) {
      global.gc()
    }
  }
}
```

### Caching Strategy

```typescript
// Implement caching for expensive operations
class OperationCache {
  private cache = new Map<string, { data: any, timestamp: number }>()
  private readonly TTL = 60000 // 1 minute

  public get(key: string): any | null {
    const item = this.cache.get(key)
    if (item && Date.now() - item.timestamp < this.TTL) {
      return item.data
    }
    this.cache.delete(key)
    return null
  }

  public set(key: string, data: any): void {
    this.cache.set(key, { data, timestamp: Date.now() })
  }
}
```

---

**Document Status:** Current and Enforced
**Last Review:** 2025-11-30
**Next Review:** 2025-12-31
**Compliance:** Mandatory for all project contributions