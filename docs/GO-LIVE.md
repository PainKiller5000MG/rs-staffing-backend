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

- [ ] Replace every rule row whose note starts `VERIFY` (MP PT, LWF, minimum wages) with
      CA-confirmed figures. A production payroll lock refuses while any is used (`RULES_UNVERIFIED`).
- [ ] CA confirmation: EPFO Sep-2026 split method (`PF_SPLIT_METHOD`), OT base, electronic wage
      slips, retention period, the cash > ₹10,000/day rule.

## SMS

- [ ] DLT registration and MSG91 templates (OTP, payslip, payslip revised, F&F); set
      `SMS_PROVIDER=msg91` and the `MSG91_*` variables. Launch blocker.

## Secrets

- [ ] `BETTER_AUTH_SECRET`, `DATA_KEY`, `HMAC_KEY` from the secrets manager (the app refuses to
      start in production without them). Key rotation plan for `KEY_VERSION`.
