// TODO(M3, M5, M7): M2-CLI-05 AC2 says an inactive client gets no new deployments, attendance imports or
// payroll runs. Each of those modules must call ClientsService.assertActive(). Marked test.fails so CI
// stays green until the module exists and calls it; then it "unexpectedly passes" and turns red: delete
// that TODO and keep the module's own CLIENT_INACTIVE test. Listed as a blocker in docs/GO-LIVE.md.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

function callsAssertActive(dir: string, mustMention: RegExp): boolean {
  const path = new URL(`../../src/modules/${dir}`, import.meta.url).pathname;
  if (!existsSync(path)) return false;
  const sources = readdirSync(path).filter((f) => f.endsWith('.service.ts')).map((f) => readFileSync(join(path, f), 'utf8'));
  return sources.some((src) => mustMention.test(src) && src.includes('assertActive('));
}

test.fails('TODO(M3): creating a deployment calls clients.assertActive()', () => {
  expect(callsAssertActive('deployments', /deploy/i), 'M3: call assertActive(client) before a new deployment, then delete this TODO test').toBe(true);
});

test.fails('TODO(M5): creating an attendance import calls clients.assertActive()', () => {
  expect(callsAssertActive('attendance', /import/i), 'M5: call assertActive(client) before an attendance import, then delete this TODO test').toBe(true);
});

test.fails('TODO(M7): creating a payroll run calls clients.assertActive()', () => {
  expect(callsAssertActive('payroll', /run/i), 'M7: call assertActive(client) before a payroll run, then delete this TODO test').toBe(true);
});
