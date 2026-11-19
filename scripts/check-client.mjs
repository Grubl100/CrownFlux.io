import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const requiredFiles = [
  'index.html',
  'vite.config.js',
  'server.mjs',
  'src/main.jsx',
  'src/App.jsx',
  'src/routes/AppRouter.jsx',
  'src/styles/main.css',
];

for (const rel of requiredFiles) {
  const full = path.resolve(rel);
  if (!existsSync(full)) {
    throw new Error(`Missing required file: ${rel}`);
  }
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
for (const dep of ['react', 'react-dom', 'react-router-dom', 'ws']) {
  if (!pkg.dependencies?.[dep]) {
    throw new Error(`Missing dependency in package.json: ${dep}`);
  }
}

console.log('React + Vite project structure verified cleanly.');
