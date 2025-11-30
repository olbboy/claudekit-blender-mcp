# Installation Guide

Complete step-by-step installation guide for claudekit-blender-mcp on all platforms.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation Methods](#installation-methods)
- [Platform-Specific Setup](#platform-specific-setup)
  - [macOS](#macos)
  - [Windows](#windows)
  - [Linux](#linux)
- [Blender Addon Installation](#blender-addon-installation)
- [Claude Desktop Configuration](#claude-desktop-configuration)
- [Verification](#verification)
- [Next Steps](#next-steps)

---

## Prerequisites

### Required Software

1. **Node.js** (>= 18.0.0)
   - Download: https://nodejs.org/
   - Or use version manager (fnm, nvm, asdf)

2. **Blender** (>= 3.0)
   - Download: https://www.blender.org/download/
   - Tested with Blender 3.6, 4.0, 4.1

3. **Claude Desktop** (Latest version)
   - Download: https://claude.ai/download

### Check Existing Installation

```bash
# Check Node.js
node --version  # Should output v18.x.x or higher

# Check npm
npm --version   # Should output 9.x.x or higher
```

---

## Installation Methods

### Method 1: NPM Global Installation (Recommended for End Users)

**Pros:**
- Simple, one-command installation
- Automatic updates via npm
- Works from any directory

**Cons:**
- Cannot modify source code
- Must republish to npm for updates

```bash
# Install globally
npm install -g claudekit-blender-mcp

# Verify installation
claudekit-blender-mcp --version

# Update later
npm update -g claudekit-blender-mcp
```

### Method 2: Local Development (Recommended for Developers)

**Pros:**
- Can modify source code
- Immediate testing of changes
- Full control over features

**Cons:**
- Requires manual builds
- More setup steps

```bash
# Clone repository
git clone https://github.com/yourusername/claudekit-blender-mcp.git
cd claudekit-blender-mcp

# Install dependencies
npm install

# Build project
npm run build

# Verify build
ls -la dist/
```

### Method 3: NPX (Temporary Usage)

**Pros:**
- No installation required
- Always uses latest version
- Good for testing

**Cons:**
- Downloads every time
- Slower startup

```bash
# Use directly without installing
npx claudekit-blender-mcp
```

---

## Platform-Specific Setup

### macOS

#### 1. Install Node.js

**Option A: Official Installer**
```bash
# Download from nodejs.org
# Or using Homebrew:
brew install node@20

# Verify
node --version
```

**Option B: Using fnm (Fast Node Manager)**
```bash
# Install fnm
brew install fnm

# Setup fnm in shell (~/.zshrc or ~/.bashrc)
eval "$(fnm env --use-on-cd)"

# Install Node.js
fnm install 20
fnm use 20

# Verify
node --version
```

**Option C: Using nvm**
```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Reload shell
source ~/.zshrc  # or ~/.bashrc

# Install Node.js
nvm install 20
nvm use 20

# Verify
node --version
```

#### 2. Install Blender

```bash
# Download from blender.org
# Or using Homebrew:
brew install --cask blender

# Verify
/Applications/Blender.app/Contents/MacOS/Blender --version
```

#### 3. Install Claude Desktop

```bash
# Download from claude.ai/download
# Or using Homebrew:
brew install --cask claude

# Config location:
# ~/Library/Application Support/Claude/claude_desktop_config.json
```

#### 4. Find Node.js Path (Important for fnm/nvm users)

```bash
# For fnm users - Get REAL path (not symlink)
which node
# Shows: /Users/username/.local/state/fnm_multishells/12345_6789/bin/node

realpath $(which node)
# Shows: /Users/username/.local/share/fnm/node-versions/v20.19.5/installation/bin/node
# ☝️ USE THIS PATH IN CONFIG

# For nvm users
nvm which current
# Shows: /Users/username/.nvm/versions/node/v20.19.5/bin/node
# ☝️ USE THIS PATH

# For Homebrew users (Apple Silicon)
which node
# Shows: /opt/homebrew/bin/node
# ☝️ CAN USE 'node' DIRECTLY

# For Homebrew users (Intel)
which node
# Shows: /usr/local/bin/node
# ☝️ CAN USE 'node' DIRECTLY
```

---

### Windows

#### 1. Install Node.js

**Option A: Official Installer**
```powershell
# Download from nodejs.org
# Run installer: node-v20.x.x-x64.msi
# Check "Add to PATH" option

# Verify in Command Prompt or PowerShell
node --version
```

**Option B: Using nvm-windows**
```powershell
# Download nvm-windows from:
# https://github.com/coreybutler/nvm-windows/releases

# Install latest Node.js
nvm install latest
nvm use latest

# Verify
node --version
```

**Option C: Using Chocolatey**
```powershell
# Install Chocolatey first (https://chocolatey.org/)
# Then install Node.js:
choco install nodejs-lts

# Verify
node --version
```

#### 2. Install Blender

```powershell
# Download from blender.org
# Run installer: blender-4.x.x-windows-x64.msi

# Or using Chocolatey:
choco install blender

# Verify
"C:\Program Files\Blender Foundation\Blender\blender.exe" --version
```

#### 3. Install Claude Desktop

```powershell
# Download from claude.ai/download
# Run installer: Claude-Setup.exe

# Config location:
# %APPDATA%\Claude\claude_desktop_config.json
# Full path: C:\Users\YourName\AppData\Roaming\Claude\claude_desktop_config.json
```

#### 4. Find Node.js Path

```powershell
# For nvm-windows users
nvm list
# Shows installed versions

where node
# Shows: C:\Program Files\nodejs\node.exe
# Or: C:\Users\YourName\AppData\Roaming\nvm\v20.19.5\node.exe

# For standard installation
where node
# Shows: C:\Program Files\nodejs\node.exe
```

---

### Linux

#### 1. Install Node.js

**Ubuntu/Debian:**
```bash
# Using NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
node --version
```

**Fedora/RHEL/CentOS:**
```bash
# Using NodeSource repository
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs

# Verify
node --version
```

**Arch Linux:**
```bash
sudo pacman -S nodejs npm

# Verify
node --version
```

**Using fnm (Universal):**
```bash
# Install fnm
curl -fsSL https://fnm.vercel.app/install | bash

# Setup in shell (~/.bashrc or ~/.zshrc)
eval "$(fnm env --use-on-cd)"

# Install Node.js
fnm install 20
fnm use 20

# Verify
node --version
```

#### 2. Install Blender

**Ubuntu/Debian:**
```bash
# Official PPA
sudo add-apt-repository ppa:thomas-schiex/blender
sudo apt update
sudo apt install blender

# Or download from blender.org
```

**Fedora:**
```bash
sudo dnf install blender
```

**Arch Linux:**
```bash
sudo pacman -S blender
```

**Snap (Universal):**
```bash
sudo snap install blender --classic
```

#### 3. Install Claude Desktop

```bash
# Download from claude.ai/download
# Usually a .deb or .AppImage

# For .deb (Ubuntu/Debian):
sudo dpkg -i claude-desktop_*.deb
sudo apt-get install -f  # Fix dependencies

# For AppImage:
chmod +x Claude-*.AppImage
./Claude-*.AppImage

# Config location:
# ~/.config/Claude/claude_desktop_config.json
```

#### 4. Find Node.js Path

```bash
# Standard installation
which node
# Shows: /usr/bin/node

# fnm installation
which node
realpath $(which node)
# Shows: /home/username/.local/share/fnm/node-versions/v20.19.5/installation/bin/node

# nvm installation
nvm which current
# Shows: /home/username/.nvm/versions/node/v20.19.5/bin/node
```

---

## Blender Addon Installation

### Step 1: Locate Addon File

The addon file is located at:
```
claudekit-blender-mcp/blender-addon/addon.py
```

### Step 2: Install in Blender

#### Method A: Install from File (Recommended)

1. Open Blender
2. Go to **Edit → Preferences** (or **Blender → Preferences** on macOS)
3. Click **Add-ons** tab
4. Click **Install...** button (top right)
5. Navigate to `blender-addon/addon.py`
6. Click **Install Add-on**
7. Find "Blender MCP Server" in the list
8. **Check the checkbox** to enable it

#### Method B: Manual Installation

**macOS:**
```bash
cp blender-addon/addon.py ~/Library/Application\ Support/Blender/4.1/scripts/addons/blender_mcp_server.py
```

**Windows:**
```powershell
copy blender-addon\addon.py %APPDATA%\Blender Foundation\Blender\4.1\scripts\addons\blender_mcp_server.py
```

**Linux:**
```bash
cp blender-addon/addon.py ~/.config/blender/4.1/scripts/addons/blender_mcp_server.py
```

Then enable in Blender Preferences → Add-ons.

### Step 3: Verify Addon is Running

1. Open Blender
2. Go to **Window → Toggle System Console** (if available on your OS)
3. Look for output:
   ```
   Blender MCP Server addon loaded
   Starting WebSocket server on ws://localhost:8765
   Server started successfully
   ```

If you see these messages, the addon is working correctly!

---

## Claude Desktop Configuration

### Step 1: Find Configuration File

**macOS:**
```bash
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Windows:**
```
%APPDATA%\Claude\claude_desktop_config.json
C:\Users\YourName\AppData\Roaming\Claude\claude_desktop_config.json
```

**Linux:**
```bash
~/.config/Claude/claude_desktop_config.json
```

### Step 2: Create/Edit Configuration

#### For Global NPM Installation

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

#### For Local Development (macOS with fnm)

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

#### For Local Development (Windows)

```json
{
  "mcpServers": {
    "blender": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": ["C:\\Users\\YourName\\Projects\\claudekit-blender-mcp\\dist\\index.js"]
    }
  }
}
```

#### For Local Development (Linux)

```json
{
  "mcpServers": {
    "blender": {
      "command": "/usr/bin/node",
      "args": ["/home/username/Projects/claudekit-blender-mcp/dist/index.js"]
    }
  }
}
```

### Step 3: Validate Configuration

**macOS/Linux:**
```bash
# Validate JSON syntax
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json | python3 -m json.tool

# Or
cat ~/.config/Claude/claude_desktop_config.json | python3 -m json.tool
```

**Windows:**
```powershell
# Validate JSON syntax
Get-Content "$env:APPDATA\Claude\claude_desktop_config.json" | python -m json.tool
```

If there's a JSON syntax error, it will show where the problem is.

### Step 4: Restart Claude Desktop

**macOS:**
```bash
# Completely quit Claude Desktop (Cmd+Q)
killall "Claude"
# Wait 2 seconds
sleep 2
# Reopen
open -a "Claude"
```

**Windows:**
```powershell
# Close Claude Desktop from system tray
# Ensure it's completely closed (check Task Manager)
# Then reopen from Start Menu
```

**Linux:**
```bash
# Kill Claude process
killall claude
# Wait a moment
sleep 2
# Reopen
claude &
```

---

## Verification

### Step 1: Check MCP Server is Loaded

Open Claude Desktop and type:
```
What MCP tools do you have?
```

You should see "blender" listed as an available MCP server.

### Step 2: List Blender Tools

```
List all Blender tools
```

Expected output: 26 tools including:
- blender_create_object
- blender_list_objects
- blender_execute_python
- polyhaven_search_assets
- And more...

### Step 3: Test Basic Command

With Blender open:
```
Create a cube in Blender
```

You should see:
1. Success message in Claude Desktop
2. A cube appears in Blender
3. Output in Blender console (if enabled)

### Step 4: Verify WebSocket Connection

```
Get Blender scene info
```

If this works, the WebSocket connection is functioning correctly.

---

## Troubleshooting Installation

### Node.js Not Found

```bash
# macOS/Linux
echo $PATH
# Should include Node.js bin directory

# Add to ~/.zshrc or ~/.bashrc if missing:
export PATH="/usr/local/bin:$PATH"

# For fnm:
eval "$(fnm env --use-on-cd)"

# For nvm:
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
```

### Permission Errors (Linux/macOS)

```bash
# Fix npm permissions
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'

# Add to ~/.profile or ~/.zshrc:
export PATH=~/.npm-global/bin:$PATH

# Reload shell
source ~/.profile
```

### Blender Addon Not Loading

1. Check Blender version: Must be >= 3.0
2. Check Python version in Blender:
   ```python
   import sys
   print(sys.version)  # Should be Python 3.10+
   ```
3. Check for errors in Blender Console
4. Try reinstalling addon

### Claude Desktop Config Not Working

1. Validate JSON syntax
2. Use absolute paths (not relative)
3. Use forward slashes `/` or escaped backslashes `\\` in Windows
4. Ensure Node.js path is correct
5. Check Claude Desktop logs

---

## Next Steps

After successful installation:

1. **Read the documentation:**
   - [README.md](../README.md) - Overview and quick start
   - [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Common issues
   - [project-overview-pdr.md](project-overview-pdr.md) - Architecture

2. **Try example workflows:**
   - Create basic objects
   - Import assets from Poly Haven
   - Take viewport screenshots
   - Execute Python scripts

3. **Explore advanced features:**
   - Material creation
   - Batch operations
   - Custom scripting
   - Asset management

4. **Join the community:**
   - GitHub Discussions
   - Report bugs
   - Request features
   - Contribute code

---

## Updating

### Global Installation

```bash
npm update -g claudekit-blender-mcp
```

### Local Development

```bash
cd /path/to/claudekit-blender-mcp
git pull origin main
npm install
npm run build
# Restart Claude Desktop
```

### Blender Addon

1. Disable old addon in Blender
2. Restart Blender
3. Install new addon.py file
4. Enable addon

---

## Uninstallation

### Remove Global Package

```bash
npm uninstall -g claudekit-blender-mcp
```

### Remove Local Development

```bash
rm -rf /path/to/claudekit-blender-mcp
```

### Remove Blender Addon

1. Blender → Edit → Preferences → Add-ons
2. Find "Blender MCP Server"
3. Click Remove button

### Remove Claude Desktop Config

**macOS:**
```bash
# Edit file and remove "blender" section:
nano ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

**Windows:**
```powershell
# Edit file and remove "blender" section:
notepad %APPDATA%\Claude\claude_desktop_config.json
```

**Linux:**
```bash
# Edit file and remove "blender" section:
nano ~/.config/Claude/claude_desktop_config.json
```

---

## Support

If you encounter issues during installation:

1. **Check troubleshooting guide:** [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
2. **Review logs:** Look at Claude Desktop logs
3. **Create an issue:** GitHub Issues with:
   - OS and version
   - Node.js version
   - Blender version
   - Error messages
   - Steps to reproduce

---

**Installation Guide Version:** 1.0.0  
**Last Updated:** 2024-11-30  
**Compatible with:** Node.js 18+, Blender 3.0+, Claude Desktop Latest

