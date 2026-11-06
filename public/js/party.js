// Reads the player's party from WRAM bank 1 (0xD000-0xDFFF), ported from Party.java.
// Addresses are the same in BYTE and BYTS.

import { textAt } from './text.js';

export const BASE = 0xd000;
export const SIZE = 4096;

export const BATTLE_MODE = 0xd22d;
export const STATUS_FLAGS = 0xd84c;
export const MONEY = 0xd84e;
export const JOHTO_BADGES = 0xd857;
export const KANTO_BADGES = 0xd858;
export const PLAYER_NAME = 0xd47d;
export const PARTY_COUNT = 0xdcd7;
export const PARTY_SPECIES = 0xdcd8;
export const PARTY_MON1 = 0xdcdf;
export const PARTY_OT = 0xddff;
export const NICKNAMES = 0xde41;
export const DEX_CAUGHT = 0xde99;
export const DEX_SEEN = 0xdeb9;

export const MON_LENGTH = 48;
export const NAME_LENGTH = 11;
export const EGG = 0xfd;

// Offsets inside a party_struct.
export const M_SPECIES = 0;
export const M_ITEM = 1;
export const M_MOVES = 2;
export const M_ID = 6;
export const M_EXP = 8;
export const M_STAT_EXP = 11;
export const M_DVS = 21;
export const M_PP = 23;
export const M_HAPPINESS = 27;
export const M_LEVEL = 31;
export const M_HP = 34;
export const M_MAX_HP = 36;

const bitCount = (n) => {
  let c = 0;
  for (let v = n; v; v >>= 1) c += v & 1;
  return c;
};

export class Snapshot {
  constructor() {
    this.player = null;
    this.mons = [];
    this.johtoBadges = 0;
    this.kantoBadges = 0;
    this.hallOfFame = false;
    this.money = 0;
    this.dexCaught = 0;
    this.dexSeen = 0;
    this.caughtBits = new Uint8Array(32);
    this.inBattle = false;
  }

  caught(species) {
    const i = species - 1;
    return ((this.caughtBits[i >> 3] >> (i & 7)) & 1) !== 0;
  }

  indexOf(key) {
    return this.mons.findIndex((m) => m.key === key);
  }
}

/** OT ID and DVs: stable across evolutions and party reordering. */
export const monKey = (id, dvs) => id * 65536 + dvs;

/** `w` is the 4 KB bank at 0xD000. Returns null when it doesn't hold a loaded game. */
export function readParty(w, spanish) {
  const u8 = (addr) => w[addr - BASE];
  const u16 = (addr) => (u8(addr) << 8) | u8(addr + 1);
  const text = (addr, max) => textAt(w, addr - BASE, max, spanish);

  const s = new Snapshot();
  s.player = text(PLAYER_NAME, 8);
  if (s.player === null || s.player === '') return null;
  const count = u8(PARTY_COUNT);
  if (count > 6 || u8(PARTY_SPECIES + count) !== 0xff) return null;
  for (let i = 0; i < count; i++) {
    const listed = u8(PARTY_SPECIES + i);
    const a = PARTY_MON1 + i * MON_LENGTH;
    const dv1 = u8(a + M_DVS);
    const dv2 = u8(a + M_DVS + 1);
    const m = {
      species: u8(a + M_SPECIES),
      egg: listed === EGG,
      level: u8(a + M_LEVEL),
      hp: u16(a + M_HP),
      maxHp: u16(a + M_MAX_HP),
      shiny: (dv1 & 0xf) === 10 && dv2 >> 4 === 10 && (dv2 & 0xf) === 10 && ((dv1 >> 4) & 2) !== 0,
      key: monKey(u16(a + M_ID), (dv1 << 8) | dv2),
      eggCycles: u8(a + M_HAPPINESS),
      nick: '',
    };
    if (m.species < 1 || m.species > 251 || m.level < 1 || m.level > 100) return null;
    if (!m.egg && (m.maxHp === 0 || m.hp > m.maxHp || listed !== m.species)) return null;
    m.nick = text(NICKNAMES + i * NAME_LENGTH, 10) ?? '';
    s.mons.push(m);
  }
  s.johtoBadges = bitCount(u8(JOHTO_BADGES));
  s.kantoBadges = bitCount(u8(KANTO_BADGES));
  s.hallOfFame = (u8(STATUS_FLAGS) & 0x40) !== 0;
  s.money = Math.min(999999, (u8(MONEY) << 16) | (u8(MONEY + 1) << 8) | u8(MONEY + 2));
  for (let i = 0; i < 32; i++) {
    const mask = i === 31 ? 0x07 : 0xff;
    s.caughtBits[i] = u8(DEX_CAUGHT + i) & mask;
    s.dexCaught += bitCount(s.caughtBits[i]);
    s.dexSeen += bitCount(u8(DEX_SEEN + i) & mask);
  }
  s.inBattle = u8(BATTLE_MODE) !== 0;
  return s;
}
