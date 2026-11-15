---
name: story
description: Build RS Staffing backend user stories end to end (contract → tests → code → gate → commit). Use when asked to build, implement, continue or finish a story, an area like M2-CLI, or a module like M2, or "what's next".
argument-hint: "<story ids, area prefix or module>  e.g. M2-CLI-01..06 | M2-SIT | M7 | next"
---

# /story — build stories to production quality on a small token budget

Arguments: `$ARGUMENTS` (story ids, a range like `M2-CLI-01..06`, an area prefix `M2-SIT`, a module `M2`, or `next`).
For `next` or a module: run `npm run story -- next 12`, take the first area (same `Mx-AAA` prefix) and
build it. One session = one area (3–8 stories). Stop after the area and suggest `/clear`.

## Budget rules (follow strictly)

- Story text only via `npm run story -- show <prefix>` (one call for the whole area). Never open `docs/USER-STORIES.md`.
- Columns only via `npm run model -- <Model...>`. Never open `contract.d.ts`, `contract.json`, `openapi.json`.
- Read a reference file (e.g. `src/modules/users/users.service.ts`) only when you need its exact pattern, once per session, with an offset/limit when you know where.
- Don't re-read files you just wrote. Don't spawn subagents. Don't paste test output back; `npm run check` already trims it.
- Ask the user only for blocking product questions, all at once in a single AskUserQuestion, and record every answer in `docs/DECISIONS.md`.

## 1. Load the area (≈4 calls)

1. `npm run story -- show <prefix>` — stories with numbered ACs.
2. `npm run story -- section <Mn>` once, then `section <Mn> edge`, plus `api`/`tables`/`worked` if the module has them and they touch this area.
3. `grep -n "<Mn>\|<area>" docs/DECISIONS.md` — prior answers and open calls. A story listed under Open → ask before building it.
4. `npm run model -- <the models involved>`; `ls src/modules/<name>` if it exists.

Then write a short plan in chat (≤ 12 lines): per story, the endpoints, rules, error codes and contract gaps.
A story already ✓ in `npm run story -- list <Mn>` is skipped unless asked.

## 2. Contract first (only if a column/table/check is missing)

Edit `src/prisma/contract.prisma` for every gap in the area at once → `npm run contract:emit` →
`npm run migration:plan -- <slug>` → `npm run seed:reset`. Constraints belong in the DB: unique, FK, CHECK,
`approved_by <> created_by`, exclusion (no-overlap) in `sql/001_extras.sql` via a new migration step. Add seed
rows in `seed/data.ts` when tests need them. Commit alone: `contract: <what>`.

## 3. Tests first

- New module: `npm run new-module -- <plural> <Model>` (never overwrites).
- `npm run story -- todo <IDs> --out test/api/<name>.test.ts` (and/or `test/services/…`, `test/engine/…`).
- Turn every `test.todo` into a real test. **Each test title keeps the story id and the AC numbers it proves**,
  e.g. `test('M2-CLI-01 AC3: GSTIN with a bad checksum → 422', …)`. One test may prove several (`AC1 AC2`).
- An AC that the backend can't own (pure UI, or another module not built yet) gets a comment with a reason
  in the test file: `// M2-CLI-04 AC3 n/a: Excel export is M11-EXP-01`. Never use n/a to skip real work.
- Rules go in `test/services` with fakes (fast); permissions, validation, DB constraints, audit and scoping go in `test/api`.

### Edge-case checklist — every write endpoint gets these where they apply

| Case | Expect |
|---|---|
| no session / role without the permission (incl. AUDITOR on writes, SUPERVISOR, EMPLOYEE) | 401 / 403 `FORBIDDEN` |
| supervisor asks for a site outside their scope | 404 `NOT_FOUND` |
| missing/blank required field, bad format, too long, wrong case, untrimmed input | 422 `VALIDATION_FAILED` with field `path` |
| duplicate unique key (incl. case variants after normalising) | 409 `DUPLICATE` |
| unknown id; FK to a missing row | 404 / 409 `REFERENCE_MISSING` |
| parent inactive/closed (client, site, employee) | 422 rule error with a specific code |
| dated row overlapping an existing one; closing sets `effective_to`, never edits in place | 409 `OVERLAP` |
| maker-checker: creator approves own entry; pending row has no effect | 403/422 `MAKER_CHECKER`; no effect asserted |
| audit row written in the same transaction with before/after; PII masked in it | row exists, values masked |
| money POST retried with the same Idempotency-Key | same response, one record |
| list: filters combined, search case-insensitive, cursor paging, empty result, `limit` bounds | correct page, stable order |
| immutability rules from the story (e.g. code fixed after first payroll) | 422 with the story's reason |

Engine stories (`src/engine`, pure functions) instead get: every worked example to the paisa, the exact
ceiling/threshold value and ±1 paisa, zero paid days, mid-month join and exit, a rule whose effective date
falls inside the wage month (use the wage month's rule), 28/29/30/31-day months, rounding direction, and
negative/zero inputs refused.

## 4. Code

Order: schemas → repository → service → controller → module registration. Follow CLAUDE.md hard rules.
- Service holds every rule and calls `audit(ctx, '<entity>.<action>', '<entity>', before, after)` on writes.
- Errors: add factories to `<name>.errors.ts` with stable UPPER_SNAKE codes.
- Route summary ends with the story id: `'Create a client (M2-CLI-01)'`. Writes need `audit:`; money-creating POSTs `idempotent: true`.
- Permissions from `src/lib/permissions.ts` (`rolesWith('sites.write')`); add a key there only if none fits (and its test).

## 5. Gate, then commit — per story

1. Iterate with `npm run check -- test/api/<name>.test.ts test/services/<name>.service.test.ts`.
2. Before each commit: `npm run check -- --story <ID>` (full suite + AC gate). Must print `CHECK PASSED`.
3. `git add` the specific files (code, tests, regenerated `openapi.json`, `src/prisma/*`, migrations) — then
   `git commit -m "<ID>: <story title>" -m "Co-Authored-By: <the model you are> <noreply@anthropic.com>"`.
   (Use the model you are; one story per commit; a shared refactor may be its own commit. Stories that share one module and one set of schemas may go in a single commit named `<first ID>..<last ID>: <what>`; say so in the closing reply.)
4. If a test fails twice for the same reason, stop guessing: read the failing code path once, fix the cause.
   Never weaken an assertion, a constraint or the gate to get green.

## 6. Close the area

- `npm run story -- list <Mn>` to show ✓ marks, and `npm run story -- status` for the totals.
- Note any new open question in `docs/DECISIONS.md` and any launch blocker in `docs/GO-LIVE.md`.
- Reply in ≤ 10 lines: stories done, commits, anything skipped or n/a and why, open questions. Then suggest
  `/clear` and the next area (`npm run story -- next 8`).
