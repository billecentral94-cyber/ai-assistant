const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting Artha AI Web Build...');
const rootDir = __dirname;
const webDir = path.resolve(rootDir, 'apps/web');
const webDist = path.resolve(webDir, 'dist');
const rootDist = path.resolve(rootDir, 'dist');

// Run vite build inside apps/web
console.log(`📁 Building in ${webDir}...`);
execSync('npx vite build', { cwd: webDir, stdio: 'inherit' });

// Copy dist to root ./dist so Vercel finds dist regardless of root settings
console.log('📦 Copying compiled dist to root...');
fs.mkdirSync(rootDist, { recursive: true });
if (fs.existsSync(webDist)) {
  fs.cpSync(webDist, rootDist, { recursive: true });
}

console.log('✅ Build succeeded! Production dist folders synchronized.');
