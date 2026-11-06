import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fixture } from '../helpers/fixtures.js';
import { loadRom } from '../helpers/roms.js';
import { bankOf, b64Of, hex, unhex, wramFromBank } from '../helpers/wram.js';
import { parseGameData } from '../../public/js/gamedata.js';
import { encodeName, textRaw } from '../../public/js/text.js';
import * as P from '../../public/js/party.js';
import { monAddr, count, stats, tradeEvolve, markDex, take, remove, add } from '../../public/js/mons.js';
import { Wram } from '../../public/js/wram.js';

const names = JSON.parse(readFileSync(new URL('../../public/data/pokemon.json', import.meta.url), 'utf8')).names;
const data = { BYTE: parseGameData(loadRom('BYTE')), BYTS: parseGameData(loadRom('BYTS')) };
const scenarios = fixture('mons');
const byName = Object.fromEntries(scenarios.map((s) => [s.name, s]));
const packedOf = (p) => ({ listed: p.listed, struct: unhex(p.struct), ot: unhex(p.ot), nick: unhex(p.nick) });
const packedJson = (p) => ({ listed: p.listed, struct: hex(p.struct), ot: hex(p.ot), nick: hex(p.nick) });

for (const sc of scenarios) {
  const g = data[sc.spanish ? 'BYTS' : 'BYTE'];
  for (const op of sc.ops) {
    if (op.op === 'readParty') continue;
    test(`${sc.name}: ${op.op}(${JSON.stringify(op.args?.map((a) => (typeof a === 'object' ? 'packed' : a)))}) matches Java`, () => {
      const w = wramFromBank(bankOf(sc.bank));
      let result;
      switch (op.op) {
        case 'stats': result = stats(w, monAddr(op.args[0]), g); break;
        case 'take': result = packedJson(take(w, op.args[0])); break;
        case 'remove': remove(w, op.args[0]); break;
        case 'tradeEvolve': result = tradeEvolve(w, op.args[0], g, names); break;
        case 'add': result = add(w, packedOf(op.args[0])); break;
        case 'markDex': markDex(w, op.args[0]); break;
        default: assert.fail(`unknown op ${op.op}`);
      }
      if ('result' in op) assert.deepEqual(result, op.result);
      if (op.bankAfter) assert.equal(b64Of(w.bank1()), op.bankAfter);
    });
  }
}

test('Wram reads and writes absolute addresses, big-endian 16 bit', () => {
  const w = new Wram(new Uint8Array(0x8000));
  w.w16(0xd000, 0x1234);
  assert.equal(w.m[0x1000], 0x12);
  assert.equal(w.u8(0xd001), 0x34);
  assert.equal(w.u16(0xd000), 0x1234);
  w.put(0xd010, new Uint8Array([1, 2, 3]));
  w.copy(0xd010, 0xd020, 3);
  assert.deepEqual([...w.bytes(0xd020, 3)], [1, 2, 3]);
  assert.equal(w.bank1().length, 4096);
});

test('tradeEvolve evolves Onix holding METAL COAT into Steelix and clears the item', () => {
  const w = wramFromBank(bankOf(byName['onix-metal-coat'].bank));
  const a = monAddr(1);
  assert.equal(w.u8(a + P.M_SPECIES), 95);
  assert.notEqual(w.u8(a + P.M_ITEM), 0);
  assert.equal(tradeEvolve(w, 1, data.BYTS, names), 208);
  assert.equal(w.u8(a + P.M_SPECIES), 208);
  assert.equal(w.u8(P.PARTY_SPECIES + 1), 208);
  assert.equal(w.u8(a + P.M_ITEM), 0);
  assert.equal(textRaw(w.bytes(P.NICKNAMES + P.NAME_LENGTH, 11), true), names[208]);
});

test('tradeEvolve keeps a custom nickname but renames a default one', () => {
  const w = wramFromBank(bankOf(byName['onix-metal-coat'].bank));
  w.put(P.NICKNAMES + P.NAME_LENGTH, encodeName('ROCKY'));
  assert.equal(tradeEvolve(w, 1, data.BYTS, names), 208);
  assert.equal(textRaw(w.bytes(P.NICKNAMES + P.NAME_LENGTH, 11), true), 'ROCKY');
});

test('tradeEvolve does nothing for the wrong held item or for an egg', () => {
  const w = wramFromBank(bankOf(byName['onix-wrong-item'].bank));
  const before = hex(w.bank1());
  assert.equal(tradeEvolve(w, 0, data.BYTS, names), 0);
  assert.equal(hex(w.bank1()), before);
});

test('remove shifts species, structs, OT names and nicknames', () => {
  const w = wramFromBank(bankOf(byName.party3.bank));
  const second = take(w, 1);
  const third = take(w, 2);
  remove(w, 0);
  assert.equal(count(w), 2);
  assert.equal(w.u8(P.PARTY_SPECIES + 2), 0xff);
  assert.deepEqual(take(w, 0), second);
  assert.deepEqual(take(w, 1), third);
});

test('add marks the Pokédex but not for an egg', () => {
  const sc = byName.party1;
  const species = 100;
  const packed = (listed) => {
    const struct = new Uint8Array(48);
    struct[P.M_SPECIES] = species;
    struct[P.M_LEVEL] = 5;
    return { listed, struct, ot: encodeName('JAM'), nick: encodeName('X') };
  };
  const dexBit = (w) => (w.u8(P.DEX_CAUGHT + ((species - 1) >> 3)) >> ((species - 1) & 7)) & 1;

  let w = wramFromBank(bankOf(sc.bank));
  w.put(P.DEX_CAUGHT, new Uint8Array(32));
  assert.equal(add(w, packed(species)), 1);
  assert.equal(count(w), 2);
  assert.equal(dexBit(w), 1);

  w = wramFromBank(bankOf(sc.bank));
  w.put(P.DEX_CAUGHT, new Uint8Array(32));
  add(w, packed(P.EGG));
  assert.equal(dexBit(w), 0);
});
