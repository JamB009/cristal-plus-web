// Offline support. App files: network first (so updates arrive as soon as there is a connection),
// falling back to the cache; the heavy, rarely-changing .wasm and icons: cache first.
// Bump CACHE when ASSETS changes.

const CACHE = 'crystal-web-v1';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'data/pokemon.json',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'js/audio-worklet.js',
  'js/audio.js',
  'js/controls.js',
  'js/core.js',
  'js/gamedata.js',
  'js/lifecycle.js',
  'js/main.js',
  'js/menu.js',
  'js/mons.js',
  'js/names.js',
  'js/party.js',
  'js/roms.js',
  'js/screen.js',
  'js/session.js',
  'js/storage.js',
  'js/text.js',
  'js/trade-ui.js',
  'js/trade.js',
  'js/wram.js',
  'wasm/gambatte.js',
  'wasm/gambatte.wasm',
];
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('crystal-web-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function fetchAndCache(request, timeoutMs) {
  const ctrl = new AbortController();
  const timer = timeoutMs ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await fetch(request, { signal: ctrl.signal });
    if (res.ok) (await caches.open(CACHE)).put(request, res.clone());
    return res;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const fromCache = (request) => caches.match(request, { ignoreSearch: true });

async function networkFirst(request) {
  try {
    return await fetchAndCache(request, NETWORK_TIMEOUT_MS);
  } catch {
    return (await fromCache(request)) || (request.mode === 'navigate' && (await caches.match('./'))) || Response.error();
  }
}

async function cacheFirst(request) {
  return (await fromCache(request)) || fetchAndCache(request).catch(() => Response.error());
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // Never cache the dev server's ROM route (see tools/serve.mjs --dev-roms).
  if (request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/__dev/')) return;
  event.respondWith(/\.(wasm|png)$/.test(url.pathname) ? cacheFirst(request) : networkFirst(request));
});
