# RS Staffing backend

Payroll and staffing ERP API for an Indian manpower contractor (5,000+ workers, 600+ clients). Goes to
production and pays real wages: correctness beats speed, but don't spend tokens you don't need to.
Backend only (no frontend in this project).

Stack: Node ≥ 22 (runs `.ts` directly), Hono + `@hono/zod-openapi`, Prisma ORM 8 (Postgres 16), Better
Auth (phone OTP), awilix DI, pg-boss, vitest, Temporal dates, bigint paise.

## Commands (prefer these over reading files)

| Need | Command |
|---|---|
| Progress / what's next | `npm run story -- status` · `npm run story -- next 10` |
| A story's text + numbered ACs | `npm run story -- show M2-CLI-01` (or a prefix: `M2-CLI`) |
| A module's edge cases / API / tables / worked examples / open questions | `npm run story -- section M4` then `npm run story -- section M4 edge` |
| Test skeletons, one `test.todo` per AC | `npm run story -- todo M2-CLI-01 --out test/api/clients.test.ts` |
| AC gate (is every AC tested?) | `npm run story -- check M2-CLI-01` |
| A model's columns | `npm run model -- Client Site` (`--list` for names) |
| New module skeleton | `npm run new-module -- clients Client` |
| Verify | `npm run check -- <test files>` while iterating; `npm run check -- --story <IDs>` before commit |
| DB | `docker start rs-staffing-pg` · `npm run seed:reset` after a new migration |

## Never read these (huge; use the commands above)

`docs/USER-STORIES.md` (275 KB) · `src/prisma/contract.d.ts` (930 KB) · `src/prisma/contract.json` ·
`openapi.json` · `package-lock.json` · `migrations/**/ops.json` · `node_modules`. Read `contract.prisma` only
through `npm run model`.

## Where things are

- `src/core/` app, route registry (`routes.ts`: roles → scope → validation → tx → audit), errors, audit, DI
- `src/lib/` money (rounding), dates, permissions (`rolesWith('x.write')`), shared zod (`Paise`, `listOf`, `CursorQuery`), crypto, sms, storage
- `src/modules/<name>/` schemas · repository (queries only) · service (rules + `audit()`) · controller (routes only) · errors · module
- `src/modules/users/` is the reference module: copy its patterns (maker-checker, pagination, audit) from there
- `src/engine/` pure calculation, `rule-codes.ts` for every statutory value
- `test/services` (fakes, no DB) · `test/api` (seeded DB, `testApp()` from `test/helpers.ts`, logins via `mobileOf('admin'|'hr'|'supB'…)`) · `test/engine`
- `docs/HOW-TO-CODE-STORIES.md` the full recipe and rules · `docs/DECISIONS.md` decisions and open calls · `docs/GO-LIVE.md` launch checklist

## Hard rules (details in docs/HOW-TO-CODE-STORIES.md)

- Never loosen a DB constraint, check, trigger or grant to make code pass. Stop and ask.
- Contract change = edit `contract.prisma` → `npm run contract:emit` → `npm run migration:plan -- <slug>` → `npm run seed:reset`. Never edit an applied migration.
- Money: bigint paise, `*Paise` names, round only via `src/lib/money.ts`. Dates: Temporal, never JS `Date` for wage months.
- No hard deletes; dated rows close with `effective_to`. Maker-checker: creator can't approve; pending grants nothing.
- Never log or return full Aadhaar, bank account numbers or DOB.
- Statutory values come from rule rows (`RuleCode`), never literals.
- Ask before: changing a statutory rule, upgrading Prisma/Better Auth, adding a dependency, or overriding docs/DECISIONS.md.
- A story is done only when `npm run story -- check <ID>` passes and `npm run check` is green. Commit `<ID>: <title>`, one per story. Don't push unless asked.

To build stories use the `/story` skill (`.claude/skills/story/SKILL.md`).

## Parallel lanes

Several modules can be built at once, each in its own worktree with its own database:
`node scripts/lane.ts add <name> <port>` (port 5433+) creates `../lanes/<name>` (branch `lane/<name>`); start Claude Code there.
`node scripts/lane.ts rm <name>` removes it; `list` shows them. Inside a lane: commit only on the lane branch, never push.
Don't touch files outside your module except the shared registries (`src/modules/index.ts`, `src/lib/permissions.ts`,
`docs/DECISIONS.md`). A contract change in a lane is allowed only for tables your module owns; migrations form one chain,
so when two branches both add one, the second to merge deletes its migration folder and re-runs `migration:plan` on top of main.
