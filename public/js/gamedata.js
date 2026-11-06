// Species tables read straight from the ROM, ported from GameData.java. They are located by
// searching for Bulbasaur/Pound, so the English and Spanish ROMs (which shift these tables by a
// few bytes) both work.

import { decodeChar } from './text.js';

export const EVOLVE_LEVEL = 1;
export const EVOLVE_TRADE = 3;
export const NO_ITEM = 0xff;
const BASE_SIZE = 32;

function u8(d, i) {
  if (i < 0 || i >= d.length) throw new RangeError(`ROM offset ${i} out of range`);
  return d[i];
}

function find(data, pattern, from) {
  outer: for (let i = from; i <= data.length - pattern.length; i++) {
    for (let k = 0; k < pattern.length; k++) {
      if (data[i + k] !== pattern[k]) continue outer;
    }
    return i;
  }
  return -1;
}

class GameData {
  constructor() {
    this.baseStats = new Array(252).fill(null);
    this.growth = new Array(252).fill(0);
    /** Per species: list of evolutions, each [type, param, [param2,] target]. */
    this.evos = new Array(252).fill(null);
    /** Per species: [level, move] pairs. */
    this.learnset = new Array(252).fill(null);
    this.movePp = new Array(256).fill(0);
    this.moveNames = new Array(256).fill(null);
  }

  /** Total experience needed for a level, as the game's GrowthRates table computes it. */
  expAt(species, level) {
    const n = level;
    const n2 = n * n;
    const n3 = n2 * n;
    let exp;
    switch (this.growth[species]) {
      case 1: exp = Math.floor((3 * n3) / 4) + 10 * n2 - 30; break;
      case 2: exp = Math.floor((3 * n3) / 4) + 20 * n2 - 70; break;
      case 3: exp = Math.floor((6 * n3) / 5) - 15 * n2 + 100 * n - 140; break;
      case 4: exp = Math.floor((4 * n3) / 5); break;
      case 5: exp = Math.floor((5 * n3) / 4); break;
      default: exp = n3;
    }
    return Math.max(0, exp);
  }
}

/** Returns null when the ROM doesn't hold the expected tables. */
export function parseGameData(rom) {
  try {
    return parse(rom);
  } catch (e) {
    if (e instanceof RangeError) return null;
    throw e;
  }
}

function parse(rom) {
  const g = new GameData();
  const base = find(rom, [1, 45, 49, 49, 45, 65, 65], 0);
  if (base < 0 || u8(rom, base + 250 * BASE_SIZE) !== 251) return null;
  for (let sp = 1; sp <= 251; sp++) {
    const o = base + (sp - 1) * BASE_SIZE;
    g.baseStats[sp] = [u8(rom, o + 1), u8(rom, o + 2), u8(rom, o + 3), u8(rom, o + 4), u8(rom, o + 5), u8(rom, o + 6)];
    g.growth[sp] = u8(rom, o + 22);
  }

  // Bulbasaur: EVOLVE_LEVEL 16 IVYSAUR, end, then "level 1: TACKLE".
  const bulba = find(rom, [1, 16, 2, 0, 1, 0x21], 0);
  if (bulba < 0) return null;
  const bank = Math.floor(bulba / 0x4000);
  const ptr = 0x4000 + (bulba % 0x4000);
  let table = -1;
  for (let i = bank * 0x4000; i < bank * 0x4000 + 0x4000 - 502; i++) {
    if (u8(rom, i) === (ptr & 0xff) && u8(rom, i + 1) === ptr >> 8) {
      table = i;
      break;
    }
  }
  if (table < 0) return null;
  for (let sp = 1; sp <= 251; sp++) {
    const p = u8(rom, table + 2 * (sp - 1)) | (u8(rom, table + 2 * (sp - 1) + 1) << 8);
    let a = bank * 0x4000 + p - 0x4000;
    const ev = [];
    while (u8(rom, a) !== 0) {
      const n = u8(rom, a) === 5 ? 4 : 3;
      const e = [];
      for (let k = 0; k < n; k++) e.push(u8(rom, a + k));
      ev.push(e);
      a += n;
    }
    a++;
    const ls = [];
    while (u8(rom, a) !== 0) {
      ls.push([u8(rom, a), u8(rom, a + 1)]);
      a += 2;
    }
    g.evos[sp] = ev;
    g.learnset[sp] = ls;
  }

  // Moves table: POUND {anim 1, effect 0, power 40, NORMAL, 100%, 35 PP, 0}, then KARATE_CHOP.
  const moves = find(rom, [1, 0, 40, 0, 255, 35, 0, 2], 0);
  if (moves < 0) return null;
  for (let m = 1; m <= 251; m++) g.movePp[m] = u8(rom, moves + 7 * (m - 1) + 5);

  // Move names: 0x50-terminated strings starting with POUND ("DESTRUCTOR" in Spanish).
  const spanish = u8(rom, 0x142) === 0x53; // 'S'
  const first = spanish
    ? [0x83, 0x84, 0x92, 0x93, 0x91, 0x94, 0x82, 0x93, 0x8e, 0x91, 0x50]
    : [0x8f, 0x8e, 0x94, 0x8d, 0x83, 0x50];
  let names = find(rom, first, 0);
  for (let m = 1; m <= 251; m++) {
    if (names < 0) {
      g.moveNames[m] = `#${m}`;
      continue;
    }
    let s = '';
    while (u8(rom, names) !== 0x50) s += decodeChar(u8(rom, names++), spanish) ?? '-';
    names++;
    g.moveNames[m] = s;
  }
  return g;
}
