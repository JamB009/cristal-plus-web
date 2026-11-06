import test from 'node:test';
import assert from 'node:assert/strict';
import { acquireInstance } from '../../public/js/instance.js';

/** Minimal Web Locks: one exclusive lock; waiters give up when their signal aborts. */
function fakeLocks() {
  const locks = {
    held: false,
    request(name, opts, cb) {
      return new Promise((resolve, reject) => {
        if (!locks.held) {
          locks.held = true;
          Promise.resolve(cb()).then(resolve, reject);
          return;
        }
        opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      });
    },
    release() { locks.held = false; },
  };
  return locks;
}

test('the first tab gets the lock, a second one is refused after the timeout', async () => {
  const locks = fakeLocks();
  assert.equal(await acquireInstance({ locks, timeoutMs: 30 }), true);
  assert.equal(await acquireInstance({ locks, timeoutMs: 30 }), false);
});

test('once the first tab is gone the lock can be taken again', async () => {
  const locks = fakeLocks();
  await acquireInstance({ locks, timeoutMs: 30 });
  locks.release();
  assert.equal(await acquireInstance({ locks, timeoutMs: 30 }), true);
});

test('browsers without Web Locks are let through', async () => {
  assert.equal(await acquireInstance({ locks: undefined }), true);
});
