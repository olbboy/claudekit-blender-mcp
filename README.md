<p align="center">
  <img src="assets/logos/logo.svg" alt="ClaudeKit Blender MCP Logo" width="280">
</p>

<h1 align="center">ClaudeKit Blender MCP</h1>

<p align="center">
  Model Context Protocol server for Blender 3D integration with ClaudeKit enhancements.
</p>

## Features

- 🎨 **26 Blender Tools**: Complete control over Blender from Claude Desktop
- 🎭 **Object Management**: Create, modify, transform objects
- 🎬 **Scene Control**: Manage scenes, cameras, lighting
- 📦 **Asset Integration**: Import from Poly Haven, Sketchfab, and more
- 🖼️ **Viewport Control**: Take screenshots, render scenes
- 🔧 **Material & Texture Management**: Full material editing capabilities
- 📝 **Python Scripting**: Execute custom Blender scripts

## Installation

### Option 1: Global Installation (Production Use)

```bash
npm install -g claudekit-blender-mcp
```

### Option 2: Local Development

```bash
# Clone the repository
git clone https://github.com/yourusername/claudekit-blender-mcp.git
cd claudekit-blender-mcp

# Install dependencies
npm install

# Build the project
npm run build
```

## Configuration

### Step 1: Install Blender Addon

1. Open Blender
2. Go to **Edit → Preferences → Add-ons**
3. Click **Install...** button
4. Navigate to and select: `blender-addon/addon.py`
5. Enable the addon by checking the box next to **"Blender MCP Server"**

The addon will automatically start the WebSocket server when Blender launches.

### Step 2: Configure Claude Desktop

The configuration file location varies by OS:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

#### Configuration for Global Installation

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

#### Configuration for Local Development

**If using Node Version Manager (fnm, nvm, asdf):**

```json
{
  "mcpServers": {
    "blender": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/claudekit-blender-mcp/dist/index.js"]
    }
  }
}
```

Find your Node.js path:
```bash
# For fnm users
which node  # Then use realpath or readlink to get actual path

# For nvm users
nvm which current

# Example paths:
# fnm: /Users/username/.local/share/fnm/node-versions/v20.19.5/installation/bin/node
# nvm: /Users/username/.nvm/versions/node/v20.19.5/bin/node
```

**If Node.js is in system PATH:**

```json
{
  "mcpServers": {
    "blender": {
      "command": "node",
      "args": ["/absolute/path/to/claudekit-blender-mcp/dist/index.js"]
    }
  }
}
```

### Step 3: Restart Claude Desktop

**Important:** You must completely restart Claude Desktop (not just reload):

```bash
# macOS
killall "Claude" && sleep 2 && open -a "Claude"

# Windows
# Close Claude Desktop completely from system tray, then reopen

# Linux
killall claude && claude
```

## Verification

### Test the Connection

Open Claude Desktop and try these commands:

```
What MCP tools do you have available?
List all Blender tools
Create a cube in Blender
```

### Expected Output

You should see 26 tools available:

**Core Blender Tools (10):**
- `blender_execute_python`: Execute Python code in Blender
- `blender_create_object`: Create objects (cube, sphere, etc.)
- `blender_list_objects`: List all objects in scene
- `blender_modify_object`: Modify object properties
- `blender_delete_object`: Delete objects
- `blender_get_scene_info`: Get scene information
- `blender_render_scene`: Render the current scene
- `blender_save_file`: Save .blend file
- `blender_take_screenshot`: Capture viewport
- `blender_import_file`: Import 3D files

**Asset Integration Tools (16):**
- `polyhaven_search_assets`: Search Poly Haven library
- `polyhaven_get_asset_info`: Get asset details
- `polyhaven_download_asset`: Download assets
- And more...

## Troubleshooting

### Error: `spawn node ENOENT`

**Problem:** Claude Desktop cannot find the `node` command.

**Solution:** Use absolute path to Node.js in your config.

```bash
# Find your Node.js path
which node
realpath $(which node)  # Get the actual path if using fnm/nvm

# Update config with absolute path
# Example:
{
  "mcpServers": {
    "blender": {
      "command": "/Users/username/.local/share/fnm/node-versions/v20.19.5/installation/bin/node",
      "args": ["/path/to/project/dist/index.js"]
    }
  }
}
```

**Why this happens:**
- Claude Desktop runs with its own PATH environment
- Node version managers (fnm, nvm, asdf) modify shell PATH
- Claude Desktop's PATH doesn't include these custom paths
- Solution: Use absolute path to bypass PATH lookup

### MCP Server Not Connecting

**1. Check Claude Desktop logs:**

```bash
# macOS
tail -f ~/Library/Logs/Claude/mcp*.log

# Windows
# Check: %APPDATA%\Claude\logs\

# Linux
tail -f ~/.config/Claude/logs/mcp*.log
```

**2. Verify Blender addon is running:**
- Open Blender → Window → Toggle System Console
- Look for: "Blender MCP Server started on ws://localhost:8765"

**3. Test MCP server manually:**

```bash
# For local development
cd /path/to/claudekit-blender-mcp
node dist/index.js

# Should see:
# Starting ClaudeKit Blender MCP Server...
# Registered 10 core Blender tools
# Registered 16 asset integration tools
```

### JSON Configuration Errors

**Validate your config file:**

```bash
# macOS/Linux
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json | python3 -m json.tool

# Should output formatted JSON without errors
```

**Common mistakes:**
- Missing commas between entries
- Trailing commas at end of objects/arrays
- Incorrect quote types (use `"` not `'`)
- Missing closing brackets

### Blender Connection Timeout

**Check Blender addon status:**
1. Blender → Edit → Preferences → Add-ons
2. Search for "MCP"
3. Ensure checkbox is checked
4. Check console for errors

**Firewall issues:**
- Ensure localhost connections are allowed
- Default port: 8765
- Protocol: WebSocket (ws://)

### Module Not Found Errors

**For local development:**

```bash
cd /path/to/claudekit-blender-mcp
npm install  # Reinstall dependencies
npm run build  # Rebuild
```

**Check Node.js version:**
```bash
node --version  # Should be >= 18.0.0
```

## Development

### Project Structure

```
claudekit-blender-mcp/
├── src/
│   ├── server.ts          # MCP server setup
│   ├── tools/             # Tool implementations
│   │   ├── objects.ts     # Object manipulation
│   │   ├── scene.ts       # Scene management
│   │   ├── materials.ts   # Material system
│   │   ├── assets.ts      # Asset integration
│   │   └── ...
│   └── utils/             # Utilities
├── dist/                  # Compiled JavaScript
├── blender-addon/
│   └── addon.py          # Blender addon
└── docs/                 # Documentation
```

### Development Workflow

```bash
# Watch mode (auto-rebuild on changes)
npm run dev

# Build once
npm run build

# Clean build
npm run clean && npm run build

# After making changes:
# 1. Rebuild: npm run build
# 2. Restart Claude Desktop
# 3. Test changes
```

### Running Tests

```bash
# Run all tests (coming soon)
npm test

# Test specific tool
npm test -- objects
```

## Available Tools

### Core Blender Operations

- **Object Management**: Create, modify, delete, transform objects
- **Scene Control**: Manage scenes, cameras, lighting
- **Viewport**: Take screenshots, change view angles
- **Rendering**: Render images and animations
- **File I/O**: Import/export various 3D formats

### Asset Integration

- **Poly Haven**: Search and download HDRIs, textures, models
- **Sketchfab**: Browse and import models
- **External Sources**: Custom asset sources

### Advanced Features

- **Material Editing**: Create and modify materials
- **Texture Management**: Apply and manage textures
- **Python Scripting**: Execute custom Blender scripts
- **Batch Operations**: Process multiple objects

## Requirements

- **Node.js**: >= 18.0.0
- **Blender**: >= 3.0 (tested with 3.6+)
- **Claude Desktop**: Latest version
- **OS**: macOS, Windows, or Linux

## Tips for End Users

### Best Practices

1. **Always start Blender before using Claude Desktop**
2. **Keep Blender console open** to see real-time feedback
3. **Save your work frequently** - use "save the Blender file"
4. **Use descriptive names** for objects to make them easy to reference
5. **Start with simple commands** to verify connection

### Example Workflows

**Creating a scene:**
```
1. "Create a cube in Blender"
2. "Add a sphere 5 units above the cube"
3. "Create a camera looking at the objects"
4. "Add a sun light to the scene"
5. "Take a screenshot of the viewport"
```

**Working with materials:**
```
1. "Create a red metallic material"
2. "Apply it to the cube"
3. "Make the sphere glass-like"
```

**Asset integration:**
```
1. "Search for HDRI sky on Poly Haven"
2. "Download the first result"
3. "Set it as environment texture"
```

## Support

### Getting Help

- **Documentation**: Check `/docs` folder for detailed guides
- **Issues**: Report bugs on GitHub Issues
- **Logs**: Always check Claude Desktop logs first

### Reporting Bugs

Include:
1. Claude Desktop version
2. Node.js version (`node --version`)
3. Blender version
4. OS and version
5. Config file content (remove sensitive data)
6. Error logs from Claude Desktop
7. Blender console output

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - See LICENSE file for details

## Acknowledgments

- Built with [Model Context Protocol](https://modelcontextprotocol.io)
- Integrates with [Poly Haven](https://polyhaven.com)
- Powered by [Blender](https://www.blender.org)

---

**Made with ❤️ by ClaudeKit Team**