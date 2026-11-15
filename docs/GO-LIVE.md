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
      `ClientsService.assertActive`; each story needs its own `CLIENT_INACTIVE` test.
- [ ] The short-code lock after payroll (M2-CLI-01 AC4) is enforced in the service only; add a DB trigger when
      payroll runs exist if the API is ever bypassed.
- [ ] M2-CLI-08 (client documents) not built yet.

