# Decisions (build-time)

Answers that change what the stories say, or settle their open questions. Read this before starting a
module; add to it whenever the user answers a question. The stories doc's own "Decisions log (4 Oct 2026)"
still applies; this file records everything decided after it. Newest first.

Format: `- YYYY-MM-DD · <story ids or area> · <decision> (who decided)`

## Decided

- 2026-11-16 · M2-SIT · Site API choices made while building (the user did not answer the questions, so the safe default was taken; all easy to flip): (1) `sites.code` stays globally UNIQUE, stricter than the story's "unique within the client" (relaxing a DB constraint needs sign-off); say if it should become UNIQUE(client_id, code). (2) Supervisor assignments reuse `user_site_scopes` with `is_primary`: pending until a second person approves (`/site-scopes/{id}/approve`); approving a primary ends the previous primary the day before the new one starts; the DB allows only one approved primary per site at a time. (3) "Internal employee with supervisor access" = active SUPERVISOR login whose employee is ACTIVE with staff type SUPERVISOR or HQ. (4) Site `address` stays NOT NULL (empty string = not given, returned as null). (5) The state lock after payroll (M2-SIT-03 AC1) is enforced in the service, not a DB trigger like the client code lock; "payroll has run" = a run line for the site in a run past DRAFT. (6) Create/edit/import/assign use `sites.write`; close is Admin only; `/sites/{id}/supervisors` is HQ only; `/me/sites` is supervisors only. (7) The site code and client never change after creation. (8) Zone stays a free code (M2 shortcut) with `sphere` CENTRAL|STATE; `minWageReady` is true when both are set, for the M7 payroll-run exception. P1 stories M2-SIT-09..11 not built. (Claude)
- 2026-11-16 · M2-CLI · Client API choices made while building (not asked): clients are HQ data, so supervisors/employees get 403 on all of `/clients`; create/edit/contacts/import use `sites.write` (Admin, Payroll, HR); deactivate/reactivate are Admin only. New clients default to the default PF/ESI establishment unless one is sent (settles the PF/ESI open question for now). "Payroll has run" = any run for the client that is past DRAFT. PAN must match the GSTIN's embedded PAN. Bulk import is a JSON-rows endpoint (the Excel template/preview is M11). (Claude)
- 2026-11-16 · M5-AI-04 · AI provider is Google Gemini, pay as you go; no budget cap (cost is logged and reported monthly instead). Region and data terms to confirm when the API key is set up. (user)
- 2026-11-16 · M5-AI-05 · No client sends scans/photos/PDFs of registers; M5-AI-05 is P2. (user)
- 2026-11-16 · M1-SEC-07 · Admin second factor is not mandatory at launch; stays optional P1. (user)
- 2026-11-16 · M1-SEC-04 · There will be 2 active Admins. (user)
- 2026-11-16 · M1 (all login stories) · Phone + OTP for every role, HQ included. No passwords, no email login, no Firebase. Stories rewritten in docs/USER-STORIES.md (decision 16 there); M1-SEC-05 moved to P1. (user)
- 2026-11-16 · M5, M2-SET-05 · An AI agent standardises every client attendance sheet: it proposes a mapping, deterministic code applies it, HR confirms, and the layout is saved per client (no AI call for repeat layouts). New M5-AI-01..06; M5-UPL-04, 05 and M5-TPL-01..03 are P0 again (decision 17 there). The AI never writes attendance and is never used for employee matching. (user)
- 2026-11-16 · scope · Backend only. No frontend work in this project; `rs-staffing-web` is not being built. (user)
- 2026-10-08 · M1-SCP-02 · A supervisor asking for a site outside their scope gets 404 NOT_FOUND, not 403 (no leak that it exists).
- 2026-10-08 · M1-USR-07 · Revoked site scopes are excluded from the no-overlap constraint.
- 2026-10-08 · M7 rules · Every law-set value is a `RuleCode` in `src/engine/rule-codes.ts` + a dated seed row; a test forbids string literals.
- 2026-10-08 · M1-OTP · OTP is Better Auth phone-number OTP sent by our SMS provider (MSG91 in production, mock in dev/test), not Firebase. M1-OTP-08 (MSG91) is built.
- 2026-10-08 · audit · Monthly partitioning of `audit.audit_log` deferred to go-live (docs/GO-LIVE.md).
- 2026-10-04 · engine · If the engine and the stories doc's worked examples disagree, the doc wins until the client confirms otherwise.

## Open — needs the user's call before the story is built

- (none)
