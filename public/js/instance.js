// One tab at a time: two copies of the game on the same IndexedDB would overwrite each other's saves.

/**
 * Takes an exclusive Web Lock for the life of the page. Waits up to timeoutMs (a reload releases the old
 * page's lock a moment after the new one starts). Resolves false if another tab really holds it.
 */
export async function acquireInstance({ locks = globalThis.navigator?.locks, name = 'crystal-plus-session', timeoutMs = 2000 } = {}) {
  if (!locks) return true;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  return new Promise((resolve) => {
    locks
      .request(name, { signal: ctrl.signal }, () => {
        clearTimeout(timer);
        resolve(true);
        return new Promise(() => {}); // hold it until the page goes away
      })
      .catch(() => resolve(false));
  });
}
