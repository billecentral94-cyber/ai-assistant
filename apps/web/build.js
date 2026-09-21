#!/usr/bin/env node
// Build script that forces local vite to be used
const { execSync } = require('child_process');
const path = require('path');

const viteBin = path.join(__dirname, 'node_modules', '.bin', 'vite');
console.log('Using local vite at:', viteBin);

try {
  execSync(`"${viteBin}" build`, { 
    stdio: 'inherit', 
    cwd: __dirname 
  });
} catch (e) {
  // Fallback: try npx with exact version
  console.log('Fallback: using npx vite@5.3.1 build');
  execSync('npx vite@5.3.1 build', { 
    stdio: 'inherit', 
    cwd: __dirname 
  });
}
