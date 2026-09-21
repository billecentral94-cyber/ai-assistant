const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Building Vite Web Application...');
execSync('npx vite build apps/web --outDir apps/web/dist', { stdio: 'inherit' });

console.log('📦 Syncing dist to root directory for Vercel...');
const webDist = path.resolve(__dirname, 'apps/web/dist');
const rootDist = path.resolve(__dirname, 'dist');

fs.mkdirSync(rootDist, { recursive: true });
fs.cpSync(webDist, rootDist, { recursive: true });

console.log('✅ Build completed successfully!');
