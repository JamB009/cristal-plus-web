import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export function fixture(name) {
  return JSON.parse(readFileSync(join(here, '..', 'fixtures', `${name}.json`), 'utf8'));
}
