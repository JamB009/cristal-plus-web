import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../helpers/fixtures.js';
import { bankOf, hex } from '../helpers/wram.js';
import { readParty } from '../../public/js/party.js';

const plain = (s) => s && {
  player: s.player,
  mons: s.mons.map((m) => ({
    species: m.species, egg: m.egg, shiny: m.shiny, nick: m.nick, level: m.level,
    hp: m.hp, maxHp: m.maxHp, key: m.key, eggCycles: m.eggCycles,
  })),
  johtoBadges: s.johtoBadges,
  kantoBadges: s.kantoBadges,
  hallOfFame: s.hallOfFame,
  money: s.money,
  dexCaught: s.dexCaught,
  dexSeen: s.dexSeen,
  caught: hex(s.caughtBits),
  inBattle: s.inBattle,
};

for (const sc of fixture('mons')) {
  test(`readParty matches the Java snapshot: ${sc.name}`, () => {
    const want = sc.ops.find((o) => o.op === 'readParty').result;
    assert.deepEqual(plain(readParty(bankOf(sc.bank), sc.spanish)), want);
  });
}

test('readParty returns null for the invalid images and a snapshot for valid ones', () => {
  const sc = Object.fromEntries(fixture('mons').map((s) => [s.name, s]));
  for (const name of ['empty', 'invalid-count7', 'invalid-no-terminator', 'invalid-hp', 'invalid-species0', 'invalid-name']) {
    assert.equal(readParty(bankOf(sc[name].bank), true), null, name);
  }
  assert.equal(readParty(bankOf(sc.party3.bank), true).mons.length, 3);
  assert.equal(readParty(bankOf(sc.battle.bank), true).inBattle, true);
});

test('Snapshot.caught(species) and indexOf(key) work', () => {
  const s = readParty(bankOf(fixture('mons').find((x) => x.name === 'party3').bank), true);
  s.caughtBits.fill(0);
  s.caughtBits[3] = 0b100;
  assert.equal(s.caught(27), true);
  assert.equal(s.caught(26), false);
  assert.equal(s.indexOf(s.mons[1].key), 1);
  assert.equal(s.indexOf(-1), -1);
});
