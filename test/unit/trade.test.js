import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../helpers/fixtures.js';
import { hex, unhex } from '../helpers/wram.js';
import { PREFIX, crc32, encode, find, decode } from '../../public/js/trade.js';

const vectors = fixture('trade');
const valid = vectors.filter((v) => v.decoded !== null);
const invalid = vectors.filter((v) => v.decoded === null);
const packedOf = (v) => ({ listed: v.listed, struct: unhex(v.struct), ot: unhex(v.ot), nick: unhex(v.nick) });
const decodedShape = (o) => o && {
  listed: o.mon.listed, struct: hex(o.mon.struct), ot: hex(o.mon.ot), nick: hex(o.mon.nick),
  fromSpanish: o.fromSpanish, id: o.id, species: o.species, level: o.level, egg: o.egg,
};

test('crc32 of "123456789" is 0xCBF43926', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('the fixtures hold both valid and invalid cases', () => {
  assert.ok(valid.length >= 20);
  assert.ok(invalid.length >= 8);
  assert.ok(valid.some((v) => v.decoded.egg));
  assert.ok(valid.some((v) => v.spanish) && valid.some((v) => !v.spanish));
});

for (const v of valid) {
  test(`encode with the Java nonce reproduces the Java code: ${v.name}`, () => {
    assert.equal(encode(packedOf(v), v.spanish, unhex(v.nonce)), v.code);
  });
  test(`decode matches the Java offer: ${v.name}`, () => {
    assert.deepEqual(decodedShape(decode(v.code)), v.decoded);
  });
}

for (const v of invalid) {
  test(`decode returns null for ${v.name}`, () => {
    assert.equal(decode(v.code), null);
  });
}

test('encode produces PKC1- plus 130 Base32 characters', () => {
  const v = valid[0];
  const code = encode(packedOf(v), v.spanish);
  assert.match(code, /^PKC1-[A-Z2-7]{130}$/);
  assert.equal(PREFIX, 'PKC1-');
  assert.equal(decode(code).id.length, 8);
});

test('encode picks a fresh random nonce each time', () => {
  const v = valid[0];
  assert.notEqual(encode(packedOf(v), v.spanish), encode(packedOf(v), v.spanish));
});

// RF1: a code pasted inside noisy text, in lowercase, or damaged.
test('find extracts a code from a WhatsApp message with formatting characters', () => {
  const code = valid[0].code;
  assert.equal(find(`Hola! 🐉 *${code}* gracias`), code);
  assert.equal(find(`_${code}_`), code);
  assert.equal(find(`línea 1\n${code}\nlínea 3`), code);
});

test('find accepts lowercase and normalises it', () => {
  const code = valid[0].code;
  assert.equal(find(code.toLowerCase()), code);
  assert.equal(decode(code.toLowerCase()).species, valid[0].decoded.species);
});

test('find returns null for null, empty and code-less text', () => {
  assert.equal(find(null), null);
  assert.equal(find(undefined), null);
  assert.equal(find(''), null);
  assert.equal(find('hola, ¿qué tal?'), null);
  assert.equal(find('PKC1-ABC'), null);
});

test('decode never throws on damaged or odd input', () => {
  const code = valid[0].code;
  const swapped = code.slice(0, 30) + (code[30] === 'A' ? 'B' : 'A') + code.slice(31);
  assert.equal(decode(swapped), null);
  assert.equal(decode(code.slice(0, 60)), null);
  for (const bad of ['1', '8', '0']) {
    assert.equal(decode(code.slice(0, 15) + bad + code.slice(16)), null, `char ${bad}`);
  }
  for (const odd of [null, undefined, '', 42, {}, 'PKC1-']) {
    assert.equal(decode(odd), null);
  }
});
