import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../helpers/fixtures.js';

test('fixtures are present and well formed', () => {
  const gd = fixture('gamedata');
  assert.deepEqual(gd.BYTE.spot['1'].baseStats, [45, 49, 49, 45, 65, 65]);
  assert.deepEqual(gd.BYTE.spot['25'].baseStats, [35, 55, 30, 90, 50, 40]);
  assert.equal(gd.BYTS.moveNamesSample['1'], 'DESTRUCTOR');
  assert.equal(gd.BYTE.moveNamesSample['1'], 'POUND');
  assert.ok(gd.BYTE.expAt.some(([s, l, e]) => s === 25 && l === 100 && e === 1000000));

  const mons = fixture('mons');
  assert.ok(mons.length >= 20);
  for (const name of ['party3', 'party6', 'party1', 'battle', 'onix-metal-coat', 'empty']) {
    assert.ok(mons.some((s) => s.name === name), `missing scenario ${name}`);
  }

  const trade = fixture('trade');
  assert.ok(trade.length > 5);
  assert.equal(trade[0].code.length, 135);
  assert.ok(trade[0].code.startsWith('PKC1-'));
  assert.ok(trade.some((t) => t.decoded === null));
});
