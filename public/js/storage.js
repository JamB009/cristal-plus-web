// IndexedDB wrapper: ROMs, saves (SRAM/RTC), save states and small key/value records.

const STORES = ['roms', 'saves', 'states', 'kv'];
const SENT_LIMIT = 20;

const request = (r) => new Promise((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});

const finished = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error);
});

export async function openStorage(idb = globalThis.indexedDB) {
  const open = idb.open('crystal-plus', 1);
  open.onupgradeneeded = () => {
    for (const s of STORES) {
      if (!open.result.objectStoreNames.contains(s)) open.result.createObjectStore(s);
    }
  };
  return new Storage(await request(open));
}

export class Storage {
  constructor(db) {
    this.db = db;
  }

  get(store, key) {
    return request(this.db.transaction(store).objectStore(store).get(key));
  }

  put(store, key, value) {
    const tx = this.db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    return finished(tx);
  }

  del(store, key) {
    const tx = this.db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    return finished(tx);
  }

  keys(store) {
    return request(this.db.transaction(store).objectStore(store).getAllKeys());
  }

  /** Atomic read-modify-write of one record. */
  update(store, key, fn) {
    const tx = this.db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    const read = os.get(key);
    read.onsuccess = () => os.put(fn(read.result), key);
    return finished(tx);
  }

  async tradeSent() {
    return (await this.get('kv', 'tradeSent')) ?? [];
  }

  /** Keeps the last 20 codes sent, so a Pokémon is never lost if the message wasn't sent. */
  tradeRemember(code, label) {
    return this.update('kv', 'tradeSent', (old) => [{ code, label, time: Date.now() }, ...(old ?? [])].slice(0, SENT_LIMIT));
  }

  async tradeUsed(id) {
    return ((await this.get('kv', 'tradeUsed')) ?? []).includes(id);
  }

  tradeMarkUsed(id) {
    return this.update('kv', 'tradeUsed', (old) => ((old ?? []).includes(id) ? old : [...(old ?? []), id]));
  }
}
