# Troubleshooting Guide

Complete troubleshooting guide for claudekit-blender-mcp integration with Claude Desktop.

## Table of Contents

- [Common Issues](#common-issues)
- [Configuration Problems](#configuration-problems)
- [Connection Issues](#connection-issues)
- [Node.js & Path Issues](#nodejs--path-issues)
- [Blender Addon Issues](#blender-addon-issues)
- [Performance Issues](#performance-issues)
- [Debug Mode](#debug-mode)

---

## Common Issues

### 1. Error: `spawn node ENOENT`

**Full Error Message:**
```
[blender] [error] spawn node ENOENT
Error: spawn node ENOENT
    at ChildProcess._handle.onexit (node:internal/child_process:285:19)
```

**Cause:**
Claude Desktop cannot find the `node` command because:
- You're using a Node version manager (fnm, nvm, asdf)
- Claude Desktop runs with its own PATH environment
- The PATH doesn't include your Node.js location

**Solution:**

#### Step 1: Find your Node.js path

```bash
# For fnm users
which node
# Output: /Users/username/.local/state/fnm_multishells/12345_6789/bin/node

# Get the real path (not symlink):
realpath $(which node)
# Output: /Users/username/.local/share/fnm/node-versions/v20.19.5/installation/bin/node

# For nvm users
nvm which current
# Output: /Users/username/.nvm/versions/node/v20.19.5/bin/node

# For asdf users
asdf which node
# Output: /Users/username/.asdf/installs/nodejs/20.19.5/bin/node
```

#### Step 2: Update Claude Desktop config

**macOS config location:**
```bash
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Updated config:**
```json
{
  "mcpServers": {
    "blender": {
      "command": "/Users/username/.local/share/fnm/node-versions/v20.19.5/installation/bin/node",
      "args": ["/absolute/path/to/claudekit-blender-mcp/dist/index.js"]
    }
  }
}
```

#### Step 3: Restart Claude Desktop

```bash
# macOS
killall "Claude" && sleep 2 && open -a "Claude"

# Windows
# Close completely from system tray, then reopen

# Linux
killall claude && claude
```

---

### 2. MCP Server Not Appearing in Claude Desktop

**Symptoms:**
- Claude Desktop starts but doesn't show Blender tools
- No error messages in UI
- Tools list is empty

**Solutions:**

#### Check Configuration File

```bash
# macOS - View config
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Validate JSON syntax
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json | python3 -m json.tool
```

**Common JSON errors:**
```json
// ❌ Wrong: Missing comma
{
  "mcpServers": {
    "blender": {
      "command": "node"
      "args": ["dist/index.js"]  // Missing comma above!
    }
  }
}

// ❌ Wrong: Trailing comma
{
  "mcpServers": {
    "blender": {
      "command": "node",
      "args": ["dist/index.js"],  // Trailing comma!
    }
  }
}

// ✅ Correct
{
  "mcpServers": {
    "blender": {
      "command": "node",
      "args": ["dist/index.js"]
    }
  }
}
```

#### Check Claude Desktop Logs

```bash
# macOS
tail -f ~/Library/Logs/Claude/mcp*.log

# Windows
type %APPDATA%\Claude\logs\mcp-server-blender.log

# Linux
tail -f ~/.config/Claude/logs/mcp*.log
```

#### Verify MCP Server Works Standalone

```bash
cd /path/to/claudekit-blender-mcp

# Test the server directly
node dist/index.js

# Expected output:
# Starting ClaudeKit Blender MCP Server...
# Registered 10 core Blender tools
# Registered 16 asset integration tools
# ClaudeKit Blender MCP Server running on stdio transport
```

If you see errors here, it means the issue is with the MCP server itself, not the configuration.

---

### 3. Blender Connection Timeout

**Symptoms:**
- MCP server starts but cannot connect to Blender
- Error: "Failed to connect to Blender WebSocket"
- Tools appear but commands fail

**Solutions:**

#### Check Blender Addon Status

1. Open Blender
2. Go to **Edit → Preferences → Add-ons**
3. Search for "MCP"
4. Ensure the checkbox next to "Blender MCP Server" is checked

#### Check Blender Console

**macOS/Linux:**
- Blender → Window → Toggle System Console

**Windows:**
- Blender → Window → Toggle System Console
- Or check: Window → Console Window

**Expected console output:**
```
Blender MCP Server addon loaded
Starting WebSocket server on ws://localhost:8765
Server started successfully
```

**Error messages to look for:**
```
# Port already in use
OSError: [Errno 48] Address already in use

# Solution: Change port in addon.py or kill process using port 8765
lsof -ti:8765 | xargs kill -9

# Permission denied
PermissionError: [Errno 13] Permission denied

# Solution: Run Blender with appropriate permissions
```

#### Test WebSocket Connection

```bash
# Install wscat if not available
npm install -g wscat

# Test connection
wscat -c ws://localhost:8765

# Should connect successfully
# Try sending: {"type": "ping"}
```

#### Check Firewall

**macOS:**
```bash
# Check if firewall is blocking
/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate

# Allow Blender if needed
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add /Applications/Blender.app
```

**Windows:**
- Windows Defender Firewall → Allow an app
- Add Blender if not listed
- Ensure "Private" network is checked

---

### 4. Module Not Found Errors

**Error:**
```
Error: Cannot find module '@modelcontextprotocol/sdk'
```

**Solution:**

```bash
cd /path/to/claudekit-blender-mcp

# Remove old dependencies
rm -rf node_modules package-lock.json

# Reinstall
npm install

# Rebuild
npm run build

# Verify dist/ folder exists
ls -la dist/

# Update Claude Desktop config if needed
# Then restart Claude Desktop
```

---

### 5. Commands Execute But Nothing Happens in Blender

**Symptoms:**
- Claude Desktop shows success messages
- But Blender scene doesn't change
- No errors in logs

**Solutions:**

#### Check Object Names

```python
# In Blender Python Console (Shift+F4)
import bpy
print([obj.name for obj in bpy.data.objects])
```

Make sure the object names match what you're trying to modify.

#### Check Active Scene

```python
# Verify active scene
import bpy
print(bpy.context.scene.name)
print(bpy.context.view_layer.objects.active)
```

#### Enable Blender's System Console

See real-time output of commands:
- **Window → Toggle System Console** (macOS/Windows)
- This shows Python execution output and errors

---

## Configuration Problems

### Finding Configuration File

**macOS:**
```bash
open ~/Library/Application\ Support/Claude/
# File: claude_desktop_config.json
```

**Windows:**
```powershell
explorer %APPDATA%\Claude
# File: claude_desktop_config.json
```

**Linux:**
```bash
xdg-open ~/.config/Claude/
# File: claude_desktop_config.json
```

### Creating Config File If Missing

```bash
# macOS
mkdir -p ~/Library/Application\ Support/Claude
cat > ~/Library/Application\ Support/Claude/claude_desktop_config.json << 'EOF'
{
  "mcpServers": {
    "blender": {
      "command": "/path/to/node",
      "args": ["/path/to/claudekit-blender-mcp/dist/index.js"]
    }
  }
}
EOF

# Then edit paths to match your system
```

### Multiple MCP Servers

If you have multiple MCP servers:

```json
{
  "mcpServers": {
    "blender": {
      "command": "/usr/local/bin/node",
      "args": ["/path/to/claudekit-blender-mcp/dist/index.js"]
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/username/Documents"]
    }
  }
}
```

### Environment Variables

Add environment variables if needed:

```json
{
  "mcpServers": {
    "blender": {
      "command": "/usr/local/bin/node",
      "args": ["/path/to/claudekit-blender-mcp/dist/index.js"],
      "env": {
        "NODE_ENV": "development",
        "DEBUG": "true",
        "BLENDER_PORT": "8765"
      }
    }
  }
}
```

---

## Connection Issues

### WebSocket Connection Failed

**Symptoms:**
- MCP server starts
- But shows "Failed to connect to Blender"

**Checklist:**

1. **Is Blender running?**
   ```bash
   # Check if Blender is running
   ps aux | grep -i blender
   ```

2. **Is addon enabled?**
   - Preferences → Add-ons → Search "MCP" → Check enabled

3. **Is WebSocket server running?**
   - Check Blender console for "Server started on ws://localhost:8765"

4. **Port already in use?**
   ```bash
   # Check what's using port 8765
   lsof -i :8765
   
   # Kill if needed
   lsof -ti:8765 | xargs kill -9
   ```

5. **Test direct connection:**
   ```bash
   # Install wscat
   npm install -g wscat
   
   # Connect
   wscat -c ws://localhost:8765
   
   # Should see: Connected
   ```

### Intermittent Disconnections

**Symptoms:**
- Connection works initially
- But drops after a few minutes
- Need to restart Blender frequently

**Solutions:**

1. **Increase WebSocket timeout** (modify addon.py):
   ```python
   # In blender-addon/addon.py
   # Find the WebSocket handler and add:
   ping_interval = 30  # Send ping every 30 seconds
   ping_timeout = 10   # Wait 10 seconds for pong
   ```

2. **Check system sleep settings:**
   - macOS: System Preferences → Energy Saver → Prevent sleep
   - Windows: Power Options → Never sleep when plugged in

3. **Disable VPN or Proxy:**
   - Some VPNs interfere with localhost connections
   - Try disabling temporarily

---

## Node.js & Path Issues

### Different Node Version Managers

#### fnm (Fast Node Manager)

```bash
# Find Node path
which node
# /Users/username/.local/state/fnm_multishells/12345_6789/bin/node

# Get real path
realpath $(which node)
# /Users/username/.local/share/fnm/node-versions/v20.19.5/installation/bin/node

# Use the REAL path in config
```

#### nvm (Node Version Manager)

```bash
# Find current Node
nvm which current
# /Users/username/.nvm/versions/node/v20.19.5/bin/node

# Use this path in config
```

#### asdf

```bash
# Find Node path
asdf which node
# /Users/username/.asdf/installs/nodejs/20.19.5/bin/node

# Use this path in config
```

#### System Node (Homebrew, apt, etc.)

```bash
# Find Node
which node
# /usr/local/bin/node  (Homebrew on Intel Mac)
# /opt/homebrew/bin/node  (Homebrew on Apple Silicon)
# /usr/bin/node  (Linux apt/yum)

# Can use 'node' directly if in system PATH
```

### Switching Node Versions

If you switch Node versions:

```bash
# 1. Find new Node path
which node

# 2. Update Claude Desktop config with new path

# 3. Rebuild project
cd /path/to/claudekit-blender-mcp
npm install
npm run build

# 4. Restart Claude Desktop
```

---

## Blender Addon Issues

### Addon Not Showing Up

**Solutions:**

1. **Check Blender version:**
   ```python
   # In Blender Python console
   import bpy
   print(bpy.app.version)
   # Should be >= (3, 0, 0)
   ```

2. **Check addon file location:**
   - Should be in Blender's scripts/addons folder
   - Or installed via "Install from file"

3. **Check for Python errors:**
   - Window → Toggle System Console
   - Look for Python tracebacks

4. **Reinstall addon:**
   ```bash
   # Remove old addon
   # Blender → Preferences → Add-ons → Find "MCP" → Remove
   
   # Reinstall
   # Install → Select blender-addon/addon.py → Enable
   ```

### Addon Crashes Blender

**Symptoms:**
- Blender crashes when enabling addon
- Blender becomes unresponsive

**Solutions:**

1. **Start Blender with debug mode:**
   ```bash
   # macOS
   /Applications/Blender.app/Contents/MacOS/Blender --debug
   
   # Linux
   blender --debug
   
   # Windows
   "C:\Program Files\Blender Foundation\Blender\blender.exe" --debug
   ```

2. **Check addon dependencies:**
   - The addon uses only built-in Python libraries
   - No external dependencies should be needed

3. **Try with fresh Blender preferences:**
   ```bash
   # Backup current preferences
   cp -r ~/Library/Application\ Support/Blender ~/.blender_backup
   
   # Start with factory settings
   # Blender → File → Defaults → Load Factory Settings
   
   # Try enabling addon again
   ```

---

## Performance Issues

### Slow Command Execution

**Symptoms:**
- Commands take 5+ seconds to execute
- Blender UI freezes during operations

**Solutions:**

1. **Simplify scene:**
   - Remove unused objects
   - Reduce polygon count
   - Disable modifiers temporarily

2. **Check Blender performance:**
   ```python
   # In Blender Python console
   import bpy
   print(f"Objects: {len(bpy.data.objects)}")
   print(f"Meshes: {len(bpy.data.meshes)}")
   print(f"Materials: {len(bpy.data.materials)}")
   ```

3. **Optimize WebSocket communication:**
   - Reduce screenshot resolution
   - Use batch operations when possible

### High Memory Usage

**Solutions:**

1. **Check Blender memory:**
   ```python
   import bpy
   # Window → Toggle System Console
   # Check memory usage at top
   ```

2. **Purge unused data:**
   ```python
   import bpy
   # Remove unused data blocks
   bpy.ops.outliner.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
   ```

---

## Debug Mode

### Enable Detailed Logging

#### MCP Server Debug

```json
{
  "mcpServers": {
    "blender": {
      "command": "/path/to/node",
      "args": ["/path/to/claudekit-blender-mcp/dist/index.js"],
      "env": {
        "DEBUG": "true",
        "NODE_ENV": "development"
      }
    }
  }
}
```

#### Blender Debug

```bash
# Start Blender with full debug output
blender --debug --debug-python --debug-handlers --python-console
```

#### View All Logs

```bash
# macOS
tail -f ~/Library/Logs/Claude/mcp*.log

# Watch for changes
watch -n 1 'ls -lht ~/Library/Logs/Claude/ | head -20'
```

### Test MCP Server Manually

```bash
cd /path/to/claudekit-blender-mcp

# Run with debug output
NODE_ENV=development node dist/index.js

# In another terminal, send test messages:
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node dist/index.js
```

---

## Getting Help

If none of these solutions work:

### 1. Gather Information

```bash
# System info
uname -a  # OS version

# Node version
node --version

# Blender version
# Open Blender → Help → About Blender

# Check config
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Recent logs
tail -100 ~/Library/Logs/Claude/mcp*.log > ~/Desktop/claude-mcp-logs.txt
```

### 2. Create Issue on GitHub

Include:
- OS and version
- Node.js version
- Blender version
- Claude Desktop version
- Config file (remove sensitive data)
- Full error logs
- Steps to reproduce

### 3. Community Support

- GitHub Discussions
- MCP Documentation: https://modelcontextprotocol.io
- Blender Forums

---

## Quick Diagnostic Script

Save this as `diagnose.sh` and run it:

```bash
#!/bin/bash
echo "=== System Information ==="
uname -a
echo ""

echo "=== Node.js ==="
which node
node --version || echo "Node not found!"
echo ""

echo "=== Claude Desktop Config ==="
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json 2>/dev/null || echo "Config not found!"
echo ""

echo "=== MCP Server Test ==="
if [ -f "/path/to/claudekit-blender-mcp/dist/index.js" ]; then
  timeout 2 node /path/to/claudekit-blender-mcp/dist/index.js || echo "Server started but timed out (normal)"
else
  echo "MCP server not found at expected path"
fi
echo ""

echo "=== Port 8765 Check ==="
lsof -i :8765 || echo "Port 8765 is free"
echo ""

echo "=== Recent Claude Logs ==="
tail -20 ~/Library/Logs/Claude/mcp*.log 2>/dev/null || echo "No logs found"
```

Run it:
```bash
chmod +x diagnose.sh
./diagnose.sh > ~/Desktop/diagnostic-report.txt
```

---

**Last Updated:** 2024-11-30
**Version:** 1.0.0

