// Static dev server for public/. Binds to 127.0.0.1 only.
// --dev-roms also serves test/roms/ under /__dev/roms/ (for on-device smoke tests over `adb reverse`).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', 'public');
const romsDir = join(here, '..', 'test', 'roms');
const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1]) || 8080;
const devRoms = args.includes('--dev-roms');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.gbc': 'application/octet-stream',
};

async function resolve(urlPath) {
  if (devRoms && urlPath.startsWith('/__dev/roms/')) return join(romsDir, basename(urlPath));
  const rel = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '');
  let file = join(root, rel);
  if (!file.startsWith(root)) return null;
  if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
  return file;
}

createServer(async (req, res) => {
  try {
    const file = await resolve(new URL(req.url, 'http://x').pathname);
    if (!file) throw new Error('forbidden');
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/ (${devRoms ? 'dev roms on' : 'dev roms off'})`));
