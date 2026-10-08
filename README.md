# rs-staffing-backend

API, worker, payroll engine and database for RS Staffing. Node.js ≥ 22.18 runs the
TypeScript directly (type stripping, no build step); PostgreSQL 16; Prisma ORM 8 (rc);
Hono + zod-openapi; Better Auth (phone OTP); awilix; pg-boss; pino; vitest.

The working brief and its Decisions log are the source of truth; user stories live in
`../docs/RS Staffing — User Stories.md`. Work is planned, branched and tested by story ID.

## Setup

```bash
npm install
cp .env.example .env        # set DATABASE_URL (a Postgres where you may CREATE ROLE)
npm run seed:reset          # wipe → migrate → Better Auth tables → seed
npm run dev                 # API on :3000, spec at /openapi.json
npm run dev:worker          # pg-boss worker
```

Log in as any seeded user: `POST /api/auth/phone-number/send-otp {"phoneNumber":"+919000000001"}`.
The mock SMS provider prints the OTP to the console and writes it to `app.sms_outbox`; then
`POST /api/auth/phone-number/verify {"phoneNumber":"+919000000001","code":"…"}` sets the session cookie.

| Mobile | Role | Notes |
|---|---|---|
| 9000000001 | ADMIN | |
| 9000000002 | PAYROLL | |
| 9000000003 | HR | |
| 9000000004 | ACCOUNTS | |
| 9000000005 | AUDITOR | access expires 31 Dec 2026 |
| 9000000006 | EMPLOYEE | RS000001 (E1 structure) |
| 9000000010 | SUPERVISOR | NTX-BPL, NTX-MDP, VHC-IDR |
| 9000000011 | SUPERVISOR | VHC-UJN, CCW-GWL, CCW-KOT; NTX-BPL pending approval |

The seed (`seed/data.ts`) also holds 3 clients / 6 sites (CCW-KOT in Rajasthan has no rules),
47 employees with the M7 worked-example structures and test cases (ESI-ceiling, newly mandatory
PF, PF full wages, joined 21 Sep, exited 25 Sep with an open F&F, on notice), September 2026
attendance, the 17 Sep client holiday, leave openings, a pending supervisor correction, a pending
pay setting, 2 advances, 8 daily-wage workers and a closed cash release (₹16,550 = ₹13,000 paid +
₹3,550 returned).

## Environment

Validated at boot by `src/core/config.ts`; the process exits listing every problem.

| Variable | Required | |
|---|---|---|
| `DATABASE_URL` | always | PostgreSQL ≥ 15 |
| `BETTER_AUTH_SECRET` | production | ≥ 32 chars (dev/test use a fixed secret) |
| `BETTER_AUTH_URL` | | default `http://localhost:3000` |
| `WEB_ORIGIN` | | CORS + Better Auth trusted origin, default `http://localhost:3001` |
| `DATA_KEY`, `HMAC_KEY` | production | 32 bytes base64 (`openssl rand -base64 32`); dev/test use fixed keys |
| `NODE_ENV`, `PORT`, `LOG_LEVEL` | | |
| `SMS_PROVIDER` | | `mock` only (P0) |
| `ALLOW_DB_RESET` | remote DBs | set to the DB's hostname to let `seed:reset` wipe it |

## Scripts

| | |
|---|---|
| `dev`, `dev:worker` / `start`, `worker` | API (`src/main.ts`) and worker (`src/worker.ts`), with / without restart on change |
| `typecheck`, `test`, `test:unit`, `test:engine` | `test:unit` needs no database; `test` expects `seed:reset` first |
| `build` | typecheck + regenerate `openapi.json` (commit it) |
| `seed:reset`, `seed` | wipe + migrate + auth tables + seed / seed an already-migrated DB |
| `contract:emit`, `migration:plan -- <slug>`, `migration:check`, `db:migrate`, `db:verify` | Prisma 8 |
| `auth:migrate` | Better Auth's tables in the `auth` schema (its own CLI, not Prisma) |
| `gen:openapi` | write `openapi.json` |

Before every PR: `npm run typecheck`, `npm test` (after `seed:reset`), `npm run contract:emit`
with no diff, `npm run db:verify`. CI runs the same against a throwaway Postgres 16.

## Architecture

```
src/
  core/      app, container (awilix), module + route registry, context, errors,
             error-handler, guards, audit, events, config, logger
  auth/      Better Auth config, identity gateway, CLI entry
  lib/       crypto, money, dates, sms, roles
  modules/   <name>/ module, controller, service, repository, schemas, errors
  engine/    payroll rules — pure functions, no DB
  jobs/      pg-boss queue names + handlers
  main.ts    API entry          worker.ts   worker entry
seed/        data.ts (declarative), index.ts (builder), reset.ts
migrations/  sql/  scripts/  test/
openapi.json generated from the route schemas — the contract web and mobile build against
```

Every route runs one pipeline (`core/routes.ts`):
**request id → session → role → site scope → zod validation → transaction (writes) → handler → audit (same transaction) → response.**
Startup fails if a route has no `roles` or a write route has no `audit` tag; a write that never
calls `audit()` is rolled back. Errors become HTTP responses only in `core/error-handler.ts`,
always as `{ "error": { "code", "message", "details", "requestId" } }` — Postgres errors are
mapped there (23505 → `DUPLICATE`, 23P01 → `OVERLAP`, 23514 → `MAKER_CHECKER` / named messages /
`INVALID_VALUE`, 23503 → `IN_USE` / `REFERENCE_MISSING`), never leaking SQL or values.

Layers: the **controller** declares routes and calls one service method; the **service** holds
business rules and throws `AppError`s; the **repository** is the only code that touches
`db.orm` (through the request's executor — its transaction on writes); the **engine** is pure.

## Adding a module

Copy `src/modules/users/` and rename:

1. `x.repository.ts` — queries via `executor.orm…`; return plain objects.
2. `x.service.ts` — rules; call `audit(this.#ctx, 'x.action', 'x', before, after)` on every write.
3. `x.schemas.ts` — zod (from `@hono/zod-openapi`) for bodies, params, queries and responses.
4. `x.controller.ts` — `static routes = defineRoutes<XController>([{ method, path, summary, roles, scope?, params?, query?, body?, response, status?, audit?, handler }])`.
5. `x.module.ts` — providers (`asClass(...).scoped()`) and controllers.
6. Register it in `src/modules/index.ts`; add `test/services/x.service.test.ts` (fakes) and
   `test/api/x.test.ts` (seeded DB); run `npm run build` and commit `openapi.json`.

## Rules

- **Money is `bigint` paise.** Only `src/lib/money.ts` rounds, always with an explicit mode. JSON carries paise as strings.
- **Dates are `Temporal.PlainDate`, wage months `Temporal.PlainYearMonth`.** Never JS `Date`. Use `src/lib/dates.ts`: it shares the global polyfill with `db.ts` (the non-global `temporal-polyfill` import yields different classes).
- **No route edits payroll data directly.** Corrections go pending → approve; approver ≠ maker.
- **Never log or return** full Aadhaar, account numbers or DOB (pino redacts them; audit rows mask them).
- **Code runs under Node type stripping:** relative imports end in `.ts`, `import type` for types, no enums / namespaces / parameter properties (`erasableSyntaxOnly` enforces it).

## Database

- Edit `src/prisma/contract.prisma` → `npm run contract:emit` → `npm run migration:plan -- <slug>` → review → `npm run db:migrate`.
- Raw SQL after the init migration goes into the next planned migration's `migration.ts` as a
  `rawSql(...)` step, then `node migrations/app/<dir>/migration.ts` (run from the repo root).
- Check constraints are named `<name>_<8 hex>` by Prisma 8; the error handler strips the suffix.
- `20261005T0008_better_auth_users` drops `app.sessions` and `users.firebase_uid`, adds
  `users.auth_user_id`, adds approval columns + maker-checker to `user_site_scopes` (no-overlap now
  applies to approved rows only), and creates the `auth` schema.
- The init migration creates roles (`rs_app`, `rs_vault`): the migrating user needs `CREATE ROLE`
  (local Postgres, RDS master user, Supabase's postgres user; not Prisma Postgres).

## Deploy

One image (`Dockerfile`), two processes on the Mumbai server: the default command is the API;
run the worker with `node src/worker.ts`; run `npm run db:migrate` and `npm run auth:migrate`
from the same image before rollout. Branches: `main` (production), `dev` (staging), feature
branches via PRs.

## Decisions applied (8 Oct 2026)

- A site outside a supervisor's scope answers **404 `NOT_FOUND`**, exactly like a site that
  doesn't exist (M1-SCP-02); a wrong role is 403.
- Revoked site scopes are excluded from `user_site_scopes_no_overlap`, so a site can be granted
  again after a revoke. Revoking takes effect at once and needs no checker; assigning does.
- Rule codes come only from `src/engine/rule-codes.ts` (M7-RUL-01 names + `PF_SPLIT_METHOD`);
  a test fails on any rule-code string literal elsewhere.
- `20261004T0748_init` is the init migration; the old `rs-staffing-db` project is retired.
- Rule rows whose note starts `VERIFY` block a production payroll lock (`src/lib/rules-verified.ts`).
- Tests create their own rows (or roll back), so `npm test` re-runs without a reset; they don't
  assert seed counts except the cash release totals and the named test cases.

## Open flags

- **DLT**: a DLT-registered OTP template and SMS provider are a production launch blocker.
- Pre-launch work is tracked in [docs/GO-LIVE.md](docs/GO-LIVE.md) (audit-log partitioning,
  VERIFY rule rows, DLT, secrets).
- Not built yet: idle timeout (M1-LOG-06), lockout (M1-SEC-06), `lib/storage.ts`.
