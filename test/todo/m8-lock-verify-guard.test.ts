// TODO(M8): marked test.fails, so CI stays green while the run-lock service
// doesn't yet call assertRulesVerified() (A7). Once M8 wires it, this starts
// "unexpectedly passing" and turns red: then delete this file and keep the real
// lock test. Listed as a blocker in docs/GO-LIVE.md.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

const payroll = new URL('../../src/modules/payroll', import.meta.url).pathname;

test.fails('TODO(M8): the run-lock service calls assertRulesVerified()', () => {
  const sources = existsSync(payroll)
    ? readdirSync(payroll).filter((f) => f.endsWith('.ts')).map((f) => readFileSync(join(payroll, f), 'utf8'))
    : [];
  const wired = sources.some((src) => /\block\b/i.test(src) && src.includes('assertRulesVerified('));
  expect(wired, 'M8: call assertRulesVerified() inside the run-lock service, then delete this TODO test').toBe(true);
});
