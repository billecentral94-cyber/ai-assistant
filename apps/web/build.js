#!/usr/bin/env node
/**
 * apps/web Build Script.
 * Locates local or parent Vite binary cross-platform, falling back to npx.
 * Also generates static route entrypoints (portfolio/index.html, etc.) for zero 404s.
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

// Generate static route fallback files inside apps/web/dist
const distDir = path.join(__dirname, 'dist');
const clientRoutes = [
  'portfolio',
  'fno',
  'watchlist',
  'copilot-trading',
  'ai-chat',
  'backtesting',
  'news',
  'sandbox'
];

if (fs.existsSync(distDir)) {
  const indexHtmlPath = path.join(distDir, 'index.html');
  if (fs.existsSync(indexHtmlPath)) {
    const indexHtml = fs.readFileSync(indexHtmlPath, 'utf-8');
    for (const route of clientRoutes) {
      const routeDir = path.join(distDir, route);
      if (!fs.existsSync(routeDir)) {
        fs.mkdirSync(routeDir, { recursive: true });
      }
      fs.writeFileSync(path.join(routeDir, 'index.html'), indexHtml, 'utf-8');
      fs.writeFileSync(path.join(distDir, `${route}.html`), indexHtml, 'utf-8');
    }
    console.log('[Web Build] Pre-rendered static entrypoints in apps/web/dist for all routes');
  }
}
