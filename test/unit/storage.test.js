import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { openStorage } from '../../public/js/storage.js';

test('roundtrips bytes in each store', async () => {
  const st = await openStorage(new IDBFactory());
  const bytes = new Uint8Array([1, 2, 3, 255]);
  for (const store of ['roms', 'saves', 'states', 'kv']) {
    assert.equal(await st.get(store, 'k'), undefined);
    await st.put(store, 'k', bytes);
    assert.deepEqual(await st.get(store, 'k'), bytes);
    assert.deepEqual(await st.keys(store), ['k']);
    await st.del(store, 'k');
    assert.equal(await st.get(store, 'k'), undefined);
  }
});

test('tradeRemember keeps only the 20 most recent, newest first', async () => {
  const st = await openStorage(new IDBFactory());
  for (let i = 0; i < 25; i++) await st.tradeRemember(`code${i}`, `label${i}`);
  const sent = await st.tradeSent();
  assert.equal(sent.length, 20);
  assert.equal(sent[0].code, 'code24');
  assert.equal(sent[19].code, 'code5');
  assert.equal(sent[0].label, 'label24');
  assert.equal(typeof sent[0].time, 'number');
});

test('tradeUsed survives reopening the database', async () => {
  const idb = new IDBFactory();
  const a = await openStorage(idb);
  assert.equal(await a.tradeUsed('deadbeef'), false);
  await a.tradeMarkUsed('deadbeef');
  const b = await openStorage(idb);
  assert.equal(await b.tradeUsed('deadbeef'), true);
  assert.equal(await b.tradeUsed('00000000'), false);
});

test('concurrent tradeMarkUsed calls do not lose ids', async () => {
  const st = await openStorage(new IDBFactory());
  await Promise.all(['aaaaaaaa', 'bbbbbbbb', 'cccccccc'].map((id) => st.tradeMarkUsed(id)));
  for (const id of ['aaaaaaaa', 'bbbbbbbb', 'cccccccc']) assert.equal(await st.tradeUsed(id), true, id);
});
