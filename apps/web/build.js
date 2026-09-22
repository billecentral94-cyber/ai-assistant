#!/usr/bin/env node
/**
 * apps/web Build Script.
 * Locates local or parent Vite binary cross-platform, falling back to npx.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const isWin = process.platform === 'win32';
const binName = isWin ? 'vite.cmd' : 'vite';

const localVite = path.join(__dirname, 'node_modules', '.bin', binName);
const rootVite = path.join(__dirname, '..', '..', 'node_modules', '.bin', binName);

let buildCmd = '';

if (fs.existsSync(localVite)) {
  console.log('[Web Build] Using local vite:', localVite);
  buildCmd = `"${localVite}" build`;
} else if (fs.existsSync(rootVite)) {
  console.log('[Web Build] Using root monorepo vite:', rootVite);
  buildCmd = `"${rootVite}" build`;
} else {
  console.log('[Web Build] Using npx vite build fallback');
  buildCmd = 'npx vite build';
}

try {
  execSync(buildCmd, { stdio: 'inherit', cwd: __dirname });
} catch (e) {
  console.error('[Web Build] Build failed with primary command, attempting npx fallback...');
  execSync('npx vite build', { stdio: 'inherit', cwd: __dirname });
}
