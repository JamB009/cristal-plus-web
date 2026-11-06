import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const pub = fileURLToPath(new URL('../../public/', import.meta.url));
const source = readFileSync(join(pub, 'sw.js'), 'utf8');

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [relative(pub, p)];
  });
}

const precached = new Function(`return [${source.match(/const ASSETS = \[([\s\S]*?)\];/)[1]}]`)();

test('the service worker precaches every file of the app (so nothing is missing offline)', () => {
  const files = walk(pub).filter((f) => f !== 'sw.js');
  const missing = files.filter((f) => !precached.includes(f));
  assert.deepEqual(missing, []);
});

test('the precache list names only files that exist', () => {
  const files = new Set(walk(pub));
  const ghosts = precached.filter((f) => f !== './' && !files.has(f));
  assert.deepEqual(ghosts, []);
});

test('the cache name carries the hash of the wasm core, so a new core can never meet an old cache', () => {
  const hash = createHash('sha256')
    .update(readFileSync(join(pub, 'wasm/gambatte.js')))
    .update(readFileSync(join(pub, 'wasm/gambatte.wasm')))
    .digest('hex')
    .slice(0, 12);
  assert.match(source, new RegExp(`const CACHE = 'crystal-web-v\\d+-${hash}'`), 'run: node tools/stamp-sw.mjs');
});

test('the service worker never touches the dev ROM route', () => {
  assert.match(source, /\/__dev\//);
});
