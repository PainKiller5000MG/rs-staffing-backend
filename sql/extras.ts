// Turns sql/001_extras.sql into rawSql migration steps.
// Each "-- @@step <label>" block becomes one step, appended to the init migration.
import { readFileSync } from 'node:fs';
import { rawSql } from '@prisma/orm-postgres/migration';

export function extrasSteps() {
  const text = readFileSync(new URL('./001_extras.sql', import.meta.url), 'utf8');
  return text
    .split(/^-- @@step /m)
    .slice(1)
    .map((block, i) => {
      const nl = block.indexOf('\n');
      const label = block.slice(0, nl).trim();
      const sql = block.slice(nl + 1).trim();
      return rawSql({
        id: `extras.${String(i + 1).padStart(2, '0')}`,
        label,
        operationClass: 'additive',
        target: { id: 'postgres' },
        precheck: [],
        execute: [{ description: label, sql, params: [] }],
        postcheck: [],
      });
    });
}
