-- =============================================================================
-- RS Staffing — database rules Prisma 8 cannot express in the contract.
-- Appended to the init migration (migrations/app/*_init/migration.ts) by
-- sql/extras.ts; each block = one rawSql step. Once applied, never edit a
-- step in place: put new rules in a new migration (prisma migration new).
-- Blocks are separated by lines that start with "-- @@step".
-- =============================================================================

-- @@step extension: btree_gist (needed for no-overlap exclusion constraints)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- @@step no-overlap: deployments (one site per employee per day)
ALTER TABLE app.deployments
  ADD CONSTRAINT deployments_no_overlap
  EXCLUDE USING gist (
    employee_id WITH =,
    daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&
  );

-- @@step no-overlap: primary bank account per employee (approved rows only)
ALTER TABLE app.bank_accounts
  ADD CONSTRAINT bank_accounts_primary_no_overlap
  EXCLUDE USING gist (
    employee_id WITH =,
    daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&
  ) WHERE (is_primary AND approved_by IS NOT NULL);

-- @@step no-overlap: pay settings per scope + key (approved rows only)
ALTER TABLE app.pay_settings
  ADD CONSTRAINT pay_settings_no_overlap
  EXCLUDE USING gist (
    scope WITH =,
    COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
    key WITH =,
    daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&
  ) WHERE (approved_by IS NOT NULL);

-- @@step no-overlap: statutory rules per code (approved rows only)
ALTER TABLE app.statutory_rules
  ADD CONSTRAINT statutory_rules_no_overlap
  EXCLUDE USING gist (
    code WITH =,
    daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&
  ) WHERE (approved_by IS NOT NULL);

-- @@step no-overlap: salary structure per employee (approved rows only)
ALTER TABLE app.employee_salary_structures
  ADD CONSTRAINT employee_salary_structures_no_overlap
  EXCLUDE USING gist (
    employee_id WITH =,
    daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&
  ) WHERE (approved_by IS NOT NULL);

-- @@step no-overlap: supervisor site scopes
ALTER TABLE app.user_site_scopes
  ADD CONSTRAINT user_site_scopes_no_overlap
  EXCLUDE USING gist (
    user_id WITH =,
    site_id WITH =,
    daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&
  );

-- @@step no-overlap: minimum wages per state + zone + skill
ALTER TABLE app.min_wages
  ADD CONSTRAINT min_wages_no_overlap
  EXCLUDE USING gist (
    state_code WITH =,
    zone WITH =,
    skill_level WITH =,
    per WITH =,
    daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&
  );

-- @@step no-overlap: LWF rate per state
ALTER TABLE app.lwf_rates
  ADD CONSTRAINT lwf_rates_no_overlap
  EXCLUDE USING gist (
    state_code WITH =,
    daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&
  );

-- @@step append-only: audit log and leave ledger reject UPDATE / DELETE
CREATE OR REPLACE FUNCTION audit.forbid_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only (% blocked)', TG_TABLE_NAME, TG_OP;
END;
$$;

-- @@step append-only triggers
CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit.audit_log
  FOR EACH ROW EXECUTE FUNCTION audit.forbid_change();
CREATE TRIGGER leave_ledger_append_only
  BEFORE UPDATE OR DELETE ON app.leave_ledger
  FOR EACH ROW EXECUTE FUNCTION audit.forbid_change();

-- @@step roles: rs_app (application) and rs_vault (Aadhaar access). NOLOGIN groups;
-- create the login users at deploy time: e.g. CREATE ROLE rs_api LOGIN PASSWORD '...' IN ROLE rs_app;
--                                            CREATE ROLE rs_kyc LOGIN PASSWORD '...' IN ROLE rs_app, rs_vault;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rs_app') THEN
    CREATE ROLE rs_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rs_vault') THEN
    CREATE ROLE rs_vault NOLOGIN;
  END IF;
END;
$$;

-- @@step grants: app schema (no DELETE on business data), audit insert-only, vault locked
REVOKE ALL ON SCHEMA vault FROM PUBLIC;
REVOKE ALL ON SCHEMA audit FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO rs_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA app TO rs_app;
GRANT DELETE ON app.attendance_import_rows, app.import_rows, app.sessions TO rs_app;
GRANT USAGE ON SCHEMA audit TO rs_app;
GRANT SELECT, INSERT ON audit.audit_log TO rs_app;
GRANT USAGE ON SCHEMA vault TO rs_vault;
GRANT SELECT, INSERT, UPDATE ON vault.aadhaar_records TO rs_vault;

-- @@step view: run cost summary per client (Module 15, M15-SUM-01)
CREATE OR REPLACE VIEW app.v_run_cost_summary AS
SELECT
  rl.run_id,
  s.client_id,
  COUNT(*)                                   AS headcount,
  SUM(rl.paid_days)                          AS paid_days,
  SUM(rl.gross_paise)                        AS gross_paise,
  SUM(rl.employer_cost_paise - rl.gross_paise) AS employer_contrib_paise,
  SUM(rl.employer_cost_paise)                AS total_cost_paise,
  SUM(rl.net_paise)                          AS net_paise
FROM app.run_lines rl
JOIN app.sites s ON s.id = rl.site_id
GROUP BY rl.run_id, s.client_id;

-- @@step grants: view
GRANT SELECT ON app.v_run_cost_summary TO rs_app;
