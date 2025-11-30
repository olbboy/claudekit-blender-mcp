# 🎨 ClaudeKit Blender MCP

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![Blender Version](https://img.shields.io/badge/blender-%3E%3D3.0-orange)](https://www.blender.org/)
[![Tests](https://img.shields.io/badge/tests-489%20passed-green)](https://github.com/yourusername/claudekit-blender-mcp/tests)

> **Control Blender 3D with AI through Claude Desktop** 🤖×🎨

Transform your 3D workflow with 26 professional tools that give Claude Desktop complete control over Blender. Create scenes, manage assets, render images, and automate workflows using natural language.

## ✨ Key Features

- **🎭 26 Professional Tools**: Complete Blender control
- **🌐 Asset Integration**: Poly Haven, Sketchfab, Hyper3D & more
- **🚀 Python Scripting**: Execute custom Blender automation
- **⚡ Real-time Feedback**: Live viewport updates and rendering
- **🛡️ Production Ready**: 489 tests, TypeScript strict mode

## 🚀 Quick Setup

```bash
# Install globally
npm install -g claudekit-blender-mcp

# Add to Claude Desktop config
{
  "mcpServers": {
    "blender": {
      "command": "npx",
      "args": ["-y", "claudekit-blender-mcp"]
    }
  }
}

# Install Blender addon, restart Claude Desktop, and start creating!
```

## 💫 Usage Examples

**Create a Scene:**
```
Create a red metallic cube
Add a glass sphere above it
Set up dramatic lighting
Render at 4K resolution
```

**Asset Integration:**
```
Search HDRI skies on Poly Haven
Download a sunset sky
Import a car model from Sketchfab
Apply realistic materials
```

**Python Automation:**
```
Write a script to generate 100 random crystals
Execute it and apply rainbow materials
Create an animation of them rotating
```

## 🛠️ Available Tools

### Core Blender (10 tools)
- Object creation, modification, deletion
- Scene management and camera control
- Materials, textures, and lighting
- Viewport screenshots and rendering
- Python script execution
- File import/export (12+ formats)

### Asset Integration (16 tools)
- **Poly Haven**: HDRIs, textures, models
- **Sketchfab**: Community 3D models
- **Hyper3D**: AI-powered assets
- **Hunyuan3D**: Advanced 3D generation
- File management and batch operations

## 📋 Requirements

- **Node.js** >= 18.0.0
- **Blender** >= 3.0
- **Claude Desktop** (latest)

## 📚 Documentation

- **Full Guide**: [Detailed documentation](docs/)
- **API Reference**: [Tool specifications](docs/api.md)
- **Troubleshooting**: [Common issues](docs/troubleshooting.md)

## 🤝 Contributing

1. Fork and clone
2. Create feature branch
3. Add tests (`npm test`)
4. Submit pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) file.

---

<p align="center">
  <strong>Made with ❤️ by ClaudeKit Team</strong><br>
  <em>AI-powered 3D creativity</em>
</p>