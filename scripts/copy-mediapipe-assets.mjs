// Keep MediaPipe's JavaScript and WebAssembly binaries on the same version.
// The package is bundled by Vite; these matching WASM resources are served by our site.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const from = resolve('node_modules/@mediapipe/tasks-vision/wasm');
const to = resolve('public/wasm');

if (!existsSync(from)) {
  throw new Error('MediaPipe WASM folder missing. Run npm install first.');
}
const files = readdirSync(from).filter(name => /^vision_wasm.*\.(js|wasm)$/.test(name));
if (!files.includes('vision_wasm_internal.js') || !files.includes('vision_wasm_internal.wasm')) {
  throw new Error('MediaPipe WASM binaries missing from installed tasks-vision package.');
}
mkdirSync(to, {recursive: true});
for (const name of files) copyFileSync(join(from, name), join(to, name));
console.log('Copied matching MediaPipe WASM files:', files.join(', '));
