# How to code a story

Every remaining story follows one recipe. The **Users module** (`src/modules/users/`) is the
template to copy. There are two kinds of story:

- **API stories** (M2, M3, M12 and most others): an endpoint with rules, audit and tests.
- **Engine stories** (M7, M13, M14, parts of M8): pure calculation, tested against the stories'
  worked examples to the paisa.

Stories live in `docs/USER-STORIES.md` (read them with `npm run story -- show <ID>`, never the whole file). Each has an ID like `M2-CLI-01`. The `/story` skill (`.claude/skills/story/SKILL.md`) runs this whole recipe; `npm run check` and `npm run story -- check <ID>` are the gates.

---

## The loop (every story)

1. **Read the story.** List its acceptance criteria. Each criterion becomes at least one test.
2. **Contract change first, if needed.**
   - Edit `src/prisma/contract.prisma`.
   - Run `npm run contract:emit`, then `npm run migration:plan -- <slug>`.
   - Make it its own small commit at the start of the module. Never edit a merged migration.
3. **Write the tests first,** then the code, then run until green.
4. **Check before committing:**
   - `npm run typecheck`
   - `npm test`
   - `npm run contract:emit` produces no diff
   - `npm run gen:openapi` (commit `openapi.json`)
5. **Commit as `<STORY-ID>: <title>`.** One commit per story. Push at the end of each module.

---

## API stories: where each piece goes

Copy `src/modules/users/` to `src/modules/<name>/` and rename.

| File | Holds |
|---|---|
| `x.schemas.ts` | Zod schemas (from `@hono/zod-openapi`) for body, params, query and response. They validate requests **and** generate `openapi.json`. Money fields use the shared `Paise` type from `src/lib/schemas.ts`. |
| `x.repository.ts` | Queries only, through `executor.orm…`. Returns plain objects. No business rules. |
| `x.service.ts` | The business rules from the acceptance criteria. Throws `AppError`s (`RuleError`, `ConflictError`, `NotFoundError`…). Calls `audit(ctx, 'x.action', 'x', before, after)` on every write. |
| `x.controller.ts` | `static routes = defineRoutes<XController>([...])`: one entry per endpoint. Calls one service method. No logic. |
| `x.errors.ts` | Error factories specific to the module. |
| `x.module.ts` | Registers providers (`asClass(...).scoped()`) and controllers. |
| `src/modules/index.ts` | Add the module here. |
| `test/services/x.service.test.ts` | Rules, against fake repositories (no database). |
| `test/api/x.test.ts` | Endpoint behaviour, against the seeded database. |

### A route entry

```ts
{
  method: 'post',
  path: '/clients',
  summary: 'Create a client (M2-CLI-01)',
  roles: rolesWith('sites.write'),      // from src/lib/permissions.ts
  body: CreateClientBody,
  response: ClientSchema,
  status: 201,
  audit: 'client.create',               // required on every write
  idempotent: true,                     // only for POSTs that create money records
  handler: (c, ctx) => c.service.create(ctx.body()),
}
```

The registry wraps it: request id → session → role → site scope → validation → transaction
(writes) → handler → audit row (same transaction) → response. The app **refuses to start** if a
route has no `roles`, no response schema, or (for writes) no `audit` tag.

### Worked example: "create a client" (M2)

1. The `clients` table exists but lacks fields the story needs (primary state, PAN, addresses, contract dates, work order; contacts table for M2-CLI-02), so M2 starts with a contract change. **The story wins over the current table.** The fields below are illustrative.
2. **Schemas:** `CreateClientBody` (code, name, GSTIN, PF and ESI establishment ids, pay-period
   start day) and `ClientSchema`.
3. **Service rules from the story:**
   - A duplicate code is a database unique constraint, which the error handler turns into
     409 `DUPLICATE`.
   - A missing establishment is a foreign key, which becomes 409 `REFERENCE_MISSING`.
   - Then `audit(ctx, 'client.create', 'client', null, client)`.
4. **Route:** `POST /clients` as above.
5. **Tests:**
   - HR creates a client: 201, and an audit row exists.
   - A duplicate code returns 409 `DUPLICATE`.
   - An Auditor gets 403.
6. Commit: `M2-CLI-01: create client`.

Most of the work is the service rules and the tests; the rest is wiring.

### Supervisor-entered data (maker-checker)

Anything a supervisor enters stays **pending** until a different HQ user approves it.

- Copy the site-scope pattern in `users.service.ts`: create as pending, approve in a separate
  call, refuse approval by the creator (`makerChecker()` error).
- The database enforces it too (`approved_by <> created_by` check). Never weaken that check.
- Pending rows must grant nothing and must not affect payroll.

---

## Engine stories (M7, M13, M14)

Pure functions in `src/engine/`:

- **No database, no clock, no I/O.** Inputs are plain values: bigint paise, Temporal dates, and
  rule values already loaded by the caller.
- **Round only through `src/lib/money.ts`,** with an explicit rounding mode.
- **Law-set values** (rates, ceilings, limits, multipliers, deadlines) come from `RuleCode` in
  `src/engine/rule-codes.ts`. Never write a rate or ceiling in code, and never write a rule code
  as a string literal (a test fails on it).
- A new law-set value means a new `RuleCode` plus a dated seed row in `seed/data.ts`.

### Test-first, from the worked examples

Copy each example's inputs and expected figures from the stories doc into
`test/engine/<story>.test.ts`, one file per example, and assert to the paisa:

| Module | Examples |
|---|---|
| M7 | E1–E10, and the September 2026 PF split (wages 20,000 → PF wages 17,333.33 → employee PF ₹2,080) |
| M8 | R1, R2, F1–F3 |
| M13, M14 | Their own "Worked examples (tests)" sections |

If the engine and the doc disagree, **the doc wins** until the client confirms otherwise.

### Build order inside M7 (from the doc)

rule lookup by wage month → component library → proration by paid days → 50% wage rule →
PF (with the Sep-2026 split) → ESI → PT and LWF → rounding and checks → explainable working →
preview endpoint.

The **service layer** only loads rules and inputs, calls the engine, and saves the result.

---

## Rules for every story

- **Never loosen a database constraint** to make code pass. If a rule seems wrong, stop and ask.
- **Never log or return** full Aadhaar, account numbers or DOB. Audit rows mask them.
- **Dated rows** (rules, settings, salary structures, deployments, bank accounts) end with
  `effective_to`. They are never deleted or edited in place. Overlaps are rejected by the database
  (→ 409 `OVERLAP`).
- **No hard deletes** on business data. Use a status or `effective_to`.
- **Money** is bigint paise everywhere; on the wire it is a string of integer paise (`Paise`).
  Every money field is named `*Paise` (a test scans `openapi.json`).
- **Dates:** `Temporal.PlainDate` for dates, `Temporal.Instant` for timestamps. Never JS `Date`
  for wage months.
- **Money-creating POSTs** (runs, payouts, payments, advances) are marked `idempotent: true`.
- **A story is done** only when every acceptance criterion has a test.
- **Ask before:** changing a statutory rule, upgrading Prisma or Better Auth, adding a dependency
  with native binaries, or changing anything in the Decisions log.

---

## Suggested order

1. **Wave 1:** M2 (clients, sites, establishments, pay settings) → M3 (employees) → M12 (Aadhaar).
2. **In parallel:** the engine (PF with the Sep-2026 split, ESI, PT, LWF, OT, 50% wages, paid
   days), each with its worked-example tests.
3. **Wave 2:** M14, M5, M13, then wire the engine into M7's endpoints.
4. **Wave 3:** M8 (payroll run, lock, payslips, F&F, cash), M11.
5. **Wave 4:** M6, M4, M10, M9, M16.

When M8's run-lock service exists it must call `assertRulesVerified()`
(`src/lib/rules-verified.ts`). `test/todo/m8-lock-verify-guard.test.ts` will go red once it does,
and is then deleted.
