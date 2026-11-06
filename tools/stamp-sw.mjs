// Puts the hash of the wasm core into the service worker's cache name. Run after rebuilding the core.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const pub = new URL('../public/', import.meta.url);
const hash = createHash('sha256')
  .update(readFileSync(new URL('wasm/gambatte.js', pub)))
  .update(readFileSync(new URL('wasm/gambatte.wasm', pub)))
  .digest('hex')
  .slice(0, 12);
const file = new URL('sw.js', pub);
const src = readFileSync(file, 'utf8');
const next = src.replace(/const CACHE = 'crystal-web-v(\d+)-[0-9a-f]+';/, `const CACHE = 'crystal-web-v$1-${hash}';`);
if (next === src && !src.includes(hash)) throw new Error('no se encontró la línea const CACHE en sw.js');
writeFileSync(file, next);
console.log(`sw.js: CACHE con hash ${hash}`);
