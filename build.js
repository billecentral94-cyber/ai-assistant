#!/usr/bin/env node
/**
 * Root Build Script for Vercel & Production Deployments.
 * Ensures dependencies are installed in apps/web, builds with Vite,
 * and synchronizes output to both ./dist and ./apps/web/dist.
 * Also generates static route HTML entrypoints to guarantee zero 404s on any static CDN host.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('[Vercel Build] Starting unified build for Artha AI Copilot...');

const rootDir = __dirname;
const webDir = path.join(rootDir, 'apps', 'web');

// 1. Ensure apps/web has node_modules
const webNodeModules = path.join(webDir, 'node_modules');
if (!fs.existsSync(webNodeModules)) {
  console.log('[Vercel Build] Installing dependencies in apps/web...');
  execSync('npm install --prefer-offline --no-audit', { cwd: webDir, stdio: 'inherit' });
}

// 2. Run web build
console.log('[Vercel Build] Building web application with Vite...');
execSync('npm run build', { cwd: webDir, stdio: 'inherit' });

// 3. Sync output to root ./dist so Vercel finds it regardless of project root setting
const webDist = path.join(webDir, 'dist');
const rootDist = path.join(rootDir, 'dist');

if (fs.existsSync(webDist)) {
  console.log('[Vercel Build] Syncing build output from apps/web/dist to ./dist...');
  if (!fs.existsSync(rootDist)) {
    fs.mkdirSync(rootDist, { recursive: true });
  }
  fs.cpSync(webDist, rootDist, { recursive: true });
  console.log('[Vercel Build] Output successfully available at ./dist and ./apps/web/dist');
} else {
  console.error('[Vercel Build] ERROR: Output directory apps/web/dist was not found!');
  process.exit(1);
}

// 4. Generate static route fallback files to eliminate 404s on Vercel / static edge servers
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

for (const dir of [webDist, rootDist]) {
  const indexHtmlPath = path.join(dir, 'index.html');
  if (fs.existsSync(indexHtmlPath)) {
    const indexHtml = fs.readFileSync(indexHtmlPath, 'utf-8');
    for (const route of clientRoutes) {
      // Create subfolder /route/index.html
      const routeDir = path.join(dir, route);
      if (!fs.existsSync(routeDir)) {
        fs.mkdirSync(routeDir, { recursive: true });
      }
      fs.writeFileSync(path.join(routeDir, 'index.html'), indexHtml, 'utf-8');

      // Create /route.html for cleanUrls / static resolution
      fs.writeFileSync(path.join(dir, `${route}.html`), indexHtml, 'utf-8');
    }
  }
}
console.log('[Vercel Build] Pre-rendered static entrypoints for all client routes (portfolio, fno, etc.)');

console.log('[Vercel Build] Build finished successfully!');
