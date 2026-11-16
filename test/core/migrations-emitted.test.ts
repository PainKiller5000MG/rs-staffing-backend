import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

// A step added to migration.ts but never re-emitted (node migration.ts) is silently NOT applied:
// ops.json is what runs. This caught a missing trigger once; keep it.
test('every step id in each migration.ts is in its ops.json', () => {
  const root = join(import.meta.dirname, '../../migrations/app');
  const missing: string[] = [];
  for (const dir of readdirSync(root).filter((d) => /^\d/.test(d))) {
    const src = readFileSync(join(root, dir, 'migration.ts'), 'utf8');
    const ops = readFileSync(join(root, dir, 'ops.json'), 'utf8');
    for (const m of src.matchAll(/\bid: '([a-z0-9_.]+)'/g)) if (!ops.includes(`"${m[1]}"`)) missing.push(`${dir}: ${m[1]}`);
    if (/\brawSql\(/.test(src) && !/import \{[^}]*\brawSql\b[^}]*\} from/s.test(src)) missing.push(`${dir}: rawSql not imported`);
  }
  expect(missing).toEqual([]);
});
