// npm run lane -- add <name> <port>   parallel lane: own git worktree (branch lane/<name>), own Postgres on <port>
// npm run lane -- rm <name>           stop its database and remove the worktree (branch is kept)
// npm run lane -- list
// A lane lives in ../lanes/<name>; start Claude Code there. node_modules is shared (symlink).
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const LANES = resolve(ROOT, '..', 'lanes');
const sh = (cmd: string, args: string[], cwd = ROOT) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });
const [cmd, name, portArg] = process.argv.slice(2);
const bad = (m: string): never => (console.error(m), process.exit(1));

if (cmd === 'list') sh('git', ['worktree', 'list']);
else if (!name || !/^[a-z0-9-]+$/.test(name)) bad('usage: lane add <name> <port> | lane rm <name> | lane list');
else {
  const dir = join(LANES, name!);
  const container = `rs-pg-${name}`;
  if (cmd === 'add') {
    const port = Number(portArg);
    if (!(port >= 5433 && port <= 5999)) bad('port must be 5433..5999 (5432 is the main database)');
    if (existsSync(dir)) bad(`${dir} already exists`);
    sh('git', ['worktree', 'add', '-b', `lane/${name}`, dir, 'HEAD']);
    symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'));
    const env = readFileSync(join(ROOT, '.env'), 'utf8');
    const url = env.match(/^DATABASE_URL="?([^"\n]+)/m)?.[1] ?? bad('no DATABASE_URL in .env');
    const u = new URL(url);
    u.port = String(port);
    writeFileSync(join(dir, '.env'), env.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL="${u.toString()}"`));
    const run = spawnSync('docker', ['run', '-d', '--name', container, '-p', `127.0.0.1:${port}:5432`,
      '-e', `POSTGRES_USER=${u.username}`, '-e', `POSTGRES_PASSWORD=${decodeURIComponent(u.password)}`,
      '-e', `POSTGRES_DB=${u.pathname.slice(1)}`, 'postgres:16'], { stdio: 'inherit' });
    if (run.status) bad('docker run failed');
    for (let i = 0; i < 30; i++) {
      if (spawnSync('docker', ['exec', container, 'pg_isready', '-U', u.username]).status === 0) break;
      spawnSync('sleep', ['1']);
    }
    sh('npm', ['run', 'seed:reset'], dir);
    console.log(`\nlane ready: cd ${dir} && claude   (db on :${port})`);
  } else if (cmd === 'rm') {
    spawnSync('docker', ['rm', '-f', container], { stdio: 'inherit' });
    sh('git', ['worktree', 'remove', '--force', dir]);
    console.log(`removed ${dir}; branch lane/${name} kept (merge it, then git branch -d lane/${name})`);
  } else bad('unknown command');
}
