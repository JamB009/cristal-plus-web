import { readFileSync } from 'node:fs';
import { IDBFactory } from 'fake-indexeddb';
import { fixture } from './fixtures.js';
import { loadRom } from './roms.js';
import { bankOf } from './wram.js';
import { createCore } from '../../public/js/core.js';
import { openStorage } from '../../public/js/storage.js';
import { Session } from '../../public/js/session.js';

export const names = JSON.parse(readFileSync(new URL('../../public/data/pokemon.json', import.meta.url), 'utf8')).names;
const scenarios = Object.fromEntries(fixture('mons').map((s) => [s.name, s]));

/** A Session on a fresh core with the Spanish ROM loaded; `idb` can be shared to simulate a reload. */
export async function newSession({ idb = new IDBFactory(), code = 'BYTS', load = true, clock } = {}) {
  const core = await createCore();
  const storage = await openStorage(idb);
  const session = await Session.create({ core, storage, names, clock });
  if (load) {
    const r = await session.loadRom(loadRom(code));
    if (!r.ok) throw new Error(r.error);
  }
  return { core, storage, session, idb };
}

/** Writes a fixture party (bank at 0xD000) into the live core. */
export function inject(core, scenarioName) {
  if (!core.writeWram(0xd000, bankOf(scenarios[scenarioName].bank))) throw new Error('writeWram failed');
}
