# claudekit-blender-mcp

Model Context Protocol server for Blender 3D integration with ClaudeKit enhancements.

## Installation

```bash
npm install -g claudekit-blender-mcp
```

## Quick Start

1. Install Blender addon from `blender-addon/addon.py`
2. Configure Claude Desktop:
   ```json
   {
     "mcpServers": {
       "blender": {
         "command": "npx",
         "args": ["claudekit-blender-mcp"]
       }
     }
   }
   ```
3. Start Blender with addon enabled
4. Use Claude Desktop to control Blender

## Tools Available

(Will be documented in Phase 5)

## License

MIT