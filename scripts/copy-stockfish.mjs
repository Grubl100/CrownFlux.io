import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'node_modules', 'stockfish', 'bin');
const licenseSrc = path.join(root, 'node_modules', 'stockfish', 'Copying.txt');
const destDir = path.join(root, 'public-assets', 'stockfish');

fs.mkdirSync(destDir, { recursive: true });

const files = [
  ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.js'],
  ['stockfish-19-lite-single.wasm', 'stockfish-19-lite-single.wasm'],
];

for (const [srcName, destName] of files) {
  const from = path.join(srcDir, srcName);
  const to = path.join(destDir, destName);
  if (!fs.existsSync(from)) {
    throw new Error(`Stockfish asset not found: ${from}`);
  }
  fs.copyFileSync(from, to);
}

if (fs.existsSync(licenseSrc)) {
  fs.copyFileSync(licenseSrc, path.join(destDir, 'LICENSE-GPL3.txt'));
}

console.log('Stockfish 19 Lite WASM assets copied to public-assets/stockfish/');
