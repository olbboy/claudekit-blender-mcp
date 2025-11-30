# 🎨 ClaudeKit Blender MCP

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![Blender Version](https://img.shields.io/badge/blender-%3E%3D3.0-orange)](https://www.blender.org/)
[![Tests](https://img.shields.io/badge/tests-489%20passed-green)](tests/)

> **Transform your 3D workflow with AI-powered Blender automation through Claude Desktop**

ClaudeKit Blender MCP is a cutting-edge Model Context Protocol server that bridges Claude Desktop with Blender 3D, offering unprecedented control over your 3D creative workflow through natural language commands.

## ✨ Features

### 🎭 **Complete Blender Control**
- **26 Professional Tools**: Comprehensive manipulation of every Blender aspect
- **Object Management**: Create, modify, transform, and organize 3D objects
- **Scene Control**: Manage scenes, cameras, lighting, and rendering
- **Material System**: Full material and texture editing capabilities
- **Viewport Operations**: Screenshots, camera controls, and visual feedback

### 🌐 **Asset Integration Ecosystem**
- **Poly Haven**: Direct access to professional HDRIs, textures, and models
- **Sketchfab**: Browse and import high-quality 3D models
- **Hyper3D & Hunyuan3D**: Next-generation AI-powered 3D assets
- **Universal Import/Export**: Support for 12+ file formats (FBX, OBJ, GLTF, STL, etc.)

### 🚀 **Advanced Features**
- **Python Scripting**: Execute custom Blender scripts directly
- **Batch Operations**: Process multiple objects simultaneously
- **Real-time Feedback**: Live viewport updates and rendering status
- **Smart Error Handling**: Comprehensive error recovery and validation
- **Performance Optimized**: Built-in caching and rate limiting

## 🎯 Quick Start

### Prerequisites
- **Node.js** >= 18.0.0
- **Blender** >= 3.0
- **Claude Desktop** (latest version)

### Installation

#### Option 1: Global Install (Recommended)
```bash
npm install -g claudekit-blender-mcp
```

#### Option 2: Local Development
```bash
git clone https://github.com/yourusername/claudekit-blender-mcp.git
cd claudekit-blender-mcp
npm install && npm run build
```

### Setup in 3 Minutes

**1. Install Blender Addon**
```
Blender → Edit → Preferences → Add-ons → Install... → blender-addon/addon.py
Enable "Blender MCP Server"
```

**2. Configure Claude Desktop**
Add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "blender": {
      "command": "npx",
      "args": ["-y", "claudekit-blender-mcp"]
    }
  }
}
```

**3. Restart Claude Desktop** completely and start creating!

## 🎨 Usage Examples

### Basic 3D Scene Creation
```
Create a cube at position (0, 0, 0)
Add a sphere 3 units above the cube
Create a camera pointing at both objects
Add a sun light to illuminate the scene
Take a screenshot of the viewport
```

### Material Design
```
Create a metallic red material
Apply it to the cube
Make the sphere look like glass with transparency
Add a rough wooden texture to the floor
```

### Asset Integration
```
Search for HDRI sky on Poly Haven
Download the first cloudy sky result
Set it as the world environment texture
Import a car model from Sketchfab
Scale it to fit the scene
```

### Advanced Workflows
```
Create a Python script to generate 100 random cubes
Execute the script and spread them across the scene
Create a gold material and apply to all cubes
Render the scene at 4K resolution
Save the final image
```

## 🛠️ Available Tools

### Core Blender Operations (10 tools)
- `blender_execute_python` - Execute custom Python scripts
- `blender_create_object` - Create primitives and custom objects
- `blender_modify_object` - Transform and edit object properties
- `blender_delete_object` - Remove objects from scene
- `blender_list_objects` - Get comprehensive scene inventory
- `blender_get_scene_info` - Detailed scene statistics
- `blender_render_scene` - Render images and animations
- `blender_take_screenshot` - Capture viewport and render views
- `blender_save_file` - Save .blend project files
- `blender_import_file` - Import external 3D files

### Asset Integration (16 tools)
- **Poly Haven**: Search, info, download HDRIs/textures/models
- **Sketchfab**: Browse and import community models
- **Hyper3D**: AI-powered 3D asset generation
- **Hunyuan3D**: Advanced AI 3D creation tools
- **File Management**: Directory operations, file handling
- **Import/Export**: 12+ format support with custom options

## 🔧 Configuration

### Environment Variables
```bash
# Blender Connection
BLENDER_HOST=localhost
BLENDER_PORT=9876

# Optional API Keys for premium features
POLYHAVEN_API_KEY=your_key_here
SKETCHFAB_API_TOKEN=your_token_here
HYPER3D_API_KEY=your_key_here
```

### Advanced Configuration
```json
{
  "mcpServers": {
    "blender": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/claudekit-blender-mcp/dist/index.js"],
      "env": {
        "BLENDER_HOST": "localhost",
        "BLENDER_PORT": "9876"
      }
    }
  }
}
```

## 🐛 Troubleshooting

### Common Issues

**"spawn node ENOENT"**
```bash
# Find your Node.js path
which node
realpath $(which node)  # Get actual path for nvm/fnm users
```

**MCP Server Not Connecting**
```bash
# Check Claude Desktop logs
# macOS: ~/Library/Logs/Claude/mcp*.log
# Windows: %APPDATA%\Claude\logs\
# Linux: ~/.config/Claude/logs/mcp*.log
```

**Blender Addon Issues**
```
1. Blender → Window → Toggle System Console
2. Look for: "BlenderMCP server started on localhost:9876"
3. Check addon is enabled in Preferences → Add-ons
```

### Test Your Setup
```
Open Claude Desktop and try:
"What MCP tools do you have available?"
"List all Blender tools"
"Create a cube in Blender"
```

## 🏗️ Development

### Project Structure
```
claudekit-blender-mcp/
├── src/
│   ├── tools/          # 10 specialized tool modules
│   ├── utils/          # Utilities (logging, cache, etc.)
│   ├── types/          # TypeScript definitions
│   └── server.ts       # MCP server setup
├── tests/              # 489 comprehensive tests
├── blender-addon/      # Blender Python addon
└── docs/               # Detailed documentation
```

### Development Workflow
```bash
# Development mode with hot reload
npm run dev

# Run tests
npm test

# Build for production
npm run build

# Test coverage
npm run test:coverage
```

## 📊 Quality Metrics

- **Tests**: 489 passing tests with 100% success rate
- **TypeScript**: Full strict mode with comprehensive type safety
- **Performance**: Optimized caching and connection pooling
- **Security**: Input validation, path traversal protection
- **Error Handling**: Comprehensive error recovery system

## 🤝 Contributing

We welcome contributions! Please:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-tool`
3. Add tests for new functionality
4. Ensure all tests pass: `npm test`
5. Submit a pull request

## 📜 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Model Context Protocol](https://modelcontextprotocol.io)
- Powered by [Blender](https://www.blender.org)
- Assets from [Poly Haven](https://polyhaven.com)
- Integration with [Sketchfab](https://sketchfab.com)

## 📚 Support

- 📖 **Documentation**: Check the `/docs` folder for detailed guides
- 🐛 **Issues**: [Report bugs on GitHub](https://github.com/yourusername/claudekit-blender-mcp/issues)
- 💬 **Community**: Join discussions in GitHub Discussions

---

<p align="center">
  <strong>Made with ❤️ by the ClaudeKit Team</strong>
</p>

<p align="center">
  <em>Transform your 3D creativity with the power of AI</em>
</p>