import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { fixture } from '../helpers/fixtures.js';
import { newSession, inject, names } from '../helpers/session.js';
import { readParty } from '../../public/js/party.js';
import { decode } from '../../public/js/trade.js';
import { MEM_SRAM, MEM_WRAM } from '../../public/js/core.js';

const partyOf = (core) => readParty(core.readWram(0xd000, 4096), true);
const wramOf = (core) => core.getMemory(MEM_WRAM);
const SAVED = new Uint8Array(32768).map((_, i) => (i * 7 + 3) & 0xff);
const MSG = {
  noGame: 'Carga tu partida primero (el intercambio funciona con el juego en marcha).',
  battle: 'Termina el combate antes de intercambiar.',
  gone: 'Ese Pokémon ya no está en tu equipo.',
  only: 'No puedes enviar a tu único Pokémon.',
  full: 'Tu equipo está lleno. Deja un Pokémon en el PC y vuelve a intentarlo.',
  used: 'Ese código ya se usó en este teléfono.',
};

test('loadRom persists the ROM and loadLastRom restores it in a new Session', async () => {
  const { session, idb, storage } = await newSession();
  assert.equal(session.romInfo.baseName, 'PM_CRYSTAL_BYTS');
  assert.equal(session.romInfo.supported, true);
  assert.equal(session.romInfo.spanish, true);
  assert.deepEqual(await storage.keys('roms'), ['PM_CRYSTAL_BYTS']);
  const again = await newSession({ idb, load: false });
  assert.equal(await again.session.loadLastRom(), true);
  assert.equal(again.session.romInfo.baseName, 'PM_CRYSTAL_BYTS');
});

test('loadLastRom is false when nothing was ever loaded', async () => {
  const { session } = await newSession({ load: false });
  assert.equal(await session.loadLastRom(), false);
});

test('loadRom rejects garbage without persisting it', async () => {
  const { session, storage } = await newSession({ load: false });
  const r = await session.loadRom(new Uint8Array(100).map((_, i) => i * 37));
  assert.equal(r.ok, false);
  assert.match(r.error, /ROM/);
  assert.deepEqual(await storage.keys('roms'), []);
});

test('flush stores modified SRAM and a new Session sees the same bytes', async () => {
  const { core, session, idb } = await newSession();
  assert.equal(core.setMemory(MEM_SRAM, SAVED), true);
  await session.flush();
  const again = await newSession({ idb, load: false });
  await again.session.loadLastRom();
  assert.deepEqual(again.core.getMemory(MEM_SRAM), SAVED);
});

test('a newer SRAM wins over an older auto state when restoring', async () => {
  const { core, session, idb, storage } = await newSession();
  await session.flush(); // auto state with the blank SRAM
  core.setMemory(MEM_SRAM, SAVED);
  await session.persistSram(); // SRAM saved later, state not refreshed (e.g. the app was killed)
  assert.ok((await storage.keys('states')).length >= 1);
  const again = await newSession({ idb, load: false });
  await again.session.loadLastRom();
  assert.deepEqual(again.core.getMemory(MEM_SRAM), SAVED);
});

test('frame() refreshes the snapshot every 60 frames', async () => {
  const { core, session } = await newSession();
  let refreshes = 0;
  const refresh = session.refresh.bind(session);
  session.refresh = () => { refreshes++; refresh(); };
  for (let i = 0; i < 119; i++) session.frame();
  assert.equal(refreshes, 1);
  session.frame();
  assert.equal(refreshes, 2);
  inject(core, 'party3');
  session.refresh = refresh;
  session.refresh();
  assert.equal(session.snapshot.mons.length, 3);
});

test('frame() saves SRAM to storage on the 600th frame, not before', async () => {
  const { core, session, storage } = await newSession();
  core.setMemory(MEM_SRAM, SAVED);
  for (let i = 0; i < 599; i++) session.frame();
  await session.idle();
  assert.equal(await storage.get('saves', 'PM_CRYSTAL_BYTS.srm'), undefined);
  session.frame();
  await session.idle();
  // The running game may rewrite this test SRAM, so compare with the live core, not with SAVED.
  assert.deepEqual(await storage.get('saves', 'PM_CRYSTAL_BYTS.srm'), core.getMemory(MEM_SRAM));
});

test('sendMon returns a PKC1 code that decodes to the same Pokémon, removes it and remembers the code', async () => {
  const { core, session, storage } = await newSession();
  inject(core, 'party3');
  const before = partyOf(core).mons[1];
  const r = await session.sendMon(1);
  assert.equal(r.ok, true, r.message);
  const offer = decode(r.code);
  assert.equal(offer.species, before.species);
  assert.equal(offer.level, before.level);
  assert.equal(offer.fromSpanish, true);
  assert.equal(partyOf(core).mons.length, 2);
  assert.equal(partyOf(core).indexOf(before.key), -1);
  const sent = await storage.tradeSent();
  assert.equal(sent[0].code, r.code);
  assert.match(sent[0].label, /Nv\. \d+/);
});

test('receive puts the Pokémon back and marks the Pokédex', async () => {
  const { core, session } = await newSession();
  inject(core, 'party3');
  const before = partyOf(core);
  const sent = await session.sendMon(1);
  const r = await session.receive(decode(sent.code));
  assert.equal(r.ok, true, r.message);
  assert.match(r.message, /^¡Has recibido a /);
  const after = partyOf(core);
  assert.equal(after.mons.length, 3);
  assert.equal(after.mons[2].key, before.mons[1].key);
  assert.equal(after.caught(before.mons[1].species), true);
});

test('receive evolves Onix holding METAL COAT and says so', async () => {
  const { core, session } = await newSession();
  inject(core, 'onix-metal-coat');
  const sent = await session.sendMon(1);
  const r = await session.receive(decode(sent.code));
  assert.equal(r.ok, true, r.message);
  assert.ok(r.message.includes(`¿Eh? ¡${names[95]} está evolucionando! … ¡Se ha convertido en ${names[208]}!`), r.message);
  assert.equal(partyOf(core).mons[1].species, 208);
});

// RF2: receiving the same code twice, also across a reload, and concurrently.
test('receiving the same code twice is rejected the second time, also after a reload', async () => {
  const a = await newSession();
  inject(a.core, 'party3');
  const sent = await a.session.sendMon(1);
  const offer = decode(sent.code);
  assert.equal((await a.session.receive(offer)).ok, true);
  const count = partyOf(a.core).mons.length;
  const second = await a.session.receive(offer);
  assert.deepEqual([second.ok, second.message], [false, MSG.used]);
  assert.equal(partyOf(a.core).mons.length, count);

  const b = await newSession({ idb: a.idb, load: false });
  await b.session.loadLastRom();
  inject(b.core, 'party3');
  const wram = wramOf(b.core);
  const third = await b.session.receive(offer);
  assert.deepEqual([third.ok, third.message], [false, MSG.used]);
  assert.deepEqual(wramOf(b.core), wram);
});

test('two simultaneous receives of one code succeed only once', async () => {
  const { core, session } = await newSession();
  inject(core, 'party3');
  const sent = await session.sendMon(1);
  const offer = decode(sent.code);
  const results = await Promise.all([session.receive(offer), session.receive(offer)]);
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal(partyOf(core).mons.length, 3);
});

// RF3: refusals leave WRAM untouched and never record anything.
const offer0 = decode(fixture('trade').find((v) => v.decoded).code);
const refusals = [
  ['sendMon in battle', 'battle', (s) => s.sendMon(0), MSG.battle],
  ['receive in battle', 'battle', (s) => s.receive(offer0), MSG.battle],
  ['receive with a full party', 'party6', (s) => s.receive(offer0), MSG.full],
  ['sendMon with a single Pokémon', 'party1', (s) => s.sendMon(0), MSG.only],
  ['sendMon with an index that does not exist', 'party3', (s) => s.sendMon(5), MSG.gone],
  ['sendMon with a negative index', 'party3', (s) => s.sendMon(-1), MSG.gone],
  ['sendMon without a loaded game', 'empty', (s) => s.sendMon(0), MSG.noGame],
  ['receive without a loaded game', 'empty', (s) => s.receive(offer0), MSG.noGame],
];
for (const [name, scenario, action, message] of refusals) {
  test(`${name} is refused and leaves WRAM untouched`, async () => {
    const { core, session, storage } = await newSession();
    inject(core, scenario);
    const wram = wramOf(core);
    const r = await action(session);
    assert.deepEqual([r.ok, r.message], [false, message]);
    assert.deepEqual(wramOf(core), wram);
    assert.deepEqual(await storage.tradeSent(), []);
    assert.equal(await storage.tradeUsed(offer0.id), false);
  });
}

test('a refused receive can be retried once there is room', async () => {
  const { core, session } = await newSession();
  inject(core, 'party6');
  assert.equal((await session.receive(offer0)).ok, false);
  inject(core, 'party3');
  assert.equal((await session.receive(offer0)).ok, true);
});

test('trades are refused for a ROM that is not Crystal', async () => {
  const { session } = await newSession({ load: false });
  const rom = new Uint8Array(2097152); // blank: not a Crystal header
  await session.loadRom(rom);
  const r = await session.sendMon(0);
  assert.equal(r.ok, false);
  assert.match(r.message, /solo funcionan con Pokémon Crystal/);
});

// RF4: importing a .sav.
test('importSram accepts 32768 bytes and backs up the previous save first', async () => {
  const { core, session, storage } = await newSession();
  core.setMemory(MEM_SRAM, SAVED);
  const next = new Uint8Array(32768).fill(0x42);
  const r = await session.importSram(next);
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(core.getMemory(MEM_SRAM), next);
  assert.deepEqual(await storage.get('saves', 'PM_CRYSTAL_BYTS.srm'), next);
  const backups = (await storage.keys('saves')).filter((k) => k.startsWith('backup-'));
  assert.equal(backups.length, 1);
  assert.deepEqual(await storage.get('saves', backups[0]), SAVED);
  assert.equal((await storage.keys('states')).length, 0, 'the auto state must be dropped');
});

test('importSram accepts a 32816-byte file (RTC footer) by trimming it', async () => {
  const { core, session } = await newSession();
  const file = new Uint8Array(32816).fill(0x11);
  assert.equal((await session.importSram(file)).ok, true);
  assert.deepEqual(core.getMemory(MEM_SRAM), new Uint8Array(32768).fill(0x11));
});

for (const size of [0, 100, 65536]) {
  test(`importSram rejects ${size} bytes without touching the current save`, async () => {
    const { core, session, storage } = await newSession();
    core.setMemory(MEM_SRAM, SAVED);
    const r = await session.importSram(new Uint8Array(size));
    assert.equal(r.ok, false);
    assert.match(r.message, /no es válido/);
    assert.deepEqual(core.getMemory(MEM_SRAM), SAVED);
    assert.deepEqual((await storage.keys('saves')).filter((k) => k.startsWith('backup-')), []);
  });
}

test('exportSram returns the current SRAM', async () => {
  const { core, session } = await newSession();
  core.setMemory(MEM_SRAM, SAVED);
  assert.deepEqual(session.exportSram(), SAVED);
});

// ---- review fixes ----

test('loading another ROM first saves the running game', async () => {
  const { core, session, storage } = await newSession();
  core.setMemory(MEM_SRAM, SAVED);
  const other = await session.loadRom((await import('../helpers/roms.js')).loadRom('BYTE'));
  assert.equal(other.ok, true);
  assert.deepEqual(await storage.get('saves', 'PM_CRYSTAL_BYTS.srm'), SAVED);
  assert.ok((await storage.keys('states')).includes('PM_CRYSTAL_BYTS/slot0'));
});

test('a successful send is persisted at once (state survives a kill before the next flush)', async () => {
  const a = await newSession();
  inject(a.core, 'party3');
  assert.equal((await a.session.sendMon(1)).ok, true);
  const b = await newSession({ idb: a.idb, load: false });
  await b.session.loadLastRom();
  assert.equal(partyOf(b.core).mons.length, 2);
});

test('a successful receive is persisted at once', async () => {
  const a = await newSession();
  inject(a.core, 'party3');
  const sent = await a.session.sendMon(1);
  assert.equal((await a.session.receive(decode(sent.code))).ok, true);
  const b = await newSession({ idb: a.idb, load: false });
  await b.session.loadLastRom();
  assert.equal(partyOf(b.core).mons.length, 3);
});

test('if the used-code record cannot be written the receive is refused and nothing changes', async () => {
  const { core, session, storage } = await newSession();
  inject(core, 'party3');
  const wram = wramOf(core);
  storage.tradeClaim = async () => { throw new Error('quota'); };
  const original = console.error;
  console.error = () => {};
  let r;
  try { r = await session.receive(offer0); } finally { console.error = original; }
  assert.equal(r.ok, false);
  assert.match(r.message, /No se pudo registrar el intercambio/);
  assert.deepEqual(wramOf(core), wram);
});

test('two tabs (two sessions on one database) cannot both receive the same code', async () => {
  const a = await newSession();
  const b = await newSession({ idb: a.idb });
  inject(a.core, 'party3');
  inject(b.core, 'party3');
  const results = await Promise.all([a.session.receive(offer0), b.session.receive(offer0)]);
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal(results.filter((r) => !r.ok && r.message === MSG.used).length, 1);
});

test('latestBackup returns the newest backup made by importSram', async () => {
  const { core, session } = await newSession();
  assert.equal(await session.latestBackup(), null);
  core.setMemory(MEM_SRAM, SAVED);
  await session.importSram(new Uint8Array(32768).fill(1));
  const first = await session.latestBackup();
  assert.deepEqual(first.bytes, SAVED);
  await new Promise((r) => setTimeout(r, 5));
  await session.importSram(new Uint8Array(32768).fill(2));
  assert.deepEqual((await session.latestBackup()).bytes, new Uint8Array(32768).fill(1));
});
