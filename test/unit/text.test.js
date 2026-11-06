import test from 'node:test';
import assert from 'node:assert/strict';
import { NAME_LENGTH, decodeChar, textAt, textRaw, encodeName } from '../../public/js/text.js';

test('encodeName pads an uppercase name with terminators', () => {
  assert.deepEqual(
    [...encodeName('PIKACHU')],
    [0x8f, 0x88, 0x8a, 0x80, 0x82, 0x87, 0x94, 0x50, 0x50, 0x50, 0x50],
  );
  assert.equal(NAME_LENGTH, 11);
});

test('encodeName handles digits, symbols and unknown characters', () => {
  assert.deepEqual([...encodeName('A1.-\'♂♀?')].slice(0, 8), [0x80, 0xf7, 0xe8, 0xe3, 0xe0, 0xef, 0xf5, 0x7f]);
});

test('encodeName keeps at most 10 characters', () => {
  const out = encodeName('ABCDEFGHIJKL');
  assert.equal(out.length, 11);
  assert.equal(out[9], 0x89);
  assert.equal(out[10], 0x50);
});

test('textRaw round-trips a name with a gender symbol', () => {
  assert.equal(textRaw(encodeName('NIDORAN♀'), false), 'NIDORAN♀');
});

test('Spanish characters only decode on the Spanish ROM', () => {
  assert.equal(decodeChar(0xd2, true), 'ñ');
  assert.equal(decodeChar(0xd2, false), null);
  assert.equal(decodeChar(0xea, false), 'é');
  assert.equal(decodeChar(0xe5, true), '¡');
});

test('textAt returns null for a byte below 0x7F', () => {
  assert.equal(textAt(new Uint8Array([0x80, 0x01, 0x50]), 0, 10, false), null);
});

test('textAt returns null when there is no terminator within max', () => {
  assert.equal(textAt(new Uint8Array([0x80, 0x81, 0x82, 0x83, 0x84]), 0, 2, false), null);
});

test('textAt returns null for an empty string and reads from an offset', () => {
  assert.equal(textAt(new Uint8Array([0x50]), 0, 10, false), null);
  assert.equal(textAt(new Uint8Array([0x00, 0x00, 0x80, 0x81, 0x50]), 2, 10, false), 'AB');
});

test('textRaw gives "?" for garbage', () => {
  assert.equal(textRaw(new Uint8Array(11).fill(0x01), false), '?');
});
