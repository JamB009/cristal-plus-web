// Usage: node tools/decode-code.mjs "<text containing a PKC1-… code>"
// Prints what a trade code holds, or "código inválido" (exit 1). Handy to check codes from the Android app.
import { readFileSync } from 'node:fs';
import { decode, find } from '../public/js/trade.js';
import { textRaw } from '../public/js/text.js';
import { nameOf } from '../public/js/names.js';

const names = JSON.parse(readFileSync(new URL('../public/data/pokemon.json', import.meta.url), 'utf8')).names;
const offer = decode(process.argv[2] ?? '');
if (!offer) {
  console.log(`código inválido${find(process.argv[2]) ? ' (CRC o datos incorrectos)' : ' (no se encontró un PKC1-…)'}`);
  process.exit(1);
}
const lang = offer.fromSpanish;
console.log(`Especie: ${nameOf(names, offer.species)} (#${offer.species})${offer.egg ? ' — HUEVO' : ''}`);
console.log(`Nivel: ${offer.level}`);
console.log(`Apodo: ${offer.egg ? '(huevo)' : textRaw(offer.mon.nick, lang)}`);
console.log(`Entrenador original: ${textRaw(offer.mon.ot, lang)}`);
console.log(`Idioma de origen: ${lang ? 'español' : 'inglés'}`);
console.log(`Id: ${offer.id}`);
