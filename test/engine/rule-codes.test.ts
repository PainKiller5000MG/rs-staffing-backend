// A4: rule codes live only in src/engine/rule-codes.ts. Any other file that
// spells one as a string literal fails here.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, test } from 'vitest';
import { RULE_CODES } from '../../src/engine/rule-codes.ts';

const root = new URL('../..', import.meta.url).pathname;
const SOURCE = join(root, 'src/engine/rule-codes.ts');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : path.endsWith('.ts') ? [path] : [];
  });
}

test('no rule-code string literals outside rule-codes.ts', () => {
  const literal = new RegExp(`['"\`](${RULE_CODES.join('|')})['"\`]`);
  const offenders = ['src', 'seed', 'scripts']
    .flatMap((d) => files(join(root, d)))
    .filter((f) => f !== SOURCE && literal.test(readFileSync(f, 'utf8')))
    .map((f) => relative(root, f));
  expect(offenders).toEqual([]);
});
