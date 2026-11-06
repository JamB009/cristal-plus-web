import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(fileURLToPath(new URL('../../public/sw.js', import.meta.url)), 'utf8');
const ORIGIN = 'http://app.test';

/** Runs sw.js against an in-memory Cache API and a scripted fetch. */
function boot() {
  const stores = new Map();
  const listeners = {};
  const state = { fetches: [], network: async () => new Response('net', { status: 200 }) };
  const open = async (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    return {
      put: async (req, res) => { m.set(new URL(req.url ?? req, ORIGIN).pathname, res); },
      addAll: async () => {},
    };
  };
  const caches = {
    open,
    keys: async () => [...stores.keys()],
    delete: async (n) => stores.delete(n),
    match: async (req) => {
      const path = new URL(req.url ?? req, ORIGIN).pathname;
      for (const m of stores.values()) if (m.has(path)) return m.get(path).clone();
      return undefined;
    },
  };
  const self = { addEventListener: (t, f) => { listeners[t] = f; }, skipWaiting: () => {}, clients: { claim: async () => {} } };
  const sandbox = {
    self, caches, Response, Request, URL, AbortController, setTimeout, clearTimeout,
    location: { origin: ORIGIN },
    fetch: async (req, opts) => { state.fetches.push(req.url); return state.network(req, opts); },
  };
  vm.runInNewContext(source, sandbox);
  const run = async (url, init = {}) => {
    const ev = { request: new Request(`${ORIGIN}${url}`, init), p: null, respondWith(p) { this.p = p; }, waitUntil() {} };
    listeners.fetch(ev);
    return ev.p ? ev.p : null;
  };
  const cacheNameNow = () => /const CACHE = '([^']+)'/.exec(source)[1];
  return { stores, state, run, listeners, cacheNameNow, open };
}

const seed = async (t, url, body) => (await t.open(t.cacheNameNow())).put(new Request(`${ORIGIN}${url}`), new Response(body));
const text = async (p) => (await p).text();

test('app files: the network answer wins and is cached', async () => {
  const t = boot();
  t.state.network = async () => new Response('fresh', { status: 200 });
  assert.equal(await text(t.run('/js/main.js')), 'fresh');
  assert.equal(await text(t.run('/js/main.js?x=1').then(() => (t.state.network = async () => { throw new Error('offline'); }, t.run('/js/main.js')))), 'fresh');
});

test('app files: a 500 from the server falls back to the cached copy', async () => {
  const t = boot();
  await seed(t, '/js/main.js', 'cached');
  t.state.network = async () => new Response('boom', { status: 500 });
  assert.equal(await text(t.run('/js/main.js')), 'cached');
});

test('app files: a 500 with nothing cached is passed through', async () => {
  const t = boot();
  t.state.network = async () => new Response('boom', { status: 503 });
  const res = await t.run('/js/main.js');
  assert.equal(res.status, 503);
});

test('app files: offline serves the cache, or a network error if there is none', async () => {
  const t = boot();
  t.state.network = async () => { throw new TypeError('offline'); };
  assert.equal((await t.run('/js/main.js')).type, 'error');
  await seed(t, '/js/main.js', 'cached');
  assert.equal(await text(t.run('/js/main.js')), 'cached');
});

test('the wasm and its glue are cache-first (they must stay a matching pair)', async () => {
  const t = boot();
  await seed(t, '/wasm/gambatte.wasm', 'wasm');
  await seed(t, '/wasm/gambatte.js', 'glue');
  assert.equal(await text(t.run('/wasm/gambatte.wasm')), 'wasm');
  assert.equal(await text(t.run('/wasm/gambatte.js')), 'glue');
  assert.deepEqual(t.state.fetches, []);
});

test('the dev ROM route, non-GET requests and other origins are not handled', async () => {
  const t = boot();
  assert.equal(await t.run('/__dev/roms/x.gbc'), null);
  assert.equal(await t.run('/js/main.js', { method: 'POST' }), null);
  const ev = { request: new Request('http://other.test/a.js'), respondWith() { throw new Error('handled'); } };
  assert.doesNotThrow(() => t.listeners.fetch(ev));
});

test('activate removes older crystal-web caches only', async () => {
  const t = boot();
  await t.open('crystal-web-v0-old');
  await t.open('someone-elses-cache');
  await t.open(t.cacheNameNow());
  let done;
  await t.listeners.activate({ waitUntil: (p) => { done = p; } });
  await done;
  assert.deepEqual([...t.stores.keys()].sort(), [t.cacheNameNow(), 'someone-elses-cache'].sort());
});
