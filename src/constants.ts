export const BLENDER_HOST = process.env.BLENDER_HOST || 'localhost';
export const BLENDER_PORT = parseInt(process.env.BLENDER_PORT || '9876', 10);
export const SOCKET_TIMEOUT = 180000; // 180 seconds
export const CHARACTER_LIMIT = 25000; // Max response size
export const MAX_SCREENSHOT_SIZE = 800; // Max viewport screenshot dimension

// External API base URLs
export const POLYHAVEN_API = 'https://api.polyhaven.com';
export const SKETCHFAB_API = 'https://api.sketchfab.com/v3';
export const HYPER3D_API = 'https://hyper3d.ai/api';