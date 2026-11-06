import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fixture } from '../helpers/fixtures.js';
import { loadRom } from '../helpers/roms.js';
import { parseGameData, EVOLVE_LEVEL, EVOLVE_TRADE, NO_ITEM } from '../../public/js/gamedata.js';

const sha = (v) => createHash('sha256').update(JSON.stringify(v), 'utf8').digest('hex');
const ref = fixture('gamedata');

for (const code of ['BYTE', 'BYTS']) {
  test(`${code}: tables hash like the Java parser's`, () => {
    const g = parseGameData(loadRom(code));
    assert.ok(g, 'parse returned null');
    for (const table of ['baseStats', 'growth', 'evos', 'learnset', 'movePp', 'moveNames']) {
      assert.equal(sha(g[table]), ref[code].sha256[table], table);
    }
  });

  test(`${code}: spot species match`, () => {
    const g = parseGameData(loadRom(code));
    for (const [sp, want] of Object.entries(ref[code].spot)) {
      assert.deepEqual(g.baseStats[sp], want.baseStats, `baseStats ${sp}`);
      assert.equal(g.growth[sp], want.growth, `growth ${sp}`);
      assert.deepEqual(g.evos[sp], want.evos, `evos ${sp}`);
      assert.deepEqual(g.learnset[sp], want.learnset, `learnset ${sp}`);
    }
    for (const [m, name] of Object.entries(ref[code].moveNamesSample)) {
      assert.equal(g.moveNames[m], name, `move ${m}`);
    }
  });

  test(`${code}: expAt matches the Java growth formulas`, () => {
    const g = parseGameData(loadRom(code));
    for (const [sp, lv, exp] of ref[code].expAt) {
      assert.equal(g.expAt(sp, lv), exp, `species ${sp} level ${lv}`);
    }
  });
}

test('a ROM without the tables parses to null', () => {
  assert.equal(parseGameData(new Uint8Array(2097152)), null);
});

test('evolution constants match GameData.java', () => {
  assert.deepEqual([EVOLVE_LEVEL, EVOLVE_TRADE, NO_ITEM], [1, 3, 0xff]);
});
