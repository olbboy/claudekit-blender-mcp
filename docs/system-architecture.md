# System Architecture

**Last Updated:** 2025-11-30
**Version:** 1.0
**Phase:** Phase 02 Completed

## Overview

ClaudeKit Blender MCP implements a client-server architecture that facilitates communication between Claude AI and Blender through the Model Context Protocol (MCP). The system leverages TCP socket communication for real-time, low-latency interaction while maintaining strict security and validation standards.

## High-Level Architecture

```
┌─────────────────┐    JSON-RPC     ┌─────────────────┐    TCP Socket    ┌─────────────────┐
│   Claude AI     │ ◄──────────────► │ MCP Server      │ ◄──────────────► │ Blender Addon   │
│                 │                 │ (Node.js)       │   localhost:9876│   (Python)       │
└─────────────────┘                 └─────────────────┘                 └─────────────────┘
                                            │
                                            ▼
                                   ┌─────────────────┐
                                   │ Validation &    │
                                   │ Formatting      │
                                   │ Layer           │
                                   └─────────────────┘
```

## Core Components

### 1. MCP Server (src/index.ts, src/server.ts)
**Role**: Central communication hub and protocol handler

**Responsibilities**:
- MCP protocol implementation
- Tool registration and discovery
- Request routing and validation
- Response formatting and delivery

**Key Features**:
- Express.js-based HTTP server
- MCP SDK integration
- Plugin architecture for extensibility
- Comprehensive error handling

### 2. Socket Client (src/utils/socket-client.ts)
**Role**: TCP communication layer with Blender

**Technical Specifications**:
```typescript
class BlenderSocketClient {
  private host: string = 'localhost'
  private port: number = 9876
  private timeout: number = 180000 // 180 seconds
  private socket: net.Socket | null = null
}
```

**Capabilities**:
- Persistent TCP connections
- JSON-RPC 2.0 message handling
- Chunked response processing
- Automatic reconnection logic
- Timeout protection

### 3. Validation Framework (src/utils/validators.ts)
**Role**: Data integrity and type safety

**Zod Schema Coverage**:
- **3D Objects**: Mesh properties, transformations, materials
- **Vectors**: 3D coordinates, rotations, scales
- **Colors**: RGB/RGBA values, material properties
- **Screenshots**: Image data, dimensions, formats
- **Scene Properties**: Layers, cameras, lighting

**Example Schema**:
```typescript
const Vector3D = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number()
})

const BlenderObject = z.object({
  name: z.string(),
  type: z.enum(['MESH', 'LIGHT', 'CAMERA', 'EMPTY']),
  location: Vector3D,
  rotation: Vector3D,
  scale: Vector3D
})
```

### 4. Response Formatters (src/utils/formatters.ts)
**Role**: Output formatting and presentation

**Formatter Types**:
- **Markdown Formatter**: Structured text output with syntax highlighting
- **JSON Formatter**: Clean serialization for data exchange
- **Error Formatter**: Consistent error message presentation
- **Screenshot Formatter**: Image data and metadata handling

**Features**:
- Configurable character limits
- Truncation with ellipsis
- Proper escaping and sanitization
- Metadata preservation

### 5. Blender Addon (blender-addon/addon.py)
**Role**: Blender integration and 3D operations

**Architecture**:
- **Socket Server**: TCP server listening on localhost:9876
- **JSON-RPC Handler**: Request processing and response generation
- **3D Engine**: Blender API integration for object manipulation
- **Render Pipeline**: Screenshot and render output handling

**Core Capabilities**:
- 3D object creation, modification, deletion
- Material and texture management
- Scene and camera control
- Rendering and screenshot capture
- Animation timeline operations

## Communication Protocol

### JSON-RPC 2.0 Implementation
**Request Format**:
```json
{
  "jsonrpc": "2.0",
  "method": "blender.create_object",
  "params": {
    "name": "Cube",
    "type": "MESH",
    "location": {"x": 0, "y": 0, "z": 0}
  },
  "id": "req_001"
}
```

**Response Format**:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "success": true,
    "object_id": "Cube.001",
    "message": "Object created successfully"
  },
  "id": "req_001"
}
```

### Error Handling Protocol
**Error Response Structure**:
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32602,
    "message": "Invalid params",
    "data": {
      "validation_errors": ["location.z must be a number"]
    }
  },
  "id": "req_001"
}
```

## Data Flow Architecture

### Request Processing Flow
```
1. Claude AI Request
   ↓
2. MCP Server Validation
   ↓
3. Socket Client Transmission
   ↓
4. Blender Addon Processing
   ↓
5. 3D Operation Execution
   ↓
6. Response Generation
   ↓
7. Response Formatting
   ↓
8. Claude AI Response
```

### Chunked Response Handling
For large responses (screenshots, complex scenes):
```
1. Initial Chunk Header
   - Total chunks expected
   - Chunk sequence number
   - Data type identifier

2. Data Chunks
   - Sequential delivery
   - Integrity verification
   - Timeout management

3. Finalization
   - Assembly verification
   - Complete response delivery
   - Error recovery if needed
```

## Security Architecture

### Input Validation Pipeline
```
User Input → Zod Schema Validation → Type Safety → Sanitization → Processing
```

**Security Measures**:
- **Schema Validation**: All inputs validated against Zod schemas
- **Timeout Protection**: 180-second operation timeout
- **Memory Limits**: Configurable response size limits
- **Localhost Only**: Restricted to localhost connections
- **Error Sanitization**: Secure error message handling

### Isolation and Sandboxing
- **Process Isolation**: Separate processes for MCP server and Blender
- **Network Isolation**: Localhost-only communication
- **Resource Limits**: CPU and memory usage constraints
- **Permission Boundaries**: Minimal Blender API permissions

## Performance Architecture

### Connection Management
- **Persistent Connections**: Reused TCP sockets
- **Connection Pooling**: Multiple concurrent operations
- **Timeout Optimization**: Adaptive timeout based on operation type
- **Resource Cleanup**: Automatic connection cleanup

### Memory Management
- **Chunked Processing**: Large responses processed in chunks
- **Garbage Collection**: Optimized object lifecycle management
- **Memory Limits**: Configurable memory usage caps
- **Streaming**: Large data streamed when possible

### Caching Strategy
- **Response Caching**: Cached responses for repeated operations
- **Schema Caching**: Pre-compiled validation schemas
- **Connection Caching**: Reused socket connections
- **Metadata Caching**: Scene and object metadata

## Scalability Architecture

### Horizontal Scaling Potential
- **Multi-Instance Support**: Multiple MCP server instances
- **Load Balancing**: Request distribution across instances
- **Cluster Communication**: Inter-instance coordination
- **State Synchronization**: Shared state management

### Vertical Scaling Optimization
- **Async Processing**: Non-blocking operations
- **Resource Optimization**: Efficient CPU and memory usage
- **Batch Operations**: Grouped operation processing
- **Parallel Execution**: Concurrent 3D operations

## Integration Points

### MCP Protocol Integration
- **Tool Registration**: Dynamic tool discovery
- **Capability Advertising**: Feature capability reporting
- **Version Negotiation**: Protocol version handling
- **Error Reporting**: Standardized error communication

### Blender API Integration
- **bpy Module**: Direct Blender Python API access
- **Context Management**: Blender context handling
- **Operator Execution**: Blender operator invocation
- **Data Access**: Scene and object data retrieval

### External System Integration
- **File System**: Asset and file management
- **Network Services**: External API connectivity
- **Database Integration**: Scene data persistence
- **Cloud Services**: Remote rendering and storage

## Monitoring and Observability

### Logging Architecture
```
Application Logs → Structured Logging → Log Aggregation → Analysis Dashboard
                → Error Tracking      → Alerting System
                → Performance Metrics → Monitoring Tools
```

### Metrics Collection
- **Performance Metrics**: Response times, throughput
- **Error Metrics**: Error rates, types, patterns
- **Resource Metrics**: CPU, memory, network usage
- **Business Metrics**: Operation counts, success rates

### Health Monitoring
- **Connection Health**: Socket connectivity status
- **Process Health**: Server process monitoring
- **Resource Health**: System resource usage
- **Integration Health**: External service connectivity

## Development Architecture

### Code Organization
```
src/
├── types/          # TypeScript type definitions
├── utils/          # Utility modules (validation, formatting, socket)
├── constants.ts    # Configuration constants
├── index.ts        # Main entry point
└── server.ts       # MCP server implementation
```

### Build and Deployment
- **TypeScript Compilation**: Type-safe code generation
- **Bundle Generation**: Optimized distribution packages
- **Testing Integration**: Automated testing pipeline
- **Documentation Generation**: API documentation auto-generation

## Technology Stack

### Backend Technologies
- **Node.js**: Runtime environment
- **TypeScript**: Type-safe development
- **Express.js**: HTTP server framework
- **Zod**: Schema validation
- **MCP SDK**: Model Context Protocol implementation

### Communication Technologies
- **TCP Sockets**: Low-latency communication
- **JSON-RPC 2.0**: Remote procedure call protocol
- **HTTP/HTTPS**: Web server communication
- **WebSockets**: Real-time bidirectional communication

### Blender Integration
- **Python 3.x**: Blender scripting language
- **bpy API**: Blender Python API
- **Threading**: Concurrent operation handling
- **Socket Server**: TCP server implementation

## Future Architecture Considerations

### Phase 03 Enhancements
- **Plugin Architecture**: Extensible tool system
- **Batch Processing**: Bulk operation support
- **Advanced Validation**: Custom schema definitions
- **Performance Optimization**: Caching and optimization

### Long-term Vision
- **Microservices Architecture**: Distributed system components
- **Event-Driven Architecture**: Asynchronous event processing
- **Cloud Integration**: Remote rendering and storage
- **AI/ML Integration**: Intelligent operation suggestions

---

**Document Status**: Current and Complete
**Architecture Review**: Completed 2025-11-30
**Next Update**: Phase 03 Implementation Complete