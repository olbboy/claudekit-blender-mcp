# Root Cause Analysis: Blender Addon Not Receiving Commands

**Date:** 2025-11-30
**Investigator:** Claude (Debugging Agent)
**Severity:** CRITICAL - Complete feature non-functionality
**Status:** Investigation Complete

---

## Executive Summary

**Issue:** MCP server tools cannot communicate with Blender addon - all commands fail except 4 basic operations.

**Root Cause:** Massive implementation gap between MCP server tools (26 tools) and Blender addon handlers (4 handlers). MCP sends commands Blender doesn't understand.

**Impact:** 22 of 26 advertised tools completely non-functional. Only asset integration tools work partially.

**Priority:** P0 - Core functionality broken

---

## Technical Analysis

### Communication Architecture

**Expected Flow:**
```
Claude Desktop → MCP Server (Node.js) → TCP Socket (port 9876) → Blender Addon (Python)
```

**Actual Implementation Status:**
- ✅ MCP Server startup: WORKING
- ✅ Socket connection: WORKING (TCP on localhost:9876)
- ✅ Message serialization: WORKING (JSON over TCP)
- ❌ Command handling: BROKEN (handler mismatch)

### Port Configuration Mismatch

**MCP Server Expects:**
- Host: `localhost`
- Port: `9876` (from `src/constants.ts`)

**Blender Addon Defaults:**
- Host: `localhost`
- Port: `9876` (from `BlenderMCPServer.__init__`)

✅ **Ports match - not the issue**

### Critical Gap: Command Handler Implementation

#### What MCP Server Sends (22+ commands):

**Core Blender Tools:**
1. `create_primitive` - ❌ NO HANDLER
2. `modify_object` - ❌ NO HANDLER
3. `delete_object` - ❌ NO HANDLER
4. `create_material` - ❌ NO HANDLER
5. `apply_material` - ❌ NO HANDLER
6. `set_material_property` - ❌ NO HANDLER
7. `get_screenshot` - ❌ NO HANDLER
8. `execute_blender_code` - ❌ WRONG NAME (addon expects `execute_code`)

**Asset Management Tools:**
9. `create_collection` - ❌ NO HANDLER
10. `add_to_collection` - ❌ NO HANDLER
11. `list_collections` - ❌ NO HANDLER
12. `organize_assets_by_type` - ❌ NO HANDLER

**File Operations:**
13. `get_project_directory` - ❌ NO HANDLER
14. `list_files` - ❌ NO HANDLER
15. `create_directory` - ❌ NO HANDLER

**Import/Export:**
16. `import_asset` - ❌ NO HANDLER
17. `export_asset` - ❌ NO HANDLER
18. `get_supported_formats` - ❌ NO HANDLER
19. `optimize_asset` - ❌ NO HANDLER

#### What Blender Addon Actually Handles (4 base + 12 optional):

**Base Handlers (always available):**
```python
handlers = {
    "get_scene_info": self.get_scene_info,              # ✅ WORKS
    "get_object_info": self.get_object_info,            # ✅ WORKS
    "get_viewport_screenshot": self.get_viewport_screenshot,  # ✅ WORKS
    "execute_code": self.execute_code,                  # ✅ WORKS
    "get_polyhaven_status": self.get_polyhaven_status,  # ✅ WORKS
    "get_hyper3d_status": self.get_hyper3d_status,      # ✅ WORKS
    "get_sketchfab_status": self.get_sketchfab_status,  # ✅ WORKS
    "get_hunyuan3d_status": self.get_hunyuan3d_status,  # ✅ WORKS
}
```

**Optional Handlers (require manual toggle in Blender UI):**
- Poly Haven (4 handlers): asset search/download
- Hyper3D Rodin (3 handlers): AI 3D generation
- Sketchfab (2 handlers): model search/download
- Hunyuan3D (3 handlers): AI 3D generation

**Total:** 4 base + up to 12 optional = 16 handlers max

**Missing:** 22+ core handlers for objects, materials, files, import/export

---

## Evidence from Codebase

### 1. MCP Tool Registration

**File:** `/src/tools/objects.ts` (lines 65-88)

```typescript
// MCP server registers tool 'blender_create_primitive'
server.registerTool('blender_create_primitive', ...)

// Tool handler sends command 'create_primitive' to Blender
const response = await client.sendCommand('create_primitive', params);
```

### 2. Socket Client Implementation

**File:** `/src/utils/socket-client.ts` (lines 55-95)

```typescript
async sendCommand(type: string, params?: Record<string, unknown>): Promise<BlenderSocketResponse> {
  // Builds message with 'type' field
  const message: BlenderSocketMessage = { type };
  if (params) message.params = params;

  // Sends JSON over TCP socket
  this.connection.write(JSON.stringify(message) + '\n');

  // Waits for response
  const responseStr = await this.receiveFullResponse(this.connection);
  return JSON.parse(responseStr) as BlenderSocketResponse;
}
```

✅ **Socket client works correctly**

### 3. Blender Addon Command Dispatcher

**File:** `/blender-addon/addon.py` (lines 196-265)

```python
def _execute_command_internal(self, command):
    cmd_type = command.get("type")
    params = command.get("params", {})

    # Only these handlers are defined:
    handlers = {
        "get_scene_info": self.get_scene_info,
        "get_object_info": self.get_object_info,
        "get_viewport_screenshot": self.get_viewport_screenshot,
        "execute_code": self.execute_code,
        # ... plus optional asset integration handlers
    }

    handler = handlers.get(cmd_type)
    if handler:
        result = handler(**params)
        return {"status": "success", "result": result}
    else:
        # THIS IS WHERE ALL 22+ COMMANDS FAIL
        return {"status": "error", "message": f"Unknown command type: {cmd_type}"}
```

❌ **When MCP sends `create_primitive`, Blender returns error: "Unknown command type: create_primitive"**

### 4. User Experience Impact

**User tries:** "Create a cube in Blender"

**What happens:**
1. Claude Desktop calls `blender_create_primitive` tool
2. MCP server sends `{"type": "create_primitive", "params": {...}}` via TCP
3. Blender addon receives message
4. Addon looks up `create_primitive` in handlers dict
5. **Not found** → returns `{"status": "error", "message": "Unknown command type: create_primitive"}`
6. MCP tool returns error to Claude
7. Claude tells user: "Error: Unknown command type: create_primitive"

---

## Architecture Mismatch Timeline

### Phase 1: Initial Design (assumed)
- README claims 26 tools
- MCP server implements 26 tools
- Assumption: Blender addon would implement matching handlers

### Phase 2: Partial Implementation
- Blender addon implemented only 4 base handlers + 12 optional
- 22+ handlers never implemented
- No validation that tools match handlers

### Phase 3: Current State
- Gap between advertised (26) and actual (4-16) functionality
- Users experience broken features
- No error detection during development

---

## Why This Wasn't Caught Earlier

1. **No Integration Tests:** No automated tests verify MCP tools → Blender handlers match
2. **Silent Failures:** Socket connection succeeds, hiding handler mismatch
3. **Incomplete Implementation:** Development stopped after asset integration
4. **Documentation vs Reality:** README lists features not yet implemented
5. **No Handler Registry Validation:** No check that registered tools have corresponding handlers

---

## Configuration Issues Analysis

### User Must Manually Start Server

**Current Flow:**
1. User installs addon in Blender
2. Addon registers but **server doesn't auto-start**
3. User must open Blender → View3D → Sidebar → BlenderMCP tab
4. User must click "Connect to MCP server" button
5. Only then does `BlenderMCPServer.start()` run

**Evidence:** Lines 2173-2189 in `addon.py`

```python
class BLENDERMCP_OT_StartServer(bpy.types.Operator):
    bl_idname = "blendermcp.start_server"
    bl_label = "Connect to Claude"

    def execute(self, context):
        # Server only starts when user clicks button
        bpy.types.blendermcp_server = BlenderMCPServer(port=scene.blendermcp_port)
        bpy.types.blendermcp_server.start()
        scene.blendermcp_server_running = True
        return {'FINISHED'}
```

❌ **Problem:** README says "addon automatically starts WebSocket server when Blender launches" (line 68) but this is FALSE. Server only starts on manual button click.

---

## Missing Implementation Details

### Commands Sent by MCP vs Handlers in Blender

| MCP Command | Blender Handler | Status | Impact |
|------------|----------------|--------|--------|
| `create_primitive` | None | ❌ MISSING | Cannot create objects |
| `modify_object` | None | ❌ MISSING | Cannot move/rotate/scale |
| `delete_object` | None | ❌ MISSING | Cannot delete objects |
| `create_material` | None | ❌ MISSING | Cannot create materials |
| `apply_material` | None | ❌ MISSING | Cannot apply materials |
| `set_material_property` | None | ❌ MISSING | Cannot edit materials |
| `get_screenshot` | `get_viewport_screenshot` | ⚠️ NAME MISMATCH | May work if name fixed |
| `execute_blender_code` | `execute_code` | ⚠️ NAME MISMATCH | Workaround available |
| `get_scene_info` | `get_scene_info` | ✅ WORKS | Scene info only |
| `get_object_info` | `get_object_info` | ✅ WORKS | Object query only |
| `create_collection` | None | ❌ MISSING | Cannot organize objects |
| `add_to_collection` | None | ❌ MISSING | Cannot organize objects |
| `list_collections` | None | ❌ MISSING | Cannot list collections |
| `organize_assets_by_type` | None | ❌ MISSING | No auto-organization |
| `get_project_directory` | None | ❌ MISSING | File ops broken |
| `list_files` | None | ❌ MISSING | File ops broken |
| `create_directory` | None | ❌ MISSING | File ops broken |
| `import_asset` | None | ❌ MISSING | Cannot import files |
| `export_asset` | None | ❌ MISSING | Cannot export files |
| `get_supported_formats` | None | ❌ MISSING | No format info |
| `optimize_asset` | None | ❌ MISSING | No optimization |

**Summary:**
- ✅ Working: 2 commands (get_scene_info, get_object_info)
- ⚠️ Name mismatch: 2 commands (fixable)
- ❌ Missing: 22+ commands (requires implementation)

---

## Specific Code Issues

### Issue 1: Command Name Inconsistency

**MCP sends:** `execute_blender_code`
**Blender expects:** `execute_code`

**Location:**
- MCP: `/src/tools/scripting.ts` line 19
- Blender: `/blender-addon/addon.py` line 210

**Fix Required:** Rename in one or both locations for consistency

### Issue 2: Screenshot Command Mismatch

**MCP sends:** `get_screenshot`
**Blender expects:** `get_viewport_screenshot`

**Location:**
- MCP: `/src/tools/viewport.ts` line 68
- Blender: `/blender-addon/addon.py` line 209

**Fix Required:** Rename for consistency

### Issue 3: Missing Object Manipulation Handlers

**Required handlers not implemented:**
```python
# These methods don't exist in addon.py:
def create_primitive(self, primitive_type, name=None, location=None, scale=None)
def modify_object(self, object_name, location=None, rotation=None, scale=None)
def delete_object(self, object_name)
```

**Impact:** Core Blender operations (create, modify, delete) completely non-functional

### Issue 4: Missing Material System Handlers

**Required handlers not implemented:**
```python
# These methods don't exist in addon.py:
def create_material(self, name, material_type)
def apply_material(self, object_name, material_name)
def set_material_property(self, material_name, property_name, value)
```

**Impact:** Cannot work with materials/textures via MCP

### Issue 5: Missing File System Handlers

**Required handlers not implemented:**
```python
# These methods don't exist in addon.py:
def get_project_directory(self)
def list_files(self, directory, pattern=None)
def create_directory(self, path)
def import_asset(self, filepath, import_type)
def export_asset(self, object_name, filepath, format)
def get_supported_formats(self)
def optimize_asset(self, object_name, target_polycount)
```

**Impact:** All file operations broken

### Issue 6: Missing Collection Management Handlers

**Required handlers not implemented:**
```python
# These methods don't exist in addon.py:
def create_collection(self, name)
def add_to_collection(self, object_name, collection_name)
def list_collections(self)
def organize_assets_by_type(self)
```

**Impact:** Cannot organize objects into collections

---

## Configuration Problems

### Problem 1: Server Auto-Start Not Implemented

**README claims (line 68):**
> "The addon will automatically start the WebSocket server when Blender launches."

**Reality:**
- Server does NOT auto-start
- User must manually click "Connect to MCP server" button
- No auto-start code in `register()` function

**Evidence:** Lines 2210-2336 in `addon.py` - no server start in `register()`

### Problem 2: Default Port Not Documented in UI

**Issue:**
- MCP expects port 9876
- Blender addon defaults to 9876
- But user can change port in Blender UI
- If changed, MCP cannot connect
- No warning or validation

### Problem 3: Socket Protocol Mismatch in Documentation

**README says:** "WebSocket server on ws://localhost:8765" (line 229)

**Reality:**
- Blender uses TCP socket, NOT WebSocket
- Port is 9876, NOT 8765
- No WebSocket protocol implementation

**Evidence:** Lines 54-59 in `addon.py`
```python
self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)  # TCP, not WS
self.socket.bind((self.host, self.port))  # Port 9876 by default
```

---

## Unresolved Questions

1. **Why was development stopped?** 22 handlers missing - was this intentional or incomplete?

2. **Testing strategy?** No evidence of integration tests. How was this supposed to be validated?

3. **Workaround viability?** Can `execute_code` handler be used to implement all missing functionality by sending Python scripts instead of structured commands?

4. **Migration path?** Should handlers be added to Blender addon, or should MCP tools be reduced to match available handlers?

5. **Documentation accuracy?** README claims features that don't exist. Is this roadmap or current state?

6. **Auto-start feasibility?** Can Blender addon auto-start server on registration, or does Blender API prevent this?

7. **Version mismatch?** Is there an older/newer version of the Blender addon that has these handlers?

---

## Recommendations

### Immediate (P0 - Critical)

1. **Update README:** Remove or clearly mark features as "planned/not implemented"
2. **Fix command name mismatches:** Align `execute_code`/`execute_blender_code` and `get_screenshot`/`get_viewport_screenshot`
3. **Add server auto-start:** Implement auto-start in `register()` function or document manual start requirement clearly

### Short-term (P1 - High)

4. **Implement core handlers:** Add `create_primitive`, `modify_object`, `delete_object` to Blender addon
5. **Implement material handlers:** Add `create_material`, `apply_material`, `set_material_property`
6. **Add integration tests:** Verify each MCP tool has corresponding Blender handler

### Long-term (P2 - Medium)

7. **Implement file handlers:** Add all file system operations
8. **Implement collection handlers:** Add collection management
9. **Add validation:** MCP server should validate Blender addon version/capabilities on connection
10. **Error messaging:** Better error messages when handler missing ("Handler 'X' not implemented in Blender addon v1.2")

### Alternative Approach (P3 - Low Priority)

11. **Use execute_code as universal handler:** Instead of implementing 22 handlers, generate Python scripts dynamically and use `execute_code` handler
12. **Reduce MCP tools:** Remove tools that have no handlers, keep only working ones

---

## Testing Recommendations

### Validation Tests Needed

```python
# Test: Verify all registered MCP tools have Blender handlers
def test_mcp_blender_handler_parity():
    mcp_tools = get_registered_tools()
    blender_handlers = get_blender_handlers()

    for tool in mcp_tools:
        command_type = tool.command_type
        assert command_type in blender_handlers, f"Missing handler: {command_type}"
```

### Manual Test Plan

1. **Start Blender** → Install addon → Enable addon
2. **Click "Connect to MCP server"** → Verify console shows "BlenderMCP server started on localhost:9876"
3. **Start MCP server** → Verify connection successful
4. **Test each tool:**
   - `get_scene_info` → Should work ✅
   - `create_primitive` → Should fail with "Unknown command type" ❌
   - `execute_blender_code` → Should fail (name mismatch) ⚠️
5. **Fix command name** → Change to `execute_code` → Retry → Should work ✅

---

## Conclusion

**Root Cause:** Incomplete implementation. MCP server has 26 tools but Blender addon has only 4-16 handlers.

**Why commands not received:** They ARE received, but Blender rejects them with "Unknown command type" because handlers don't exist.

**Fix complexity:** HIGH - requires implementing 22+ Python methods in Blender addon.

**Workaround available:** YES - use `execute_code` handler (after fixing name mismatch) to send Python scripts instead of structured commands.

**Critical path:**
1. Fix `execute_code` name mismatch
2. Use Python scripts for missing functionality
3. Gradually implement proper handlers for better UX

---

**Report End**
