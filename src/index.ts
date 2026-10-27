#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runServer, createStykAnimateServer } from './server.js';

export * from './types/stykanimate.js';
export * from './engine/document.js';
export * from './engine/rig.js';
export * from './engine/motion.js';
export * from './engine/legacy.js';
export * from './engine/export.js';
export * from './engine/renderer.js';
export * from './engine/scene.js';
export { createStykAnimateServer, runServer };

// Start stdio MCP server only when executed directly as CLI
function isDirectExecution(): boolean {
  if (!process.argv[1]) return false;
  try {
    const currentFilePath = fileURLToPath(import.meta.url);
    const executedFilePath = path.resolve(process.argv[1]);
    return currentFilePath === executedFilePath;
  } catch {
    return false;
  }
}

if (isDirectExecution()) {
  runServer().catch((error) => {
    process.stderr.write(`[stykanimate-mcp] Fatal error: ${(error as Error).message}\n`);
    process.exit(1);
  });
}
