// One command before every commit. Prints one line per passing step and only
// the failures, so a run costs a few lines of output instead of pages.
//
//   npm run check                         typecheck, contract, migrations, openapi, every test
//   npm run check -- test/api/clients.test.ts test/services/clients.service.test.ts
//                                         same, but only these test files
//   npm run check -- --fast               typecheck + unit tests (no database)
//   npm run check -- --story M2-CLI-01 M2-CLI-02 [files...]
//                                         also runs the AC-coverage gate for those stories
//
// Exit code 0 only when every step passed. API/DB tests need Postgres
// (docker start rs-staffing-pg; npm run seed:reset once after new migrations).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const BIN = join(ROOT, 'node_modules/.bin');
const MAX_LINES = 120;

const argv = process.argv.slice(2);
const fast = argv.includes('--fast');
const storyAt = argv.indexOf('--story');
const stories: string[] = [];
const files: string[] = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]!;
  if (a.startsWith('--')) continue;
  if (storyAt >= 0 && i > storyAt && /^M\d+-/.test(a)) stories.push(a);
  else files.push(a);
}

let failed = false;

function run(name: string, cmd: string, args: string[], filter?: (out: string) => string) {
  const t = Date.now();
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' } });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const secs = ((Date.now() - t) / 1000).toFixed(1);
  if (r.status === 0) {
    console.log(`ok   ${name} (${secs}s)${filter ? `  ${filter(out)}` : ''}`);
    return out;
  }
  failed = true;
  console.log(`FAIL ${name} (${secs}s)`);
  const ls = out.split('\n').filter((l) => l.trim() && !/^[·.\s]+$/.test(l));
  console.log(ls.slice(0, MAX_LINES).join('\n'));
  if (ls.length > MAX_LINES) console.log(`... ${ls.length - MAX_LINES} more lines (run the step directly to see them)`);
  return out;
}

function dbUp(): Promise<boolean> {
  let url = process.env['DATABASE_URL'];
  if (!url) {
    try {
      url = readFileSync(join(ROOT, '.env'), 'utf8').match(/^DATABASE_URL="?([^"\n]+)/m)?.[1];
    } catch {}
  }
  if (!url) return Promise.resolve(false);
  const u = new URL(url);
  return new Promise((res) => {
    const s = connect({ host: u.hostname, port: Number(u.port || 5432), timeout: 1500 });
    s.on('connect', () => (s.destroy(), res(true)));
    s.on('error', () => res(false));
    s.on('timeout', () => (s.destroy(), res(false)));
  });
}

const vitestSummary = (out: string) =>
  out
    .split('\n')
    .filter((l) => /^\s*(Tests|Test Files)\s/.test(l))
    .map((l) => l.trim().replace(/\s+/g, ' '))
    .join(' · ');

run('typecheck', join(BIN, 'tsc'), ['--noEmit', '--pretty', 'false']);

if (!fast) {
  run('contract emit', join(BIN, 'prisma'), ['contract', 'emit'], () => 'regenerated src/prisma (commit it with the contract)');
  run('migration check', join(BIN, 'prisma'), ['migration', 'check']);
  run('openapi', process.execPath, ['scripts/gen-openapi.ts'], () => 'regenerated openapi.json (commit it)');
}

const vitest = join(BIN, 'vitest');
const vargs = ['run', '--reporter=dot', '--silent=true'];
if (fast) {
  run('unit tests', vitest, [...vargs, 'test/lib', 'test/services', 'test/engine', 'test/core/error-handler.test.ts', 'test/core/guards.test.ts'], vitestSummary);
} else if (await dbUp()) {
  run(files.length ? `tests (${files.length} files)` : 'all tests', vitest, [...vargs, ...files], vitestSummary);
} else {
  failed = true;
  console.log('FAIL tests: Postgres is not reachable. Start it: docker start rs-staffing-pg (then npm run seed:reset if migrations changed)');
}

if (stories.length) run('AC coverage', process.execPath, ['scripts/stories.ts', 'check', ...stories], (o) => o.trim().split('\n').join(' · '));

console.log(failed ? '\nCHECK FAILED' : '\nCHECK PASSED');
process.exit(failed ? 1 : 0);
