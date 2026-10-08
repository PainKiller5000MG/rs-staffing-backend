import { expect, test } from 'vitest';
import { assertRulesVerified, type UsedRuleRow } from '../../src/lib/rules-verified.ts';

const rows: UsedRuleRow[] = [
  { table: 'statutory_rules', id: 'r1', note: 'Decision 8: ₹25,000 from 17 Sep 2026' },
  { table: 'pt_slabs', id: 'p1', note: 'VERIFY: placeholder figure' },
  { table: 'min_wages', id: 'm1', note: null },
];

test('production: a VERIFY row blocks the lock, naming the rows', () => {
  expect(() => assertRulesVerified(rows, 'production')).toThrow(
    expect.objectContaining({ status: 422, code: 'RULES_UNVERIFIED', details: { rules: [{ table: 'pt_slabs', id: 'p1' }] } }),
  );
});

test('production: confirmed rows lock', () => {
  expect(() => assertRulesVerified(rows.filter((r) => r.id !== 'p1'), 'production')).not.toThrow();
});

test('outside production the guard is skipped', () => {
  expect(() => assertRulesVerified(rows, 'development')).not.toThrow();
  expect(() => assertRulesVerified(rows, 'test')).not.toThrow();
});
