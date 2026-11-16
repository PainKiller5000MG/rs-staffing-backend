# Before go-live

Work that must land before the first production payroll. Each item becomes an issue.

## Database

- [ ] **Partition `audit.audit_log` by month** (ER plan; deferred 8 Oct 2026).
  - Primary key becomes `(id, at)`; the table is `PARTITION BY RANGE (at)`.
  - Create monthly partitions ahead of time (a pg-boss job creates next month's on the 20th).
  - Re-attach the append-only trigger (`audit.forbid_change`) to the partitioned table and
    re-grant `rs_app` INSERT + SELECT only.
  - Ship as a planned migration with `rawSql` steps; migrate existing rows in the same transaction.
- [ ] Create the login roles at deploy time (`rs_api IN ROLE rs_app`, `rs_kyc IN ROLE rs_app, rs_vault`)
      and point the API at `rs_api`, not the owner.

## Rules and data

- [ ] **M8 blocker:** the payroll run-lock service must call `assertRulesVerified()`
      (`src/lib/rules-verified.ts`). `test/todo/m8-lock-verify-guard.test.ts` is a `test.fails`
      reminder that turns red once it's wired — then delete it.

- [ ] Replace every rule row whose note starts `VERIFY` (MP PT, LWF, minimum wages) with
      CA-confirmed figures. A production payroll lock refuses while any is used (`RULES_UNVERIFIED`).
- [ ] CA confirmation: EPFO Sep-2026 split method (`PF_SPLIT_METHOD`), OT base, electronic wage
      slips, retention period, the cash > ₹10,000/day rule.

## SMS

- [ ] DLT registration and MSG91 templates (OTP, payslip, payslip revised, F&F); set
      `SMS_PROVIDER=msg91` and the `MSG91_*` variables. Launch blocker. Template variables are
      case-sensitive and must be: OTP `##otp##`; PAYSLIP and PAYSLIP_REVISED `##name##`
      `##month##` `##link##`; FNF `##name##` `##link##`.
- [ ] MSG91 webhook (SMS » Webhook (New) » Report Received) → `POST /webhooks/msg91/dlr` with the
      custom header `x-rs-webhook-secret: $MSG91_WEBHOOK_SECRET`; include requestId, telNum, status,
      failureReason. Send one test SMS and check the delivery row moves to DELIVERED.
- [ ] Product call: a victim's per-phone OTP quota can be spent by someone else (known trade-off of
      M1-OTP-03). Consider an HQ "reset OTP limit" action or a CAPTCHA on send-otp.

## Attendance AI (M5-AI)

- [ ] Google Gemini (pay as you go): confirm the region and data terms on the paid key (prompts not used for training); worker names and codes are sent in the sample. Masking of Aadhaar-, bank- and phone-like values verified by test.
- [ ] Golden set of real client sheets passes 100% on the production model + prompt version (M5-AI-06).
- [ ] Monthly AI cost report reaches Admin, and the provider-down fallback (last layout / manual mapping) is tested. No budget cap (pay as you go).

## Employee KYC (M3)

- [ ] **Blocker (M3-PRF-05 AC3):** the Aadhaar card image is stored unmasked. Add masking of the first 8 digits (redaction or provider) and re-process stored images before launch; until then restrict the vault storage prefix `aadhaar/` to the KYC role.
- [ ] Photos and card images use `LocalStorage`; switch to the S3-compatible bucket with server-side encryption (M12-ENC-02) and confirm `aadhaar/` and `photos/` are private.
- [ ] Decide whether HR may see the full date of birth (today only the year is returned).

## Bank accounts (M3-BNK)
- [ ] Penny-drop: `StubBankVerifier` (always "verified", echoes the entered name) is registered in `core/container.ts`.
      Swap in the real provider (Razorpay / Cashfree / Decentro, still an open question) behind `BankVerifier`; the stub's
      "account ending 0000 = not found" hook must not survive.
- [ ] `ifsc_codes` holds 7 sample rows. Load the full Razorpay IFSC dataset and schedule the monthly refresh.
- [ ] The "your bank account was changed" alert is the `employee.bank_changed` event; nothing listens yet. Add the SMS
      (DLT template) / notification listener with M10.
- [ ] M3-BNK-03 AC3 (sensitive-action re-check, M1-SEC-08) is not wired into `approve`; do it when M1-SEC-08 exists.
- [ ] `BankAccountsService.requireForActivation` must be called by the employee-status story (M3-STA) before DRAFT → ACTIVE;
      `accountOn(employeeId, date)` is for the payroll engine and bank-transfer sheet (M7/M9).
- [ ] M3-BNK-05 (many bank changes in a day → alert) not built: needs M1-AUD-07.

## Logins

- [ ] The 2 active Admins exist, on different phones (M1-SEC-04); the break-glass restore command documented for the operator.

## Secrets

- [ ] `BETTER_AUTH_SECRET`, `DATA_KEY`, `HMAC_KEY` and `GEMINI_API_KEY` from the secrets manager (the app refuses to
      start in production without them). Key rotation plan for `KEY_VERSION`.

## Storage

- [ ] Implement the S3-compatible `FileStorage` adapter (Indian region, private bucket, server-side
      encryption, signed short-lived URLs); `LocalStorage` is dev/test only (M12-ENC-02).

## Clients (M2-CLI)

- [ ] Contract-expiry alerts (M2-CLI-07): `GET /clients/expiring` gives the D30/D7 list; a scheduled pg-boss job must
      still notify HQ Admin at exactly 30 and 7 days (needs the notification channel from M10).
- [ ] Inactive clients (M2-CLI-05 AC2): deployments (M3), attendance imports (M5) and payroll runs (M7) must call
      `ClientsService.assertActive`; test/todo/client-inactive-guard.test.ts fails (red) once they do, then each story keeps its own `CLIENT_INACTIVE` test.
- [ ] The short-code lock after payroll (M2-CLI-01 AC4) is enforced in the service only; add a DB trigger when
      payroll runs exist if the API is ever bypassed.
- [ ] M2-CLI-08 (client documents) not built yet.

## Holidays (M14-HOL)

- [ ] **Blocker:** a holiday change in an unlocked month must re-apply holiday codes to attendance days, rebuild monthly
      summaries, flag computed runs "inputs changed" and recalculate approved leave (M14-HOL-05 AC2). The API refuses locked months
      and previews the counts, and emits the `holiday.changed` event (action, dates, site ids) after commit, but **no listener
      exists** until M5 (attendance), M6 (leave) and M8 (payroll) are built. Until then a holiday added to an open month does not
      change pay by itself: HQ must recompute. Add the listeners, then test M14-HOL-05 AC2 (the n/a note in test/api/holidays.test.ts).
- [ ] Load each state's holiday list for the launch years (open question: which states for 2026 and 2027, and whether RS follows each
      state's list or each client's own). Until a state has a list, payroll should raise `MISSING_STATE_RULES` (M8-EXC-01).
- [ ] The site calendar cache is per process (5-minute limit as a backstop). With more than one API instance, a holiday change
      shows on the other instances after at most 5 minutes; use a shared invalidation (pg-boss/LISTEN) if that is not acceptable.
- [ ] Holiday import is JSON rows today; the Excel upload (M11) must feed `POST /holidays/import`.
