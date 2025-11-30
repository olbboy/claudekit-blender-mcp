# Configuration Examples

Real-world configuration examples for different setups and scenarios.

## Table of Contents

- [Basic Configurations](#basic-configurations)
- [Node Version Managers](#node-version-managers)
- [Multiple MCP Servers](#multiple-mcp-servers)
- [Development Setups](#development-setups)
- [Production Setups](#production-setups)
- [Advanced Configurations](#advanced-configurations)

---

## Basic Configurations

### Global NPM Installation

**Scenario:** Installed via `npm install -g claudekit-blender-mcp`

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

**Pros:**
- Simple and clean
- Automatic updates via npm
- Works from any directory

**Cons:**
- Requires internet for first run
- Slightly slower startup

---

### System Node.js (Homebrew on macOS)

**Scenario:** Node.js installed via Homebrew

**Apple Silicon (M1/M2/M3):**
```json
{
  "mcpServers": {
    "blender": {
      "command": "/opt/homebrew/bin/node",
      "args": ["/Users/username/Projects/claudekit-blender-mcp/dist/index.js"]
    }
  }
}
```

**Intel Mac:**
```json
{
  "mcpServers": {
    "blender": {
      "command": "/usr/local/bin/node",
      "args": ["/Users/username/Projects/claudekit-blender-mcp/dist/index.js"]
    }
  }
}
```

**Pros:**
- Reliable, stable path
- Can use just `"node"` if in PATH
- No version manager complexity

---

## Node Version Managers

### fnm (Fast Node Manager) - macOS

**Find your Node path:**
```bash
realpath $(which node)
# Output: /Users/username/.local/share/fnm/node-versions/v20.19.5/installation/bin/node
```

**Configuration:**
```json
{
  "mcpServers": {
    "blender": {
      "command": "/Users/username/.local/share/fnm/node-versions/v20.19.5/installation/bin/node",
      "args": ["/Users/username/Projects/claudekit-blender-mcp/dist/index.js"]
    }
  }
}
```

**Important:** Use the REAL path from `realpath`, not the symlink from `which node`.

---

### fnm - Linux

**Find your Node path:**
```bash
realpath $(which node)
# Output: /home/username/.local/share/fnm/node-versions/v20.19.5/installation/bin/node
```

**Configuration:**
```json
{
  "mcpServers": {
    "blender": {
      "command": "/home/username/.local/share/fnm/node-versions/v20.19.5/installation/bin/node",
      "args": ["/home/username/Projects/claudekit-blender-mcp/dist/index.js"]
    }
  }
}
```

---

### nvm (Node Version Manager) - macOS/Linux

**Find your Node path:**
```bash
nvm which current
# Output: /Users/username/.nvm/versions/node/v20.19.5/bin/node
```

**Configuration:**
```json
{
  "mcpServers": {
    "blender": {
      "command": "/Users/username/.nvm/versions/node/v20.19.5/bin/node",
      "args": ["/Users/username/Projects/claudekit-blender-mcp/dist/index.js"]
    }
  }
}
```

---

### nvm-windows

**Find your Node path:**
```powershell
where node
# Output: C:\Users\username\AppData\Roaming\nvm\v20.19.5\node.exe
```

**Configuration:**
```json
{
  "mcpServers": {
    "blender": {
      "command": "C:\\Users\\username\\AppData\\Roaming\\nvm\\v20.19.5\\node.exe",
      "args": ["C:\\Users\\username\\Projects\\claudekit-blender-mcp\\dist\\index.js"]
    }
  }
}
```

**Note:** Use double backslashes `\\` in JSON strings.

---

### asdf - macOS/Linux

**Find your Node path:**
```bash
asdf which node
# Output: /Users/username/.asdf/installs/nodejs/20.19.5/bin/node
```

**Configuration:**
```json
{
  "mcpServers": {
    "blender": {
      "command": "/Users/username/.asdf/installs/nodejs/20.19.5/bin/node",
      "args": ["/Users/username/Projects/claudekit-blender-mcp/dist/index.js"]
    }
  }
}
```

---

## Multiple MCP Servers

### Blender + Filesystem + Git

```json
{
  "mcpServers": {
    "blender": {
      "command": "/opt/homebrew/bin/node",
      "args": ["/Users/username/Projects/claudekit-blender-mcp/dist/index.js"]
    },
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/Users/username/Documents"
      ]
    },
    "git": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-git"]
    }
  }
}
```

---

### Blender + Database + Web Search

```json
{
  "mcpServers": {
    "blender": {
      "command": "node",
      "args": ["/path/to/claudekit-blender-mcp/dist/index.js"]
    },
    "postgres": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-postgres",
        "postgresql://localhost/mydb"
      ]
    },
    "brave-search": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "env": {
        "BRAVE_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

---

## Development Setups

### Local Development with Auto-Rebuild

**Using tsx watch mode:**

```json
{
  "mcpServers": {
    "blender": {
      "command": "npx",
      "args": [
        "tsx",
        "watch",
        "/Users/username/Projects/claudekit-blender-mcp/src/index.ts"
      ]
    }
  }
}
```

**Pros:**
- Auto-reloads on code changes
- Faster development iteration
- No manual rebuild needed

**Cons:**
- Slower startup
- Not for production use
- Must restart Claude Desktop to reload

---

### Development with Debug Logging

```json
{
  "mcpServers": {
    "blender": {
      "command": "/opt/homebrew/bin/node",
      "args": ["/Users/username/Projects/claudekit-blender-mcp/dist/index.js"],
      "env": {
        "NODE_ENV": "development",
        "DEBUG": "true",
        "LOG_LEVEL": "debug"
      }
    }
  }
}
```

**Logs will show:**
- Detailed command execution
- WebSocket communication
- Error stack traces
- Performance metrics

---

### Multiple Blender Versions

**Setup for testing different Blender versions:**

```json
{
  "mcpServers": {
    "blender-3.6": {
      "command": "node",
      "args": ["/path/to/claudekit-blender-mcp/dist/index.js"],
      "env": {
        "BLENDER_PORT": "8765"
      }
    },
    "blender-4.0": {
      "command": "node",
      "args": ["/path/to/claudekit-blender-mcp/dist/index.js"],
      "env": {
        "BLENDER_PORT": "8766"
      }
    }
  }
}
```

**Configure addon in each Blender instance to use different ports.**

---

## Production Setups

### Stable Production Configuration

```json
{
  "mcpServers": {
    "blender": {
      "command": "/usr/local/bin/node",
      "args": ["/opt/claudekit-blender-mcp/dist/index.js"],
      "env": {
        "NODE_ENV": "production",
        "LOG_LEVEL": "error"
      }
    }
  }
}
```

**Features:**
- Minimal logging (errors only)
- Stable Node.js path
- Fixed installation location
- Production optimizations

---

### High-Performance Setup

```json
{
  "mcpServers": {
    "blender": {
      "command": "/usr/local/bin/node",
      "args": [
        "--max-old-space-size=4096",
        "/path/to/claudekit-blender-mcp/dist/index.js"
      ],
      "env": {
        "NODE_ENV": "production",
        "UV_THREADPOOL_SIZE": "8"
      }
    }
  }
}
```

**Optimizations:**
- Increased memory limit (4GB)
- More UV threads for I/O
- Better for large scenes

---

## Advanced Configurations

### Custom Environment Variables

```json
{
  "mcpServers": {
    "blender": {
      "command": "node",
      "args": ["/path/to/claudekit-blender-mcp/dist/index.js"],
      "env": {
        "BLENDER_HOST": "localhost",
        "BLENDER_PORT": "8765",
        "WEBSOCKET_TIMEOUT": "30000",
        "MAX_RETRIES": "3",
        "POLYHAVEN_API_KEY": "your-key-here",
        "ASSET_CACHE_DIR": "/Users/username/.cache/blender-assets"
      }
    }
  }
}
```

---

### Remote Blender Instance

**For connecting to Blender on another machine:**

```json
{
  "mcpServers": {
    "blender": {
      "command": "node",
      "args": ["/path/to/claudekit-blender-mcp/dist/index.js"],
      "env": {
        "BLENDER_HOST": "192.168.1.100",
        "BLENDER_PORT": "8765"
      }
    }
  }
}
```

**Requirements:**
- Blender machine must allow incoming connections
- Firewall rules must permit port 8765
- Network must be stable

---

### Multiple Projects

**Different project directories:**

```json
{
  "mcpServers": {
    "blender-project-a": {
      "command": "node",
      "args": ["/path/to/project-a/claudekit-blender-mcp/dist/index.js"],
      "env": {
        "BLENDER_PORT": "8765",
        "PROJECT_NAME": "ProjectA"
      }
    },
    "blender-project-b": {
      "command": "node",
      "args": ["/path/to/project-b/claudekit-blender-mcp/dist/index.js"],
      "env": {
        "BLENDER_PORT": "8766",
        "PROJECT_NAME": "ProjectB"
      }
    }
  }
}
```

---

## Platform-Specific Examples

### macOS with Homebrew Node

```json
{
  "mcpServers": {
    "blender": {
      "command": "/opt/homebrew/bin/node",
      "args": ["/Users/username/claudekit-blender-mcp/dist/index.js"]
    }
  }
}
```

---

### Windows with System Node

```json
{
  "mcpServers": {
    "blender": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": ["C:\\Users\\username\\claudekit-blender-mcp\\dist\\index.js"]
    }
  }
}
```

---

### Linux with System Node

```json
{
  "mcpServers": {
    "blender": {
      "command": "/usr/bin/node",
      "args": ["/home/username/claudekit-blender-mcp/dist/index.js"]
    }
  }
}
```

---

### Ubuntu with snap Blender

```json
{
  "mcpServers": {
    "blender": {
      "command": "/usr/bin/node",
      "args": ["/home/username/claudekit-blender-mcp/dist/index.js"],
      "env": {
        "BLENDER_PATH": "/snap/blender/current/blender"
      }
    }
  }
}
```

---

## Testing Configurations

### Test if Configuration Works

**Create test script:**

```bash
#!/bin/bash
# test-config.sh

echo "Testing MCP Configuration..."

# Test 1: Validate JSON
echo "1. Validating JSON syntax..."
python3 -m json.tool ~/Library/Application\ Support/Claude/claude_desktop_config.json > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "   ✅ JSON is valid"
else
  echo "   ❌ JSON syntax error"
  exit 1
fi

# Test 2: Check Node path
echo "2. Checking Node.js path..."
NODE_PATH=$(cat ~/Library/Application\ Support/Claude/claude_desktop_config.json | python3 -c "import sys, json; print(json.load(sys.stdin)['mcpServers']['blender']['command'])")
if [ -f "$NODE_PATH" ]; then
  echo "   ✅ Node.js found at $NODE_PATH"
else
  echo "   ❌ Node.js not found at $NODE_PATH"
  exit 1
fi

# Test 3: Check MCP server path
echo "3. Checking MCP server path..."
MCP_PATH=$(cat ~/Library/Application\ Support/Claude/claude_desktop_config.json | python3 -c "import sys, json; print(json.load(sys.stdin)['mcpServers']['blender']['args'][0])")
if [ -f "$MCP_PATH" ]; then
  echo "   ✅ MCP server found at $MCP_PATH"
else
  echo "   ❌ MCP server not found at $MCP_PATH"
  exit 1
fi

# Test 4: Test MCP server runs
echo "4. Testing MCP server..."
timeout 2 "$NODE_PATH" "$MCP_PATH" 2>&1 | grep -q "ClaudeKit Blender MCP"
if [ $? -eq 0 ] || [ $? -eq 124 ]; then  # 124 = timeout (expected)
  echo "   ✅ MCP server starts correctly"
else
  echo "   ❌ MCP server failed to start"
  exit 1
fi

echo ""
echo "✅ All tests passed!"
```

**Run:**
```bash
chmod +x test-config.sh
./test-config.sh
```

---

## Quick Reference

### Find Your Node Path

```bash
# macOS/Linux
which node
realpath $(which node)  # Use this for fnm
nvm which current       # Use this for nvm
asdf which node         # Use this for asdf

# Windows
where node
```

### Validate JSON

```bash
# macOS/Linux
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json | python3 -m json.tool

# Windows
Get-Content "$env:APPDATA\Claude\claude_desktop_config.json" | python -m json.tool
```

### Test MCP Server

```bash
# Test standalone
node /path/to/dist/index.js

# Should output:
# Starting ClaudeKit Blender MCP Server...
# Registered X tools
```

---

## Common Mistakes

### ❌ Wrong: Using relative paths

```json
{
  "mcpServers": {
    "blender": {
      "command": "node",
      "args": ["./dist/index.js"]
    }
  }
}
```

### ✅ Correct: Using absolute paths

```json
{
  "mcpServers": {
    "blender": {
      "command": "/usr/local/bin/node",
      "args": ["/Users/username/Projects/claudekit-blender-mcp/dist/index.js"]
    }
  }
}
```

---

### ❌ Wrong: Using fnm symlink

```json
{
  "mcpServers": {
    "blender": {
      "command": "/Users/username/.local/state/fnm_multishells/12345_6789/bin/node",
      "args": ["/path/to/dist/index.js"]
    }
  }
}
```

### ✅ Correct: Using real path

```json
{
  "mcpServers": {
    "blender": {
      "command": "/Users/username/.local/share/fnm/node-versions/v20.19.5/installation/bin/node",
      "args": ["/path/to/dist/index.js"]
    }
  }
}
```

---

### ❌ Wrong: Single backslashes in Windows

```json
{
  "mcpServers": {
    "blender": {
      "command": "C:\Program Files\nodejs\node.exe",
      "args": ["C:\Projects\dist\index.js"]
    }
  }
}
```

### ✅ Correct: Double backslashes or forward slashes

```json
{
  "mcpServers": {
    "blender": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": ["C:\\Projects\\dist\\index.js"]
    }
  }
}
```

Or use forward slashes:
```json
{
  "mcpServers": {
    "blender": {
      "command": "C:/Program Files/nodejs/node.exe",
      "args": ["C:/Projects/dist/index.js"]
    }
  }
}
```

---

## Need Help?

If your configuration isn't working:

1. **Validate JSON syntax** - Most common issue!
2. **Check paths are absolute** - No relative paths
3. **Test Node.js path** - Make sure file exists
4. **Test MCP server** - Run it standalone first
5. **Check Claude Desktop logs** - Look for specific errors
6. **See troubleshooting guide** - [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

---

**Configuration Examples Version:** 1.0.0  
**Last Updated:** 2024-11-30

