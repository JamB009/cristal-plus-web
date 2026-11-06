import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fixture } from '../helpers/fixtures.js';

const tool = fileURLToPath(new URL('../../tools/decode-code.mjs', import.meta.url));
const run = (text) => execFileSync('node', [tool, text], { encoding: 'utf8' });
const valid = fixture('trade').filter((v) => v.decoded);

test('decode-code describes a valid code found inside a message', () => {
  const v = valid.find((x) => x.spanish && !x.decoded.egg);
  const out = run(`Hola *${v.code}* gracias`);
  assert.match(out, new RegExp(`Especie: .* \\(#${v.decoded.species}\\)`));
  assert.match(out, new RegExp(`Nivel: ${v.decoded.level}`));
  assert.match(out, /Idioma de origen: español/);
  assert.match(out, new RegExp(`Id: ${v.decoded.id}`));
});

test('decode-code reports an English origin and eggs', () => {
  const eng = valid.find((x) => !x.spanish);
  assert.match(run(eng.code), /Idioma de origen: inglés/);
  const egg = valid.find((x) => x.decoded.egg);
  assert.match(run(egg.code), /HUEVO/);
});

test('decode-code says "código inválido" for a damaged code and exits non-zero', () => {
  const bad = valid[0].code.slice(0, 80);
  assert.throws(() => run(bad), (e) => /código inválido/.test(e.stdout + e.stderr) && e.status === 1);
  assert.throws(() => run('nada'), (e) => e.status === 1);
});
