import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSceneTools } from './scene.js';
import { registerObjectTools } from './objects.js';
import { registerMaterialTools } from './materials.js';
import { registerViewportTools } from './viewport.js';
import { registerScriptingTools } from './scripting.js';
import { registerAssetTools } from './assets.js';
import { registerFileTools } from './files.js';
import { registerImportExportTools } from './import-export.js';
import { registerExternalSourceTools } from './external-sources.js';

export function registerCoreTools(server: McpServer) {
  registerSceneTools(server);
  registerObjectTools(server);
  registerMaterialTools(server);
  registerViewportTools(server);
  registerScriptingTools(server);

  console.error('Registered 10 core Blender tools');
}

export function registerAssetIntegrationTools(server: McpServer) {
  registerAssetTools(server);
  registerFileTools(server);
  registerImportExportTools(server);
  registerExternalSourceTools(server);

  console.error('Registered 16 asset integration tools');
}