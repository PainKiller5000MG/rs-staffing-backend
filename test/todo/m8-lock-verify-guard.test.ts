// TODO(M8): fails on purpose until the payroll run-lock service calls
// assertRulesVerified() (A7). Delete this file once it's wired and covered by
// a real lock test (production lock refused with RULES_UNVERIFIED).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

const payroll = new URL('../../src/modules/payroll', import.meta.url).pathname;

test('TODO(M8): the run-lock service calls assertRulesVerified()', () => {
  const sources = existsSync(payroll)
    ? readdirSync(payroll).filter((f) => f.endsWith('.ts')).map((f) => readFileSync(join(payroll, f), 'utf8'))
    : [];
  const wired = sources.some((src) => /\block\b/i.test(src) && src.includes('assertRulesVerified('));
  expect(wired, 'M8: call assertRulesVerified() inside the run-lock service, then delete this TODO test').toBe(true);
});
