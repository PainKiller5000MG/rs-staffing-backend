// npm run seed:reset — wipe the database, re-apply every migration, create
// Better Auth's tables, then seed. Destroys all data, so it refuses to run:
//   - when NODE_ENV=production, and
//   - against any non-local host unless ALLOW_DB_RESET is set to that hostname.
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { config } from '../src/core/config.ts';
import { db } from '../src/prisma/db.ts';
import { seed } from './index.ts';

const cfg = config();
const url = new URL(cfg.DATABASE_URL);
const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname);

if (cfg.NODE_ENV === 'production') {
  console.error('seed:reset refuses to run with NODE_ENV=production');
  process.exit(1);
}
if (!local && process.env['ALLOW_DB_RESET'] !== url.hostname) {
  console.error(`seed:reset would wipe ${url.hostname}/${url.pathname.slice(1)}.`);
  console.error(`Set ALLOW_DB_RESET=${url.hostname} to confirm this database is disposable.`);
  process.exit(1);
}

const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { stdio: 'inherit', env: process.env });

console.log(`resetting ${url.hostname}/${url.pathname.slice(1)}`);
const client = new pg.Client({ connectionString: cfg.DATABASE_URL });
await client.connect();
await client.query('DROP SCHEMA IF EXISTS app, audit, vault, auth, prisma_contract, pgboss CASCADE');
await client.end();

run('npx', ['prisma', 'db', 'migrate', '--advance-ref', 'db']);
run('npx', ['auth', 'migrate', '--config', 'src/auth/cli.ts', '--yes']);

const { counts } = await seed();
console.log('seeded:', counts);
await db.close();
