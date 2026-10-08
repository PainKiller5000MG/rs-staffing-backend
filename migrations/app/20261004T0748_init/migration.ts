#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/323f070e1e05ab23a9eb2c61c44c545e3485f08c35440989d7de7793e1715fc3/contract';
import endContract from '../../snapshots/323f070e1e05ab23a9eb2c61c44c545e3485f08c35440989d7de7793e1715fc3/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';
import { extrasSteps } from '../../../sql/extras.ts';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: 'app' }),
      this.createSchema({ schema: 'audit' }),
      this.createSchema({ schema: 'public' }),
      this.createSchema({ schema: 'vault' }),
      this.createTable({
        schema: 'app',
        table: 'access_log',
        columns: [
          col('at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('document_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('ip', 'inet', { codecRef: { codecId: 'pg/inet@1' } }),
          col('result', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('token_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('user_agent', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('user_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'access_log_result_check_40d03987',
            "\"result\" IN ('OK', 'WRONG_DOB', 'LOCKED', 'EXPIRED', 'REVOKED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'access_tokens',
        columns: [
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('document_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('expires_at', 'timestamptz(6)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('failed_count', 'int2', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int2@1' },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('locked_until', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('revoked_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('token_hash', 'character(64)', {
            notNull: true,
            codecRef: { codecId: 'sql/char@1', typeParams: { length: 64 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'app',
        table: 'advances',
        columns: [
          col('amount_paise', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('approved_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('approved_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('balance_paise', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('created_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('employee_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('given_on', 'date', { notNull: true, codecRef: { codecId: 'pg/date-temporal@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('instalment_paise', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('mode', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('ACTIVE'),
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'advances_amounts_d2d607be',
            'amount_paise > 0 AND instalment_paise > 0 AND balance_paise >= 0',
          ),
          checkExpression(
            'advances_maker_checker_49c0af58',
            'approved_by IS NULL OR created_by IS NULL OR approved_by <> created_by',
          ),
          checkExpression('advances_mode_check_a8e17674', "\"mode\" IN ('BANK', 'UPI', 'CASH')"),
          checkExpression(
            'advances_status_check_f6eeddd6',
            "\"status\" IN ('ACTIVE', 'CLOSED', 'WRITTEN_OFF')",
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'attendance_corrections',
        columns: [
          col('approved_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('approved_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('attendance_day_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('created_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('new_code', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('new_ot_hours', 'numeric(5,2)', {
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 5, scale: 2 } },
          }),
          col('old_code', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('old_ot_hours', 'numeric(5,2)', {
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 5, scale: 2 } },
          }),
          col('reason', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('PENDING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'attendance_corrections_maker_checker_49c0af58',
            'approved_by IS NULL OR created_by IS NULL OR approved_by <> created_by',
          ),
          checkExpression(
            'attendance_corrections_new_code_check_f507d827',
            "\"new_code\" IN ('P', 'A', 'HD', 'WO', 'WOP', 'PH', 'PHP', 'EL', 'CL', 'SL')",
          ),
          checkExpression(
            'attendance_corrections_old_code_check_0763566a',
            "\"old_code\" IN ('P', 'A', 'HD', 'WO', 'WOP', 'PH', 'PHP', 'EL', 'CL', 'SL')",
          ),
          checkExpression(
            'attendance_corrections_status_check_56005a61',
            "\"status\" IN ('PENDING', 'APPROVED', 'REJECTED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'attendance_days',
        columns: [
          col('code', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('date', 'date', { notNull: true, codecRef: { codecId: 'pg/date-temporal@1' } }),
          col('employee_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('import_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('ot_hours', 'numeric(5,2)', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 5, scale: 2 } },
          }),
          col('site_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('source', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('updated_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'attendance_days_code_check_c7c756c0',
            "\"code\" IN ('P', 'A', 'HD', 'WO', 'WOP', 'PH', 'PHP', 'EL', 'CL', 'SL')",
          ),
          checkExpression(
            'attendance_days_source_check_e29af04b',
            "\"source\" IN ('IMPORT', 'CORRECTION', 'LEAVE', 'APP')",
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'attendance_import_rows',
        columns: [
          col('codes', 'character varying(4)[]', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 4 }, many: true },
          }),
          col('employee_code', 'character varying(40)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 40 } },
          }),
          col('employee_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('errors', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('import_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('ot_hours', 'numeric(6,2)', {
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 6, scale: 2 } },
          }),
          col('row_no', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('site_code', 'character varying(30)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 30 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'attendance_import_rows_codes_elem_not_null_c862d782',
            'array_position("codes", NULL) IS NULL',
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'attendance_imports',
        columns: [
          col('approved_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('approved_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('client_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('counts', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('created_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('file_key', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('file_sha256', 'character(64)', {
            notNull: true,
            codecRef: { codecId: 'sql/char@1', typeParams: { length: 64 } },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('month', 'date', { notNull: true, codecRef: { codecId: 'pg/date-temporal@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('STAGING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'attendance_imports_maker_checker_49c0af58',
            'approved_by IS NULL OR created_by IS NULL OR approved_by <> created_by',
          ),
          checkExpression(
            'attendance_imports_status_check_ca7cf435',
            "\"status\" IN ('STAGING', 'ACCEPTED', 'SUPERSEDED', 'ABANDONED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'attendance_months',
        columns: [
          col('computed_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('employee_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('frozen', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('half_days', 'int2', { notNull: true, codecRef: { codecId: 'pg/int2@1' } }),
          col('holiday_worked', 'int2', { notNull: true, codecRef: { codecId: 'pg/int2@1' } }),
          col('holidays', 'int2', { notNull: true, codecRef: { codecId: 'pg/int2@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('leave_days', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('lop_days', 'numeric(5,1)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 5, scale: 1 } },
          }),
          col('month', 'date', { notNull: true, codecRef: { codecId: 'pg/date-temporal@1' } }),
          col('ot_hours', 'numeric(6,2)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 6, scale: 2 } },
          }),
          col('paid_days', 'numeric(5,1)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 5, scale: 1 } },
          }),
          col('present', 'numeric(5,1)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 5, scale: 1 } },
          }),
          col('site_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('weekly_offs', 'int2', { notNull: true, codecRef: { codecId: 'pg/int2@1' } }),
          col('wo_worked', 'int2', { notNull: true, codecRef: { codecId: 'pg/int2@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'app',
        table: 'bank_accounts',
        columns: [
          col('account_enc', 'bytea', { notNull: true, codecRef: { codecId: 'pg/bytea@1' } }),
          col('account_last4', 'character(4)', {
            notNull: true,
            codecRef: { codecId: 'sql/char@1', typeParams: { length: 4 } },
          }),
          col('approved_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('approved_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('created_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('effective_from', 'date', {
            notNull: true,
            codecRef: { codecId: 'pg/date-temporal@1' },
          }),
          col('effective_to', 'date', { codecRef: { codecId: 'pg/date-temporal@1' } }),
          col('employee_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('holder_name', 'character varying(120)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 120 } },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('ifsc', 'character(11)', {
            notNull: true,
            codecRef: { codecId: 'sql/char@1', typeParams: { length: 11 } },
          }),
          col('is_primary', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('verified_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('verify_ref', 'character varying(80)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 80 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'bank_accounts_effective_order_8f4f959a',
            'effective_to IS NULL OR effective_to >= effective_from',
          ),
          checkExpression(
            'bank_accounts_maker_checker_49c0af58',
            'approved_by IS NULL OR created_by IS NULL OR approved_by <> created_by',
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'cash_payouts',
        columns: [
          col('ack_photo_key', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('amount_paise', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('cash_release_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('daily_worker_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('marked_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('paid_on', 'date', { codecRef: { codecId: 'pg/date-temporal@1' } }),
          col('run_line_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('RELEASED'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('verified_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('verified_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'cash_payouts_ack_before_paid_1cff30de',
            "status IN ('RELEASED','UNPAID') OR ack_photo_key IS NOT NULL",
          ),
          checkExpression('cash_payouts_amount_positive_b94b4fdb', 'amount_paise > 0'),
          checkExpression(
            'cash_payouts_one_payee_1bd6c541',
            'num_nonnulls(run_line_id, daily_worker_id) = 1',
          ),
          checkExpression(
            'cash_payouts_status_check_f1489e44',
            "\"status\" IN ('RELEASED', 'PAID_PENDING', 'PAID_VERIFIED', 'UNPAID')",
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'cash_releases',
        columns: [
          col('amount_paise', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('approved_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('approved_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('closed_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('created_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('daily_payout_batch_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('released_on', 'date', {
            notNull: true,
            codecRef: { codecId: 'pg/date-temporal@1' },
          }),
          col('run_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('site_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('OPEN'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('supervisor_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression('cash_releases_amount_positive_b94b4fdb', 'amount_paise > 0'),
          checkExpression(
            'cash_releases_maker_checker_49c0af58',
            'approved_by IS NULL OR created_by IS NULL OR approved_by <> created_by',
          ),
          checkExpression(
            'cash_releases_status_check_170f55bf',
            "\"status\" IN ('OPEN', 'CLOSED', 'SHORT')",
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'cash_returns',
        columns: [
          col('amount_paise', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('cash_release_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('received_by', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('returned_on', 'date', {
            notNull: true,
            codecRef: { codecId: 'pg/date-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression('cash_returns_amount_positive_b94b4fdb', 'amount_paise > 0'),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'challans',
        columns: [
          col('amount_paise', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('compliance_file_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('created_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('due_on', 'date', { notNull: true, codecRef: { codecId: 'pg/date-temporal@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('paid_on', 'date', { codecRef: { codecId: 'pg/date-temporal@1' } }),
          col('receipt_key', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('reference', 'character varying(60)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 60 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'app',
        table: 'clients',
        columns: [
          col('billing_address', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('code', 'character varying(30)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 30 } },
          }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('created_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('esi_establishment_id', 'uuid', {
            notNull: true,
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('gstin', 'character(15)', {
            codecRef: { codecId: 'sql/char@1', typeParams: { length: 15 } },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('name', 'character varying(200)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 200 } },
          }),
          col('pay_period_start_day', 'int2', {
            notNull: true,
            default: lit(1),
            codecRef: { codecId: 'pg/int2@1' },
          }),
          col('pf_establishment_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('ACTIVE'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('updated_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression('clients_status_check_ee520df2', "\"status\" IN ('ACTIVE', 'INACTIVE')"),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'code_counters',
        columns: [
          col('name', 'character varying(30)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 30 } },
          }),
          col('next_value', 'int8', {
            notNull: true,
            default: lit('1'),
            codecRef: { codecId: 'pg/int8@1' },
          }),
          col('prefix', 'character varying(6)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 6 } },
          }),
          col('width', 'int2', { notNull: true, codecRef: { codecId: 'pg/int2@1' } }),
        ],
        constraints: [primaryKey(['name'])],
      }),
      this.createTable({
        schema: 'app',
        table: 'company',
        columns: [
          col('address', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('legal_name', 'character varying(200)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 200 } },
          }),
          col('logo_key', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('pan', 'character(10)', {
            codecRef: { codecId: 'sql/char@1', typeParams: { length: 10 } },
          }),
          col('tan', 'character(10)', {
            codecRef: { codecId: 'sql/char@1', typeParams: { length: 10 } },
          }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('updated_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'app',
        table: 'compliance_files',
        columns: [
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('created_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('establishment_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('file_key', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('portal_ref', 'character varying(60)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 60 } },
          }),
          col('run_ids', 'uuid[]', {
            notNull: true,
            codecRef: { codecId: 'pg/uuid@1', many: true },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('GENERATED'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('totals', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('wage_month', 'date', { notNull: true, codecRef: { codecId: 'pg/date-temporal@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'compliance_files_run_ids_elem_not_null_bd3a1042',
            'array_position("run_ids", NULL) IS NULL',
          ),
          checkExpression(
            'compliance_files_status_check_6cf6cfcc',
            "\"status\" IN ('GENERATED', 'UPLOADED', 'ACCEPTED', 'REJECTED')",
          ),
          checkExpression(
            'compliance_files_type_check_79586a73',
            "\"type\" IN ('ECR', 'ESIC_MC', 'PT', 'LWF')",
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'consents',
        columns: [
          col('created_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('evidence_key', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('given_at', 'timestamptz(6)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('purpose', 'character varying(80)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 80 } },
          }),
          col('subject_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('subject_type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('version', 'character varying(20)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 20 } },
          }),
          col('withdrawn_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'consents_subject_type_check_ea34176f',
            "\"subject_type\" IN ('EMPLOYEE', 'DAILY_WORKER')",
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'contractor_licences',
        columns: [
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('licence_no', 'character varying(60)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 60 } },
          }),
          col('max_workers', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('state_code', 'character varying(4)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 4 } },
          }),
          col('valid_to', 'date', { notNull: true, codecRef: { codecId: 'pg/date-temporal@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'app',
        table: 'daily_payout_batches',
        columns: [
          col('approved_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('approved_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('created_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('period_from', 'date', {
            notNull: true,
            codecRef: { codecId: 'pg/date-temporal@1' },
          }),
          col('period_to', 'date', { notNull: true, codecRef: { codecId: 'pg/date-temporal@1' } }),
          col('site_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('DRAFT'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('total_paise', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'daily_payout_batches_maker_checker_49c0af58',
            'approved_by IS NULL OR created_by IS NULL OR approved_by <> created_by',
          ),
          checkExpression(
            'daily_payout_batches_status_check_a2af701a',
            "\"status\" IN ('DRAFT', 'APPROVED', 'SENT', 'PAID', 'CANCELLED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'daily_work_entries',
        columns: [
          col('approved_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('approved_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('created_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('daily_wage_paise', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('daily_worker_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('ot_hours', 'numeric(5,2)', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 5, scale: 2 } },
          }),
          col('payout_batch_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('site_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('PENDING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('work_date', 'date', { notNull: true, codecRef: { codecId: 'pg/date-temporal@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'daily_work_entries_maker_checker_49c0af58',
            'approved_by IS NULL OR created_by IS NULL OR approved_by <> created_by',
          ),
          checkExpression(
            'daily_work_entries_status_check_76d29c06',
            "\"status\" IN ('PENDING', 'APPROVED', 'REJECTED', 'PAID')",
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'daily_workers',
        columns: [
          col('blocklist_reason', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('blocklisted', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('code', 'character varying(12)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 12 } },
          }),
          col('converted_employee_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('created_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('mobile', 'character varying(15)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 15 } },
          }),
          col('name', 'character varying(120)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 120 } },
          }),
          col('payment_mode', 'text', {
            notNull: true,
            default: lit('CASH'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('photo_key', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('updated_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('upi_id', 'character varying(80)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 80 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'daily_workers_payment_mode_check_fbb26ca1',
            "\"payment_mode\" IN ('BANK', 'UPI', 'CASH')",
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'deliveries',
        columns: [
          col('attempts', 'int2', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int2@1' },
          }),
          col('batch_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('channel', 'text', {
            notNull: true,
            default: lit('SMS'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('delivered_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('document_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('opened_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('provider_msg_id', 'character varying(80)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 80 } },
          }),
          col('reason', 'character varying(80)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 80 } },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('QUEUED'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('submitted_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('template_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('to_mobile', 'character varying(15)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 15 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'deliveries_channel_check_60869114',
            "\"channel\" IN ('SMS', 'WHATSAPP', 'EMAIL')",
          ),
          checkExpression(
            'deliveries_status_check_d5d5b77f',
            "\"status\" IN ('QUEUED', 'SUBMITTED', 'DELIVERED', 'FAILED', 'OPENED', 'NO_MOBILE')",
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'delivery_batches',
        columns: [
          col('counts', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('created_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('kind', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('run_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'delivery_batches_kind_check_25bf61ce',
            "\"kind\" IN ('PUBLISH', 'REVISED', 'RESEND', 'FNF')",
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'deployments',
        columns: [
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('created_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('designation', 'character varying(80)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 80 } },
          }),
          col('effective_from', 'date', {
            notNull: true,
            codecRef: { codecId: 'pg/date-temporal@1' },
          }),
          col('effective_to', 'date', { codecRef: { codecId: 'pg/date-temporal@1' } }),
          col('employee_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('site_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'deployments_effective_order_8f4f959a',
            'effective_to IS NULL OR effective_to >= effective_from',
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'employee_documents',
        columns: [
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('created_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('employee_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('expires_on', 'date', { codecRef: { codecId: 'pg/date-temporal@1' } }),
          col('file_key', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('type', 'character varying(40)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 40 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'app',
        table: 'employee_events',
        columns: [
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('created_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('date', 'date', { notNull: true, codecRef: { codecId: 'pg/date-temporal@1' } }),
          col('employee_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('reason', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'employee_events_type_check_723958e4',
            "\"type\" IN ('JOIN', 'TRANSFER', 'NOTICE', 'EXIT', 'ABSCOND', 'REJOIN')",
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'employee_salary_lines',
        columns: [
          col('amount_paise', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('component_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('structure_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'app',
        table: 'employee_salary_structures',
        columns: [
          col('approved_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('approved_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('created_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('effective_from', 'date', {
            notNull: true,
            codecRef: { codecId: 'pg/date-temporal@1' },
          }),
          col('effective_to', 'date', { codecRef: { codecId: 'pg/date-temporal@1' } }),
          col('employee_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('monthly_gross_paise', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('template_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'employee_salary_structures_effective_order_8f4f959a',
            'effective_to IS NULL OR effective_to >= effective_from',
          ),
          checkExpression(
            'employee_salary_structures_maker_checker_49c0af58',
            'approved_by IS NULL OR created_by IS NULL OR approved_by <> created_by',
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'employee_statutory',
        columns: [
          col('employee_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('esi_from', 'date', { codecRef: { codecId: 'pg/date-temporal@1' } }),
          col('esi_ip_no', 'character varying(17)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 17 } },
          }),
          col('pan', 'character(10)', {
            codecRef: { codecId: 'sql/char@1', typeParams: { length: 10 } },
          }),
          col('pf_exempt', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('pf_full_wages', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('pf_member_from', 'date', { codecRef: { codecId: 'pg/date-temporal@1' } }),
          col('pt_exempt', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('uan', 'character(12)', {
            codecRef: { codecId: 'sql/char@1', typeParams: { length: 12 } },
          }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('updated_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [primaryKey(['employee_id'])],
      }),
      this.createTable({
        schema: 'app',
        table: 'employees',
        columns: [
          col('code', 'character varying(12)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 12 } },
          }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('created_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('designation', 'character varying(80)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 80 } },
          }),
          col('dob', 'date', { notNull: true, codecRef: { codecId: 'pg/date-temporal@1' } }),
          col('email', 'character varying(254)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 254 } },
          }),
          col('exit_date', 'date', { codecRef: { codecId: 'pg/date-temporal@1' } }),
          col('gender', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('join_date', 'date', { codecRef: { codecId: 'pg/date-temporal@1' } }),
          col('language', 'character varying(5)', {
            notNull: true,
            default: lit('en'),
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 5 } },
          }),
          col('legacy_code', 'character varying(40)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 40 } },
          }),
          col('mobile', 'character varying(15)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 15 } },
          }),
          col('name', 'character varying(120)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 120 } },
          }),
          col('payment_mode', 'text', {
            notNull: true,
            default: lit('BANK'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('photo_key', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('skill_level', 'text', {
            notNull: true,
            default: lit('UNSKILLED'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('staff_type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('DRAFT'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('updated_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('upi_id', 'character varying(80)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 80 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'employees_gender_check_30490488',
            "\"gender\" IN ('MALE', 'FEMALE', 'OTHER')",
          ),
          checkExpression(
            'employees_payment_mode_check_fbb26ca1',
            "\"payment_mode\" IN ('BANK', 'UPI', 'CASH')",
          ),
          checkExpression(
            'employees_skill_level_check_3d5f273a',
            "\"skill_level\" IN ('UNSKILLED', 'SEMI_SKILLED', 'SKILLED', 'HIGHLY_SKILLED')",
          ),
          checkExpression(
            'employees_staff_type_check_7ed47bc3',
            "\"staff_type\" IN ('DEPLOYED', 'SUPERVISOR', 'HQ', 'CONTRACT')",
          ),
          checkExpression(
            'employees_status_check_20408192',
            "\"status\" IN ('DRAFT', 'ACTIVE', 'ON_NOTICE', 'EXITED', 'ABSCONDED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'establishments',
        columns: [
          col('code', 'character varying(30)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 30 } },
          }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('created_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('is_default', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('name', 'character varying(200)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 200 } },
          }),
          col('region', 'character varying(80)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 80 } },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('ACTIVE'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('updated_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'establishments_status_check_ee520df2',
            "\"status\" IN ('ACTIVE', 'INACTIVE')",
          ),
          checkExpression('establishments_type_check_3ffbfec1', "\"type\" IN ('PF', 'ESI')"),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'export_jobs',
        columns: [
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('created_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('entity', 'character varying(40)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 40 } },
          }),
          col('file_key', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('filters', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('layout_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('masked', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('rows', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('QUEUED'),
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'export_jobs_status_check_cfbce21a',
            "\"status\" IN ('QUEUED', 'RUNNING', 'PREVIEW', 'DONE', 'FAILED', 'CANCELLED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'export_layouts',
        columns: [
          col('client_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('columns', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('created_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('entity', 'character varying(40)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 40 } },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('name', 'character varying(120)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 120 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'app',
        table: 'fnf_cases',
        columns: [
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('created_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('due_by', 'date', { notNull: true, codecRef: { codecId: 'pg/date-temporal@1' } }),
          col('employee_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('exit_event_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('last_working_day', 'date', {
            notNull: true,
            codecRef: { codecId: 'pg/date-temporal@1' },
          }),
          col('nominee_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('run_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('statement_key', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('OPEN'),
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'fnf_cases_status_check_b3d9200a',
            "\"status\" IN ('OPEN', 'COMPUTED', 'LOCKED', 'PAID', 'CANCELLED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'holidays',
        columns: [
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('created_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('date', 'date', { notNull: true, codecRef: { codecId: 'pg/date-temporal@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('level', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'character varying(120)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 120 } },
          }),
          col('optional', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('paid', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('scope_key', 'character varying(40)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 40 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'holidays_level_check_892e8ea2',
            "\"level\" IN ('NATIONAL', 'STATE', 'CLIENT', 'SITE')",
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'import_jobs',
        columns: [
          col('counts', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('created_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('file_key', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('finished_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('mode', 'text', {
            notNull: true,
            default: lit('VALID_ONLY'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('QUEUED'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('type', 'character varying(40)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 40 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'import_jobs_mode_check_3d03ed00',
            "\"mode\" IN ('VALID_ONLY', 'ALL_OR_NOTHING')",
          ),
          checkExpression(
            'import_jobs_status_check_cfbce21a',
            "\"status\" IN ('QUEUED', 'RUNNING', 'PREVIEW', 'DONE', 'FAILED', 'CANCELLED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'import_rows',
        columns: [
          col('data', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('entity_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('errors', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('job_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('result', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('row_no', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'import_rows_result_check_54215cf7',
            "\"result\" IN ('CREATED', 'UPDATED', 'SKIPPED', 'ERROR')",
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'leave_applications',
        columns: [
          col('applied_by', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('approved_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('approved_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('days', 'numeric(5,1)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 5, scale: 1 } },
          }),
          col('employee_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('from_date', 'date', { notNull: true, codecRef: { codecId: 'pg/date-temporal@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('leave_type_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('reason', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('PENDING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('to_date', 'date', { notNull: true, codecRef: { codecId: 'pg/date-temporal@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'leave_applications_status_check_56005a61',
            "\"status\" IN ('PENDING', 'APPROVED', 'REJECTED')",
          ),
          checkExpression('leave_apps_date_order_c8249a58', 'to_date >= from_date AND days > 0'),
          checkExpression(
            'leave_apps_maker_checker_6a036af6',
            'approved_by IS NULL OR approved_by <> applied_by',
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'leave_ledger',
        columns: [
          col('application_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('created_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('date', 'date', { notNull: true, codecRef: { codecId: 'pg/date-temporal@1' } }),
          col('delta', 'numeric(5,1)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 5, scale: 1 } },
          }),
          col('employee_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('leave_type_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('note', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('reason', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('run_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'leave_ledger_reason_check_515419bd',
            "\"reason\" IN ('ACCRUAL', 'TAKEN', 'LAPSE', 'ENCASH', 'ADJUST', 'CARRY')",
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'leave_types',
        columns: [
          col('accrual_rule', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('carry_forward_max', 'numeric(5,1)', {
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 5, scale: 1 } },
          }),
          col('client_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('code', 'character varying(10)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 10 } },
          }),
          col('encashable', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('name', 'character varying(80)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 80 } },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('ACTIVE'),
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'leave_types_status_check_ee520df2',
            "\"status\" IN ('ACTIVE', 'INACTIVE')",
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'login_events',
        columns: [
          col('at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('ip', 'inet', { codecRef: { codecId: 'pg/inet@1' } }),
          col('mobile', 'character varying(15)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 15 } },
          }),
          col('result', 'character varying(40)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 40 } },
          }),
          col('user_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'app',
        table: 'lwf_rates',
        columns: [
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('created_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('deduct_months', 'int2[]', {
            notNull: true,
            codecRef: { codecId: 'pg/int2@1', many: true },
          }),
          col('ee_paise', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('effective_from', 'date', {
            notNull: true,
            codecRef: { codecId: 'pg/date-temporal@1' },
          }),
          col('effective_to', 'date', { codecRef: { codecId: 'pg/date-temporal@1' } }),
          col('er_paise', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('frequency', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('state_code', 'character varying(4)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 4 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'lwf_rates_deduct_months_elem_not_null_567030cc',
            'array_position("deduct_months", NULL) IS NULL',
          ),
          checkExpression(
            'lwf_rates_effective_order_8f4f959a',
            'effective_to IS NULL OR effective_to >= effective_from',
          ),
          checkExpression(
            'lwf_rates_frequency_check_61c5b4c1',
            "\"frequency\" IN ('MONTHLY', 'HALF_YEARLY', 'YEARLY')",
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'message_templates',
        columns: [
          col('body', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('channel', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('created_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('dlt_template_id', 'character varying(40)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 40 } },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('kind', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('language', 'character varying(5)', {
            notNull: true,
            default: lit('en'),
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 5 } },
          }),
          col('segments', 'int2', { notNull: true, codecRef: { codecId: 'pg/int2@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('DRAFT'),
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'message_templates_channel_check_60869114',
            "\"channel\" IN ('SMS', 'WHATSAPP', 'EMAIL')",
          ),
          checkExpression(
            'message_templates_kind_check_25bf61ce',
            "\"kind\" IN ('PUBLISH', 'REVISED', 'RESEND', 'FNF')",
          ),
          checkExpression(
            'message_templates_status_check_6a55d54f',
            "\"status\" IN ('DRAFT', 'APPROVED', 'RETIRED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'min_wages',
        columns: [
          col('basic_paise', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('created_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('effective_from', 'date', {
            notNull: true,
            codecRef: { codecId: 'pg/date-temporal@1' },
          }),
          col('effective_to', 'date', { codecRef: { codecId: 'pg/date-temporal@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('per', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('skill_level', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('source_url', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('state_code', 'character varying(4)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 4 } },
          }),
          col('vda_paise', 'int8', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/int8@1' },
          }),
          col('zone', 'character varying(20)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 20 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'min_wages_effective_order_8f4f959a',
            'effective_to IS NULL OR effective_to >= effective_from',
          ),
          checkExpression('min_wages_per_check_2951a4f8', "\"per\" IN ('DAY', 'MONTH')"),
          checkExpression(
            'min_wages_skill_level_check_3d5f273a',
            "\"skill_level\" IN ('UNSKILLED', 'SEMI_SKILLED', 'SKILLED', 'HIGHLY_SKILLED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'nominees',
        columns: [
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('created_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('employee_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('name', 'character varying(120)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 120 } },
          }),
          col('relation', 'character varying(40)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 40 } },
          }),
          col('scheme', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('share_pct', 'numeric(5,2)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 5, scale: 2 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'nominees_scheme_check_cd365859',
            "\"scheme\" IN ('PF', 'ESI', 'GRATUITY')",
          ),
          checkExpression('nominees_share_range_09d5171c', 'share_pct > 0 AND share_pct <= 100'),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'ot_approvals',
        columns: [
          col('approved_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('date', 'date', { notNull: true, codecRef: { codecId: 'pg/date-temporal@1' } }),
          col('employee_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('max_hours', 'numeric(5,2)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 5, scale: 2 } },
          }),
          col('site_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'app',
        table: 'pay_settings',
        columns: [
          col('approved_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('approved_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('created_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('effective_from', 'date', {
            notNull: true,
            codecRef: { codecId: 'pg/date-temporal@1' },
          }),
          col('effective_to', 'date', { codecRef: { codecId: 'pg/date-temporal@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('key', 'character varying(60)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 60 } },
          }),
          col('scope', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('scope_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('value', 'character varying(200)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 200 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'pay_settings_effective_order_8f4f959a',
            'effective_to IS NULL OR effective_to >= effective_from',
          ),
          checkExpression(
            'pay_settings_maker_checker_49c0af58',
            'approved_by IS NULL OR created_by IS NULL OR approved_by <> created_by',
          ),
          checkExpression(
            'pay_settings_scope_check_47ce8512',
            "\"scope\" IN ('COMPANY', 'CLIENT', 'SITE')",
          ),
          checkExpression(
            'pay_settings_scope_id_3349b9c6',
            "(scope = 'COMPANY') = (scope_id IS NULL)",
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'payment_batches',
        columns: [
          col('approved_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('approved_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('count', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('created_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('daily_payout_batch_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('file_key', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('format', 'text', {
            notNull: true,
            default: lit('GENERIC_CSV'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('mode', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('paid_on', 'date', { codecRef: { codecId: 'pg/date-temporal@1' } }),
          col('run_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('DRAFT'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('total_paise', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'payment_batches_format_check_bce71abc',
            "\"format\" IN ('GENERIC_CSV', 'GENERIC_XLSX')",
          ),
          checkExpression(
            'payment_batches_maker_checker_49c0af58',
            'approved_by IS NULL OR created_by IS NULL OR approved_by <> created_by',
          ),
          checkExpression(
            'payment_batches_mode_check_a8e17674',
            "\"mode\" IN ('BANK', 'UPI', 'CASH')",
          ),
          checkExpression(
            'payment_batches_status_check_a2af701a',
            "\"status\" IN ('DRAFT', 'APPROVED', 'SENT', 'PAID', 'CANCELLED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'payments',
        columns: [
          col('amount_paise', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('batch_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('daily_payout_batch_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('failure_reason', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('mode', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('run_line_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('PENDING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('utr', 'character varying(40)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 40 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression('payments_amount_positive_b94b4fdb', 'amount_paise > 0'),
          checkExpression('payments_mode_check_a8e17674', "\"mode\" IN ('BANK', 'UPI', 'CASH')"),
          checkExpression(
            'payments_one_source_de3aaea2',
            'num_nonnulls(run_line_id, daily_payout_batch_id) = 1',
          ),
          checkExpression(
            'payments_status_check_4d561e0b',
            "\"status\" IN ('PENDING', 'SENT', 'PAID', 'FAILED', 'RETURNED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'payroll_runs',
        columns: [
          col('client_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('computed_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('computed_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('created_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('locked_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('locked_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('parent_run_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('period_from', 'date', {
            notNull: true,
            codecRef: { codecId: 'pg/date-temporal@1' },
          }),
          col('period_to', 'date', { notNull: true, codecRef: { codecId: 'pg/date-temporal@1' } }),
          col('published_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('DRAFT'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('totals', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('version', 'int4', {
            notNull: true,
            default: lit(1),
            codecRef: { codecId: 'pg/int4@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'payroll_runs_lock_not_computer_48af50b7',
            'locked_by IS NULL OR computed_by IS NULL OR locked_by <> computed_by',
          ),
          checkExpression('payroll_runs_period_order_17025060', 'period_to >= period_from'),
          checkExpression(
            'payroll_runs_status_check_4995c9bf',
            "\"status\" IN ('DRAFT', 'COMPUTED', 'CHECKED', 'LOCKED', 'PUBLISHED', 'REOPENED')",
          ),
          checkExpression(
            'payroll_runs_type_check_f78f3fff',
            "\"type\" IN ('REGULAR', 'ARREAR', 'FNF', 'INTERNAL', 'OFF_CYCLE')",
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'payslip_documents',
        columns: [
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('file_key', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('line_hash', 'character(64)', {
            notNull: true,
            codecRef: { codecId: 'sql/char@1', typeParams: { length: 64 } },
          }),
          col('run_line_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('sha256', 'character(64)', {
            codecRef: { codecId: 'sql/char@1', typeParams: { length: 64 } },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('GENERATING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('superseded_by_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('template', 'character varying(30)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 30 } },
          }),
          col('version', 'int4', {
            notNull: true,
            default: lit(1),
            codecRef: { codecId: 'pg/int4@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'payslip_documents_status_check_fe6aba8c',
            "\"status\" IN ('GENERATING', 'ACTIVE', 'SUPERSEDED', 'FAILED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'pt_slabs',
        columns: [
          col('amount_paise', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('created_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('effective_from', 'date', {
            notNull: true,
            codecRef: { codecId: 'pg/date-temporal@1' },
          }),
          col('effective_to', 'date', { codecRef: { codecId: 'pg/date-temporal@1' } }),
          col('from_paise', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('gender', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('month_override', 'int2', { codecRef: { codecId: 'pg/int2@1' } }),
          col('state_code', 'character varying(4)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 4 } },
          }),
          col('to_paise', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'pt_slabs_effective_order_8f4f959a',
            'effective_to IS NULL OR effective_to >= effective_from',
          ),
          checkExpression(
            'pt_slabs_gender_check_30490488',
            "\"gender\" IN ('MALE', 'FEMALE', 'OTHER')",
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'run_line_items',
        columns: [
          col('advance_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('amount_paise', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('component_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('kind', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('note', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('run_line_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'run_line_items_kind_check_198538e7',
            "\"kind\" IN ('EARNING', 'DEDUCTION', 'EMPLOYER', 'REIMBURSEMENT')",
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'run_lines',
        columns: [
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('deductions_paise', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('edli_wages_paise', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('employee_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('employer_cost_paise', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('eps_wages_paise', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('esi_gross_paise', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('gross_paise', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('hold_reason', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('line_hash', 'character(64)', {
            notNull: true,
            codecRef: { codecId: 'sql/char@1', typeParams: { length: 64 } },
          }),
          col('lop_days', 'numeric(5,1)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 5, scale: 1 } },
          }),
          col('net_paise', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('ot_hours', 'numeric(6,2)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 6, scale: 2 } },
          }),
          col('paid_days', 'numeric(5,1)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 5, scale: 1 } },
          }),
          col('pf_wages_paise', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('run_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('site_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('snapshot', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('OK'),
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'run_lines_net_math_e583edcc',
            'net_paise = gross_paise - deductions_paise',
          ),
          checkExpression(
            'run_lines_status_check_a71aabab',
            "\"status\" IN ('OK', 'HOLD', 'ERROR')",
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'salary_components',
        columns: [
          col('code', 'character varying(30)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 30 } },
          }),
          col('display_order', 'int4', {
            notNull: true,
            default: lit(100),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('in_esi_gross', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('in_pf_wages', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('in_wages', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('kind', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'character varying(80)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 80 } },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('ACTIVE'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('taxable', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'salary_components_kind_check_198538e7',
            "\"kind\" IN ('EARNING', 'DEDUCTION', 'EMPLOYER', 'REIMBURSEMENT')",
          ),
          checkExpression(
            'salary_components_status_check_ee520df2',
            "\"status\" IN ('ACTIVE', 'INACTIVE')",
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'salary_template_lines',
        columns: [
          col('base_component_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('calc', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('component_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('order', 'int2', { notNull: true, codecRef: { codecId: 'pg/int2@1' } }),
          col('template_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('value', 'numeric(14,4)', {
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 14, scale: 4 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'salary_template_lines_calc_check_84e82abd',
            "\"calc\" IN ('FIXED', 'PCT_OF', 'MIN_WAGE', 'BALANCE')",
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'salary_templates',
        columns: [
          col('client_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('code', 'character varying(40)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 40 } },
          }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('created_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('name', 'character varying(120)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 120 } },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('ACTIVE'),
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'salary_templates_status_check_ee520df2',
            "\"status\" IN ('ACTIVE', 'INACTIVE')",
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'sessions',
        columns: [
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('expires_at', 'timestamptz(6)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('ip', 'inet', { codecRef: { codecId: 'pg/inet@1' } }),
          col('refresh_token_hash', 'character varying(128)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 128 } },
          }),
          col('revoked_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('user_agent', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('user_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'app',
        table: 'sites',
        columns: [
          col('address', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('client_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('code', 'character varying(30)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 30 } },
          }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('created_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('geofence_m', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('lat', 'numeric(9,6)', {
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 9, scale: 6 } },
          }),
          col('lng', 'numeric(9,6)', {
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 9, scale: 6 } },
          }),
          col('min_wage_zone', 'character varying(20)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 20 } },
          }),
          col('name', 'character varying(200)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 200 } },
          }),
          col('state_code', 'character varying(4)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 4 } },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('ACTIVE'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('updated_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression('sites_status_check_ee520df2', "\"status\" IN ('ACTIVE', 'INACTIVE')"),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'sms_outbox',
        columns: [
          col('body', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('delivery_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('to_mobile', 'character varying(15)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 15 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'app',
        table: 'states',
        columns: [
          col('code', 'character varying(4)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 4 } },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('lwf_applies', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('name', 'character varying(80)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 80 } },
          }),
          col('pt_applies', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('rules_complete_through', 'date', { codecRef: { codecId: 'pg/date-temporal@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'app',
        table: 'statutory_rules',
        columns: [
          col('approved_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('approved_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('code', 'character varying(40)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 40 } },
          }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('created_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('effective_from', 'date', {
            notNull: true,
            codecRef: { codecId: 'pg/date-temporal@1' },
          }),
          col('effective_to', 'date', { codecRef: { codecId: 'pg/date-temporal@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('note', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('source_url', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('value', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'statutory_rules_effective_order_8f4f959a',
            'effective_to IS NULL OR effective_to >= effective_from',
          ),
          checkExpression(
            'statutory_rules_maker_checker_49c0af58',
            'approved_by IS NULL OR created_by IS NULL OR approved_by <> created_by',
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'supervisor_cost_allocations',
        columns: [
          col('amount_paise', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('basis', 'character varying(20)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 20 } },
          }),
          col('client_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('run_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('supervisor_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'app',
        table: 'travel_logs',
        columns: [
          col('approved_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('created_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('date', 'date', { notNull: true, codecRef: { codecId: 'pg/date-temporal@1' } }),
          col('employee_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('from_site_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('km', 'numeric(7,1)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 7, scale: 1 } },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('PENDING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('to_site_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'travel_logs_maker_checker_49c0af58',
            'approved_by IS NULL OR created_by IS NULL OR approved_by <> created_by',
          ),
          checkExpression(
            'travel_logs_status_check_56005a61',
            "\"status\" IN ('PENDING', 'APPROVED', 'REJECTED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'user_site_scopes',
        columns: [
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('created_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('effective_from', 'date', {
            notNull: true,
            codecRef: { codecId: 'pg/date-temporal@1' },
          }),
          col('effective_to', 'date', { codecRef: { codecId: 'pg/date-temporal@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('site_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('user_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'user_site_scopes_effective_order_8f4f959a',
            'effective_to IS NULL OR effective_to >= effective_from',
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'users',
        columns: [
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('created_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('email', 'character varying(254)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 254 } },
          }),
          col('employee_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('expires_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('firebase_uid', 'character varying(128)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 128 } },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('last_login_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('mobile', 'character varying(15)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 15 } },
          }),
          col('name', 'character varying(120)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 120 } },
          }),
          col('role', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('ACTIVE'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('updated_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'users_role_check_51bf2c02',
            "\"role\" IN ('ADMIN', 'PAYROLL', 'HR', 'ACCOUNTS', 'AUDITOR', 'SUPERVISOR', 'EMPLOYEE')",
          ),
          checkExpression(
            'users_status_check_5c7ad8aa',
            "\"status\" IN ('ACTIVE', 'LOCKED', 'DISABLED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'app',
        table: 'work_orders',
        columns: [
          col('client_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('from_date', 'date', { notNull: true, codecRef: { codecId: 'pg/date-temporal@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('licence_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('number', 'character varying(60)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 60 } },
          }),
          col('to_date', 'date', { codecRef: { codecId: 'pg/date-temporal@1' } }),
          col('workers', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'audit',
        table: 'audit_log',
        columns: [
          col('action', 'character varying(60)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 60 } },
          }),
          col('actor_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('after', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('before', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('entity', 'character varying(60)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 60 } },
          }),
          col('entity_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('ip', 'inet', { codecRef: { codecId: 'pg/inet@1' } }),
          col('reason', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'vault',
        table: 'aadhaar_records',
        columns: [
          col('aadhaar_enc', 'bytea', { notNull: true, codecRef: { codecId: 'pg/bytea@1' } }),
          col('card_image_key', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('created_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('daily_worker_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('employee_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('key_version', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('last4', 'character(4)', {
            notNull: true,
            codecRef: { codecId: 'sql/char@1', typeParams: { length: 4 } },
          }),
          col('lookup_hmac', 'character varying(64)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 64 } },
          }),
          col('removed_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'aadhaar_one_subject_686dea94',
            'num_nonnulls(employee_id, daily_worker_id) = 1',
          ),
        ],
      }),
      this.addUnique({
        schema: 'app',
        table: 'access_tokens',
        constraint: 'access_tokens_token_hash_key',
        columns: ['token_hash'],
      }),
      this.addUnique({
        schema: 'app',
        table: 'attendance_days',
        constraint: 'attendance_days_employee_id_date_key',
        columns: ['employee_id', 'date'],
      }),
      this.addUnique({
        schema: 'app',
        table: 'attendance_import_rows',
        constraint: 'attendance_import_rows_import_id_row_no_key',
        columns: ['import_id', 'row_no'],
      }),
      this.addUnique({
        schema: 'app',
        table: 'attendance_months',
        constraint: 'attendance_months_employee_id_month_key',
        columns: ['employee_id', 'month'],
      }),
      this.addUnique({
        schema: 'app',
        table: 'cash_payouts',
        constraint: 'cash_payouts_run_line_id_key',
        columns: ['run_line_id'],
      }),
      this.addUnique({
        schema: 'app',
        table: 'cash_payouts',
        constraint: 'cash_payouts_cash_release_id_daily_worker_id_key',
        columns: ['cash_release_id', 'daily_worker_id'],
      }),
      this.addUnique({
        schema: 'app',
        table: 'clients',
        constraint: 'clients_code_key',
        columns: ['code'],
      }),
      this.addUnique({
        schema: 'app',
        table: 'daily_work_entries',
        constraint: 'daily_work_entries_worker_site_date_key',
        columns: ['daily_worker_id', 'site_id', 'work_date'],
      }),
      this.addUnique({
        schema: 'app',
        table: 'daily_workers',
        constraint: 'daily_workers_code_key',
        columns: ['code'],
      }),
      this.addUnique({
        schema: 'app',
        table: 'daily_workers',
        constraint: 'daily_workers_converted_employee_id_key',
        columns: ['converted_employee_id'],
      }),
      this.addUnique({
        schema: 'app',
        table: 'employee_salary_lines',
        constraint: 'employee_salary_lines_structure_id_component_id_key',
        columns: ['structure_id', 'component_id'],
      }),
      this.addUnique({
        schema: 'app',
        table: 'employee_statutory',
        constraint: 'employee_statutory_uan_key',
        columns: ['uan'],
      }),
      this.addUnique({
        schema: 'app',
        table: 'employee_statutory',
        constraint: 'employee_statutory_esi_ip_no_key',
        columns: ['esi_ip_no'],
      }),
      this.addUnique({
        schema: 'app',
        table: 'employees',
        constraint: 'employees_code_key',
        columns: ['code'],
      }),
      this.addUnique({
        schema: 'app',
        table: 'establishments',
        constraint: 'establishments_type_code_key',
        columns: ['type', 'code'],
      }),
      this.addUnique({
        schema: 'app',
        table: 'holidays',
        constraint: 'holidays_level_scope_key_date_key',
        columns: ['level', 'scope_key', 'date'],
      }),
      this.addUnique({
        schema: 'app',
        table: 'import_rows',
        constraint: 'import_rows_job_id_row_no_key',
        columns: ['job_id', 'row_no'],
      }),
      this.addUnique({
        schema: 'app',
        table: 'leave_types',
        constraint: 'leave_types_code_client_id_key',
        columns: ['code', 'client_id'],
      }),
      this.addUnique({
        schema: 'app',
        table: 'payroll_runs',
        constraint: 'payroll_runs_client_id_type_period_from_version_key',
        columns: ['client_id', 'type', 'period_from', 'version'],
      }),
      this.addUnique({
        schema: 'app',
        table: 'payslip_documents',
        constraint: 'payslip_documents_superseded_by_id_key',
        columns: ['superseded_by_id'],
      }),
      this.addUnique({
        schema: 'app',
        table: 'payslip_documents',
        constraint: 'payslip_documents_run_line_id_version_key',
        columns: ['run_line_id', 'version'],
      }),
      this.addUnique({
        schema: 'app',
        table: 'run_lines',
        constraint: 'run_lines_run_id_employee_id_key',
        columns: ['run_id', 'employee_id'],
      }),
      this.addUnique({
        schema: 'app',
        table: 'salary_components',
        constraint: 'salary_components_code_key',
        columns: ['code'],
      }),
      this.addUnique({
        schema: 'app',
        table: 'salary_template_lines',
        constraint: 'salary_template_lines_template_id_component_id_key',
        columns: ['template_id', 'component_id'],
      }),
      this.addUnique({
        schema: 'app',
        table: 'salary_templates',
        constraint: 'salary_templates_code_key',
        columns: ['code'],
      }),
      this.addUnique({
        schema: 'app',
        table: 'sessions',
        constraint: 'sessions_refresh_token_hash_key',
        columns: ['refresh_token_hash'],
      }),
      this.addUnique({
        schema: 'app',
        table: 'sites',
        constraint: 'sites_code_key',
        columns: ['code'],
      }),
      this.addUnique({
        schema: 'app',
        table: 'sms_outbox',
        constraint: 'sms_outbox_delivery_id_key',
        columns: ['delivery_id'],
      }),
      this.addUnique({
        schema: 'app',
        table: 'states',
        constraint: 'states_code_key',
        columns: ['code'],
      }),
      this.addUnique({
        schema: 'app',
        table: 'supervisor_cost_allocations',
        constraint: 'supervisor_cost_alloc_run_sup_client_key',
        columns: ['run_id', 'supervisor_id', 'client_id'],
      }),
      this.addUnique({
        schema: 'app',
        table: 'users',
        constraint: 'users_mobile_key',
        columns: ['mobile'],
      }),
      this.addUnique({
        schema: 'app',
        table: 'users',
        constraint: 'users_email_key',
        columns: ['email'],
      }),
      this.addUnique({
        schema: 'app',
        table: 'users',
        constraint: 'users_employee_id_key',
        columns: ['employee_id'],
      }),
      this.addUnique({
        schema: 'app',
        table: 'users',
        constraint: 'users_firebase_uid_key',
        columns: ['firebase_uid'],
      }),
      this.addUnique({
        schema: 'vault',
        table: 'aadhaar_records',
        constraint: 'aadhaar_records_employee_id_key',
        columns: ['employee_id'],
      }),
      this.addUnique({
        schema: 'vault',
        table: 'aadhaar_records',
        constraint: 'aadhaar_records_daily_worker_id_key',
        columns: ['daily_worker_id'],
      }),
      this.addUnique({
        schema: 'vault',
        table: 'aadhaar_records',
        constraint: 'aadhaar_records_lookup_hmac_key',
        columns: ['lookup_hmac'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'access_log',
        index: 'access_log_document_id_at_idx_b5c18b32',
        columns: ['document_id', 'at'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'access_log',
        index: 'access_log_document_id_idx_d3d0944e',
        columns: ['document_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'access_log',
        index: 'access_log_token_id_idx_2a2e7769',
        columns: ['token_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'access_tokens',
        index: 'access_tokens_document_id_idx_d3d0944e',
        columns: ['document_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'advances',
        index: 'advances_employee_id_idx_a830a6c3',
        columns: ['employee_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'advances',
        index: 'advances_employee_id_status_idx_fbbcd5ac',
        columns: ['employee_id', 'status'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'attendance_corrections',
        index: 'attendance_corrections_attendance_day_id_idx_411ffc94',
        columns: ['attendance_day_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'attendance_corrections',
        index: 'attendance_corrections_status_created_at_idx_1bbe8adf',
        columns: ['status', 'created_at'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'attendance_days',
        index: 'attendance_days_employee_id_idx_a830a6c3',
        columns: ['employee_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'attendance_days',
        index: 'attendance_days_import_id_idx_42683119',
        columns: ['import_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'attendance_days',
        index: 'attendance_days_site_id_date_idx_2eb74e82',
        columns: ['site_id', 'date'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'attendance_days',
        index: 'attendance_days_site_id_idx_99208b9d',
        columns: ['site_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'attendance_import_rows',
        index: 'attendance_import_rows_import_id_idx_42683119',
        columns: ['import_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'attendance_imports',
        index: 'attendance_imports_client_id_idx_1bb5a570',
        columns: ['client_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'attendance_imports',
        index: 'attendance_imports_client_id_month_status_idx_51ef61ad',
        columns: ['client_id', 'month', 'status'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'attendance_months',
        index: 'attendance_months_employee_id_idx_a830a6c3',
        columns: ['employee_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'attendance_months',
        index: 'attendance_months_site_id_idx_99208b9d',
        columns: ['site_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'bank_accounts',
        index: 'bank_accounts_employee_id_idx_a830a6c3',
        columns: ['employee_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'cash_payouts',
        index: 'cash_payouts_cash_release_id_idx_55cf4ebd',
        columns: ['cash_release_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'cash_payouts',
        index: 'cash_payouts_daily_worker_id_idx_5e7a6284',
        columns: ['daily_worker_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'cash_payouts',
        index: 'cash_payouts_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'cash_releases',
        index: 'cash_releases_daily_payout_batch_id_idx_58f148bb',
        columns: ['daily_payout_batch_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'cash_releases',
        index: 'cash_releases_run_id_idx_61d39f90',
        columns: ['run_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'cash_releases',
        index: 'cash_releases_site_id_idx_99208b9d',
        columns: ['site_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'cash_releases',
        index: 'cash_releases_supervisor_id_idx_3f7e38d5',
        columns: ['supervisor_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'cash_releases',
        index: 'cash_releases_supervisor_id_status_idx_8895f67e',
        columns: ['supervisor_id', 'status'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'cash_returns',
        index: 'cash_returns_cash_release_id_idx_55cf4ebd',
        columns: ['cash_release_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'challans',
        index: 'challans_compliance_file_id_idx_af665ab7',
        columns: ['compliance_file_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'clients',
        index: 'clients_esi_establishment_id_idx_47180918',
        columns: ['esi_establishment_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'clients',
        index: 'clients_pf_establishment_id_idx_7f37ee03',
        columns: ['pf_establishment_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'compliance_files',
        index: 'compliance_files_establishment_id_idx_4e16893a',
        columns: ['establishment_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'compliance_files',
        index: 'compliance_files_establishment_id_wage_month_type_idx_6be513f9',
        columns: ['establishment_id', 'wage_month', 'type'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'consents',
        index: 'consents_subject_type_subject_id_idx_83ee5f00',
        columns: ['subject_type', 'subject_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'contractor_licences',
        index: 'contractor_licences_state_code_idx_defea6c7',
        columns: ['state_code'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'daily_payout_batches',
        index: 'daily_payout_batches_site_id_idx_99208b9d',
        columns: ['site_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'daily_payout_batches',
        index: 'daily_payout_batches_site_id_period_from_idx_af2ca122',
        columns: ['site_id', 'period_from'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'daily_work_entries',
        index: 'daily_work_entries_daily_worker_id_idx_5e7a6284',
        columns: ['daily_worker_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'daily_work_entries',
        index: 'daily_work_entries_payout_batch_id_idx_43bf589b',
        columns: ['payout_batch_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'daily_work_entries',
        index: 'daily_work_entries_site_id_idx_99208b9d',
        columns: ['site_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'daily_work_entries',
        index: 'daily_work_entries_site_id_work_date_status_idx_20431d06',
        columns: ['site_id', 'work_date', 'status'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'daily_workers',
        index: 'daily_workers_mobile_idx_5e13aa01',
        columns: ['mobile'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'deliveries',
        index: 'deliveries_batch_id_idx_49ba28fa',
        columns: ['batch_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'deliveries',
        index: 'deliveries_batch_id_status_idx_66fc6971',
        columns: ['batch_id', 'status'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'deliveries',
        index: 'deliveries_document_id_idx_d3d0944e',
        columns: ['document_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'deliveries',
        index: 'deliveries_provider_msg_id_idx_35b14376',
        columns: ['provider_msg_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'deliveries',
        index: 'deliveries_template_id_idx_dc536619',
        columns: ['template_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'delivery_batches',
        index: 'delivery_batches_run_id_idx_61d39f90',
        columns: ['run_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'deployments',
        index: 'deployments_employee_id_effective_from_idx_8735e9e6',
        columns: ['employee_id', 'effective_from'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'deployments',
        index: 'deployments_employee_id_idx_a830a6c3',
        columns: ['employee_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'deployments',
        index: 'deployments_site_id_effective_from_idx_01ad66d6',
        columns: ['site_id', 'effective_from'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'deployments',
        index: 'deployments_site_id_idx_99208b9d',
        columns: ['site_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'employee_documents',
        index: 'employee_documents_employee_id_idx_a830a6c3',
        columns: ['employee_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'employee_events',
        index: 'employee_events_employee_id_date_idx_0e1be92b',
        columns: ['employee_id', 'date'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'employee_events',
        index: 'employee_events_employee_id_idx_a830a6c3',
        columns: ['employee_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'employee_salary_lines',
        index: 'employee_salary_lines_component_id_idx_ebd7854e',
        columns: ['component_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'employee_salary_lines',
        index: 'employee_salary_lines_structure_id_idx_a0aa01d6',
        columns: ['structure_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'employee_salary_structures',
        index: 'employee_salary_structures_employee_effective_idx_8735e9e6',
        columns: ['employee_id', 'effective_from'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'employee_salary_structures',
        index: 'employee_salary_structures_employee_id_idx_a830a6c3',
        columns: ['employee_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'employee_salary_structures',
        index: 'employee_salary_structures_template_id_idx_dc536619',
        columns: ['template_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'employees',
        index: 'employees_legacy_code_idx_885503e7',
        columns: ['legacy_code'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'employees',
        index: 'employees_mobile_idx_5e13aa01',
        columns: ['mobile'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'employees',
        index: 'employees_status_staff_type_idx_492a2c36',
        columns: ['status', 'staff_type'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'export_jobs',
        index: 'export_jobs_created_by_created_at_idx_5706e5ce',
        columns: ['created_by', 'created_at'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'export_jobs',
        index: 'export_jobs_layout_id_idx_dbb3a04e',
        columns: ['layout_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'export_layouts',
        index: 'export_layouts_client_id_idx_1bb5a570',
        columns: ['client_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'fnf_cases',
        index: 'fnf_cases_employee_id_idx_a830a6c3',
        columns: ['employee_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'fnf_cases',
        index: 'fnf_cases_exit_event_id_idx_63222960',
        columns: ['exit_event_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'fnf_cases',
        index: 'fnf_cases_nominee_id_idx_ccbbf6f5',
        columns: ['nominee_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'fnf_cases',
        index: 'fnf_cases_run_id_idx_61d39f90',
        columns: ['run_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'fnf_cases',
        index: 'fnf_cases_status_due_by_idx_c3b44b4f',
        columns: ['status', 'due_by'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'holidays',
        index: 'holidays_date_idx_b4ca319c',
        columns: ['date'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'import_jobs',
        index: 'import_jobs_type_created_at_idx_4eec2ffa',
        columns: ['type', 'created_at'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'import_rows',
        index: 'import_rows_job_id_idx_58a5bbdd',
        columns: ['job_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'leave_applications',
        index: 'leave_applications_employee_id_from_date_idx_2b97d807',
        columns: ['employee_id', 'from_date'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'leave_applications',
        index: 'leave_applications_employee_id_idx_a830a6c3',
        columns: ['employee_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'leave_applications',
        index: 'leave_applications_leave_type_id_idx_c3bccc73',
        columns: ['leave_type_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'leave_applications',
        index: 'leave_applications_status_created_at_idx_1bbe8adf',
        columns: ['status', 'created_at'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'leave_ledger',
        index: 'leave_ledger_application_id_idx_e32e1f6e',
        columns: ['application_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'leave_ledger',
        index: 'leave_ledger_employee_id_idx_a830a6c3',
        columns: ['employee_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'leave_ledger',
        index: 'leave_ledger_employee_id_leave_type_id_date_idx_20d22a96',
        columns: ['employee_id', 'leave_type_id', 'date'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'leave_ledger',
        index: 'leave_ledger_leave_type_id_idx_c3bccc73',
        columns: ['leave_type_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'leave_types',
        index: 'leave_types_client_id_idx_1bb5a570',
        columns: ['client_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'login_events',
        index: 'login_events_mobile_at_idx_a351206a',
        columns: ['mobile', 'at'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'login_events',
        index: 'login_events_user_id_at_idx_4554bec2',
        columns: ['user_id', 'at'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'login_events',
        index: 'login_events_user_id_idx_6c952402',
        columns: ['user_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'lwf_rates',
        index: 'lwf_rates_state_code_effective_from_idx_71fcda0f',
        columns: ['state_code', 'effective_from'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'lwf_rates',
        index: 'lwf_rates_state_code_idx_defea6c7',
        columns: ['state_code'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'message_templates',
        index: 'message_templates_channel_kind_language_status_idx_636cb4db',
        columns: ['channel', 'kind', 'language', 'status'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'min_wages',
        index: 'min_wages_lookup_077fe675',
        columns: ['state_code', 'zone', 'skill_level', 'effective_from'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'min_wages',
        index: 'min_wages_state_code_idx_defea6c7',
        columns: ['state_code'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'nominees',
        index: 'nominees_employee_id_idx_a830a6c3',
        columns: ['employee_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'ot_approvals',
        index: 'ot_approvals_employee_id_idx_a830a6c3',
        columns: ['employee_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'ot_approvals',
        index: 'ot_approvals_site_id_date_idx_2eb74e82',
        columns: ['site_id', 'date'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'ot_approvals',
        index: 'ot_approvals_site_id_idx_99208b9d',
        columns: ['site_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'pay_settings',
        index: 'pay_settings_key_scope_scope_id_effective_from_idx_188b4bef',
        columns: ['key', 'scope', 'scope_id', 'effective_from'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'payment_batches',
        index: 'payment_batches_daily_payout_batch_id_idx_58f148bb',
        columns: ['daily_payout_batch_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'payment_batches',
        index: 'payment_batches_run_id_idx_61d39f90',
        columns: ['run_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'payments',
        index: 'payments_batch_id_idx_49ba28fa',
        columns: ['batch_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'payments',
        index: 'payments_daily_payout_batch_id_idx_58f148bb',
        columns: ['daily_payout_batch_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'payments',
        index: 'payments_run_line_id_idx_3d5557f6',
        columns: ['run_line_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'payroll_runs',
        index: 'payroll_runs_client_id_idx_1bb5a570',
        columns: ['client_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'payroll_runs',
        index: 'payroll_runs_parent_run_id_idx_6f286143',
        columns: ['parent_run_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'payroll_runs',
        index: 'payroll_runs_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'payslip_documents',
        index: 'payslip_documents_run_line_id_idx_3d5557f6',
        columns: ['run_line_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'pt_slabs',
        index: 'pt_slabs_state_code_effective_from_idx_71fcda0f',
        columns: ['state_code', 'effective_from'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'pt_slabs',
        index: 'pt_slabs_state_code_idx_defea6c7',
        columns: ['state_code'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'run_line_items',
        index: 'run_line_items_advance_id_idx_3f605505',
        columns: ['advance_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'run_line_items',
        index: 'run_line_items_component_id_idx_ebd7854e',
        columns: ['component_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'run_line_items',
        index: 'run_line_items_run_line_id_idx_3d5557f6',
        columns: ['run_line_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'run_lines',
        index: 'run_lines_employee_id_idx_a830a6c3',
        columns: ['employee_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'run_lines',
        index: 'run_lines_run_id_idx_61d39f90',
        columns: ['run_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'run_lines',
        index: 'run_lines_site_id_idx_99208b9d',
        columns: ['site_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'salary_template_lines',
        index: 'salary_template_lines_base_component_id_idx_fb17ca37',
        columns: ['base_component_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'salary_template_lines',
        index: 'salary_template_lines_component_id_idx_ebd7854e',
        columns: ['component_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'salary_template_lines',
        index: 'salary_template_lines_template_id_idx_dc536619',
        columns: ['template_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'salary_templates',
        index: 'salary_templates_client_id_idx_1bb5a570',
        columns: ['client_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'sessions',
        index: 'sessions_user_id_idx_6c952402',
        columns: ['user_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'sites',
        index: 'sites_client_id_idx_1bb5a570',
        columns: ['client_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'sites',
        index: 'sites_state_code_idx_defea6c7',
        columns: ['state_code'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'sms_outbox',
        index: 'sms_outbox_created_at_idx_225d8c0f',
        columns: ['created_at'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'statutory_rules',
        index: 'statutory_rules_code_effective_from_idx_b9082a33',
        columns: ['code', 'effective_from'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'supervisor_cost_allocations',
        index: 'supervisor_cost_allocations_client_id_idx_1bb5a570',
        columns: ['client_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'supervisor_cost_allocations',
        index: 'supervisor_cost_allocations_run_id_idx_61d39f90',
        columns: ['run_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'supervisor_cost_allocations',
        index: 'supervisor_cost_allocations_supervisor_id_idx_3f7e38d5',
        columns: ['supervisor_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'travel_logs',
        index: 'travel_logs_employee_id_date_idx_0e1be92b',
        columns: ['employee_id', 'date'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'travel_logs',
        index: 'travel_logs_employee_id_idx_a830a6c3',
        columns: ['employee_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'travel_logs',
        index: 'travel_logs_from_site_id_idx_1a09c171',
        columns: ['from_site_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'travel_logs',
        index: 'travel_logs_to_site_id_idx_2a1e2399',
        columns: ['to_site_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'user_site_scopes',
        index: 'user_site_scopes_site_id_idx_99208b9d',
        columns: ['site_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'user_site_scopes',
        index: 'user_site_scopes_user_id_idx_6c952402',
        columns: ['user_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'users',
        index: 'users_role_status_idx_e87879e1',
        columns: ['role', 'status'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'work_orders',
        index: 'work_orders_client_id_idx_1bb5a570',
        columns: ['client_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'work_orders',
        index: 'work_orders_licence_id_idx_6fc7fb9f',
        columns: ['licence_id'],
      }),
      this.createIndex({
        schema: 'audit',
        table: 'audit_log',
        index: 'audit_log_actor_id_at_idx_ce8d02b6',
        columns: ['actor_id', 'at'],
      }),
      this.createIndex({
        schema: 'audit',
        table: 'audit_log',
        index: 'audit_log_at_idx_a7b89566',
        columns: ['at'],
      }),
      this.createIndex({
        schema: 'audit',
        table: 'audit_log',
        index: 'audit_log_entity_entity_id_at_idx_422beade',
        columns: ['entity', 'entity_id', 'at'],
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'access_log',
        foreignKey: {
          name: 'access_log_token_id_fkey',
          columns: ['token_id'],
          references: { schema: 'app', table: 'access_tokens', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'access_log',
        foreignKey: {
          name: 'access_log_document_id_fkey',
          columns: ['document_id'],
          references: { schema: 'app', table: 'payslip_documents', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'access_tokens',
        foreignKey: {
          name: 'access_tokens_document_id_fkey',
          columns: ['document_id'],
          references: { schema: 'app', table: 'payslip_documents', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'advances',
        foreignKey: {
          name: 'advances_employee_id_fkey',
          columns: ['employee_id'],
          references: { schema: 'app', table: 'employees', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'attendance_corrections',
        foreignKey: {
          name: 'attendance_corrections_attendance_day_id_fkey',
          columns: ['attendance_day_id'],
          references: { schema: 'app', table: 'attendance_days', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'attendance_days',
        foreignKey: {
          name: 'attendance_days_employee_id_fkey',
          columns: ['employee_id'],
          references: { schema: 'app', table: 'employees', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'attendance_days',
        foreignKey: {
          name: 'attendance_days_site_id_fkey',
          columns: ['site_id'],
          references: { schema: 'app', table: 'sites', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'attendance_days',
        foreignKey: {
          name: 'attendance_days_import_id_fkey',
          columns: ['import_id'],
          references: { schema: 'app', table: 'attendance_imports', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'attendance_import_rows',
        foreignKey: {
          name: 'attendance_import_rows_import_id_fkey',
          columns: ['import_id'],
          references: { schema: 'app', table: 'attendance_imports', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'attendance_imports',
        foreignKey: {
          name: 'attendance_imports_client_id_fkey',
          columns: ['client_id'],
          references: { schema: 'app', table: 'clients', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'attendance_months',
        foreignKey: {
          name: 'attendance_months_employee_id_fkey',
          columns: ['employee_id'],
          references: { schema: 'app', table: 'employees', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'attendance_months',
        foreignKey: {
          name: 'attendance_months_site_id_fkey',
          columns: ['site_id'],
          references: { schema: 'app', table: 'sites', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'bank_accounts',
        foreignKey: {
          name: 'bank_accounts_employee_id_fkey',
          columns: ['employee_id'],
          references: { schema: 'app', table: 'employees', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'cash_payouts',
        foreignKey: {
          name: 'cash_payouts_cash_release_id_fkey',
          columns: ['cash_release_id'],
          references: { schema: 'app', table: 'cash_releases', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'cash_payouts',
        foreignKey: {
          name: 'cash_payouts_run_line_id_fkey',
          columns: ['run_line_id'],
          references: { schema: 'app', table: 'run_lines', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'cash_payouts',
        foreignKey: {
          name: 'cash_payouts_daily_worker_id_fkey',
          columns: ['daily_worker_id'],
          references: { schema: 'app', table: 'daily_workers', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'cash_releases',
        foreignKey: {
          name: 'cash_releases_site_id_fkey',
          columns: ['site_id'],
          references: { schema: 'app', table: 'sites', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'cash_releases',
        foreignKey: {
          name: 'cash_releases_run_id_fkey',
          columns: ['run_id'],
          references: { schema: 'app', table: 'payroll_runs', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'cash_releases',
        foreignKey: {
          name: 'cash_releases_daily_payout_batch_id_fkey',
          columns: ['daily_payout_batch_id'],
          references: { schema: 'app', table: 'daily_payout_batches', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'cash_releases',
        foreignKey: {
          name: 'cash_releases_supervisor_id_fkey',
          columns: ['supervisor_id'],
          references: { schema: 'app', table: 'employees', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'cash_returns',
        foreignKey: {
          name: 'cash_returns_cash_release_id_fkey',
          columns: ['cash_release_id'],
          references: { schema: 'app', table: 'cash_releases', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'challans',
        foreignKey: {
          name: 'challans_compliance_file_id_fkey',
          columns: ['compliance_file_id'],
          references: { schema: 'app', table: 'compliance_files', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'clients',
        foreignKey: {
          name: 'clients_pf_establishment_id_fkey',
          columns: ['pf_establishment_id'],
          references: { schema: 'app', table: 'establishments', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'clients',
        foreignKey: {
          name: 'clients_esi_establishment_id_fkey',
          columns: ['esi_establishment_id'],
          references: { schema: 'app', table: 'establishments', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'compliance_files',
        foreignKey: {
          name: 'compliance_files_establishment_id_fkey',
          columns: ['establishment_id'],
          references: { schema: 'app', table: 'establishments', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'contractor_licences',
        foreignKey: {
          name: 'contractor_licences_state_code_fkey',
          columns: ['state_code'],
          references: { schema: 'app', table: 'states', columns: ['code'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'daily_payout_batches',
        foreignKey: {
          name: 'daily_payout_batches_site_id_fkey',
          columns: ['site_id'],
          references: { schema: 'app', table: 'sites', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'daily_work_entries',
        foreignKey: {
          name: 'daily_work_entries_daily_worker_id_fkey',
          columns: ['daily_worker_id'],
          references: { schema: 'app', table: 'daily_workers', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'daily_work_entries',
        foreignKey: {
          name: 'daily_work_entries_site_id_fkey',
          columns: ['site_id'],
          references: { schema: 'app', table: 'sites', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'daily_work_entries',
        foreignKey: {
          name: 'daily_work_entries_payout_batch_id_fkey',
          columns: ['payout_batch_id'],
          references: { schema: 'app', table: 'daily_payout_batches', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'daily_workers',
        foreignKey: {
          name: 'daily_workers_converted_employee_id_fkey',
          columns: ['converted_employee_id'],
          references: { schema: 'app', table: 'employees', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'deliveries',
        foreignKey: {
          name: 'deliveries_batch_id_fkey',
          columns: ['batch_id'],
          references: { schema: 'app', table: 'delivery_batches', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'deliveries',
        foreignKey: {
          name: 'deliveries_document_id_fkey',
          columns: ['document_id'],
          references: { schema: 'app', table: 'payslip_documents', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'deliveries',
        foreignKey: {
          name: 'deliveries_template_id_fkey',
          columns: ['template_id'],
          references: { schema: 'app', table: 'message_templates', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'delivery_batches',
        foreignKey: {
          name: 'delivery_batches_run_id_fkey',
          columns: ['run_id'],
          references: { schema: 'app', table: 'payroll_runs', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'deployments',
        foreignKey: {
          name: 'deployments_employee_id_fkey',
          columns: ['employee_id'],
          references: { schema: 'app', table: 'employees', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'deployments',
        foreignKey: {
          name: 'deployments_site_id_fkey',
          columns: ['site_id'],
          references: { schema: 'app', table: 'sites', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'employee_documents',
        foreignKey: {
          name: 'employee_documents_employee_id_fkey',
          columns: ['employee_id'],
          references: { schema: 'app', table: 'employees', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'employee_events',
        foreignKey: {
          name: 'employee_events_employee_id_fkey',
          columns: ['employee_id'],
          references: { schema: 'app', table: 'employees', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'employee_salary_lines',
        foreignKey: {
          name: 'employee_salary_lines_structure_id_fkey',
          columns: ['structure_id'],
          references: { schema: 'app', table: 'employee_salary_structures', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'employee_salary_lines',
        foreignKey: {
          name: 'employee_salary_lines_component_id_fkey',
          columns: ['component_id'],
          references: { schema: 'app', table: 'salary_components', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'employee_salary_structures',
        foreignKey: {
          name: 'employee_salary_structures_employee_id_fkey',
          columns: ['employee_id'],
          references: { schema: 'app', table: 'employees', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'employee_salary_structures',
        foreignKey: {
          name: 'employee_salary_structures_template_id_fkey',
          columns: ['template_id'],
          references: { schema: 'app', table: 'salary_templates', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'employee_statutory',
        foreignKey: {
          name: 'employee_statutory_employee_id_fkey',
          columns: ['employee_id'],
          references: { schema: 'app', table: 'employees', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'export_jobs',
        foreignKey: {
          name: 'export_jobs_layout_id_fkey',
          columns: ['layout_id'],
          references: { schema: 'app', table: 'export_layouts', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'export_layouts',
        foreignKey: {
          name: 'export_layouts_client_id_fkey',
          columns: ['client_id'],
          references: { schema: 'app', table: 'clients', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'fnf_cases',
        foreignKey: {
          name: 'fnf_cases_employee_id_fkey',
          columns: ['employee_id'],
          references: { schema: 'app', table: 'employees', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'fnf_cases',
        foreignKey: {
          name: 'fnf_cases_exit_event_id_fkey',
          columns: ['exit_event_id'],
          references: { schema: 'app', table: 'employee_events', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'fnf_cases',
        foreignKey: {
          name: 'fnf_cases_run_id_fkey',
          columns: ['run_id'],
          references: { schema: 'app', table: 'payroll_runs', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'fnf_cases',
        foreignKey: {
          name: 'fnf_cases_nominee_id_fkey',
          columns: ['nominee_id'],
          references: { schema: 'app', table: 'nominees', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'import_rows',
        foreignKey: {
          name: 'import_rows_job_id_fkey',
          columns: ['job_id'],
          references: { schema: 'app', table: 'import_jobs', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'leave_applications',
        foreignKey: {
          name: 'leave_applications_employee_id_fkey',
          columns: ['employee_id'],
          references: { schema: 'app', table: 'employees', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'leave_applications',
        foreignKey: {
          name: 'leave_applications_leave_type_id_fkey',
          columns: ['leave_type_id'],
          references: { schema: 'app', table: 'leave_types', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'leave_ledger',
        foreignKey: {
          name: 'leave_ledger_employee_id_fkey',
          columns: ['employee_id'],
          references: { schema: 'app', table: 'employees', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'leave_ledger',
        foreignKey: {
          name: 'leave_ledger_leave_type_id_fkey',
          columns: ['leave_type_id'],
          references: { schema: 'app', table: 'leave_types', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'leave_ledger',
        foreignKey: {
          name: 'leave_ledger_application_id_fkey',
          columns: ['application_id'],
          references: { schema: 'app', table: 'leave_applications', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'leave_types',
        foreignKey: {
          name: 'leave_types_client_id_fkey',
          columns: ['client_id'],
          references: { schema: 'app', table: 'clients', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'login_events',
        foreignKey: {
          name: 'login_events_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'app', table: 'users', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'lwf_rates',
        foreignKey: {
          name: 'lwf_rates_state_code_fkey',
          columns: ['state_code'],
          references: { schema: 'app', table: 'states', columns: ['code'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'min_wages',
        foreignKey: {
          name: 'min_wages_state_code_fkey',
          columns: ['state_code'],
          references: { schema: 'app', table: 'states', columns: ['code'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'nominees',
        foreignKey: {
          name: 'nominees_employee_id_fkey',
          columns: ['employee_id'],
          references: { schema: 'app', table: 'employees', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'ot_approvals',
        foreignKey: {
          name: 'ot_approvals_site_id_fkey',
          columns: ['site_id'],
          references: { schema: 'app', table: 'sites', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'ot_approvals',
        foreignKey: {
          name: 'ot_approvals_employee_id_fkey',
          columns: ['employee_id'],
          references: { schema: 'app', table: 'employees', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'payment_batches',
        foreignKey: {
          name: 'payment_batches_run_id_fkey',
          columns: ['run_id'],
          references: { schema: 'app', table: 'payroll_runs', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'payment_batches',
        foreignKey: {
          name: 'payment_batches_daily_payout_batch_id_fkey',
          columns: ['daily_payout_batch_id'],
          references: { schema: 'app', table: 'daily_payout_batches', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'payments',
        foreignKey: {
          name: 'payments_run_line_id_fkey',
          columns: ['run_line_id'],
          references: { schema: 'app', table: 'run_lines', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'payments',
        foreignKey: {
          name: 'payments_daily_payout_batch_id_fkey',
          columns: ['daily_payout_batch_id'],
          references: { schema: 'app', table: 'daily_payout_batches', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'payments',
        foreignKey: {
          name: 'payments_batch_id_fkey',
          columns: ['batch_id'],
          references: { schema: 'app', table: 'payment_batches', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'payroll_runs',
        foreignKey: {
          name: 'payroll_runs_client_id_fkey',
          columns: ['client_id'],
          references: { schema: 'app', table: 'clients', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'payroll_runs',
        foreignKey: {
          name: 'payroll_runs_parent_run_id_fkey',
          columns: ['parent_run_id'],
          references: { schema: 'app', table: 'payroll_runs', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'payslip_documents',
        foreignKey: {
          name: 'payslip_documents_run_line_id_fkey',
          columns: ['run_line_id'],
          references: { schema: 'app', table: 'run_lines', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'payslip_documents',
        foreignKey: {
          name: 'payslip_documents_superseded_by_id_fkey',
          columns: ['superseded_by_id'],
          references: { schema: 'app', table: 'payslip_documents', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'pt_slabs',
        foreignKey: {
          name: 'pt_slabs_state_code_fkey',
          columns: ['state_code'],
          references: { schema: 'app', table: 'states', columns: ['code'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'run_line_items',
        foreignKey: {
          name: 'run_line_items_run_line_id_fkey',
          columns: ['run_line_id'],
          references: { schema: 'app', table: 'run_lines', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'run_line_items',
        foreignKey: {
          name: 'run_line_items_component_id_fkey',
          columns: ['component_id'],
          references: { schema: 'app', table: 'salary_components', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'run_line_items',
        foreignKey: {
          name: 'run_line_items_advance_id_fkey',
          columns: ['advance_id'],
          references: { schema: 'app', table: 'advances', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'run_lines',
        foreignKey: {
          name: 'run_lines_run_id_fkey',
          columns: ['run_id'],
          references: { schema: 'app', table: 'payroll_runs', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'run_lines',
        foreignKey: {
          name: 'run_lines_employee_id_fkey',
          columns: ['employee_id'],
          references: { schema: 'app', table: 'employees', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'run_lines',
        foreignKey: {
          name: 'run_lines_site_id_fkey',
          columns: ['site_id'],
          references: { schema: 'app', table: 'sites', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'salary_template_lines',
        foreignKey: {
          name: 'salary_template_lines_template_id_fkey',
          columns: ['template_id'],
          references: { schema: 'app', table: 'salary_templates', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'salary_template_lines',
        foreignKey: {
          name: 'salary_template_lines_component_id_fkey',
          columns: ['component_id'],
          references: { schema: 'app', table: 'salary_components', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'salary_template_lines',
        foreignKey: {
          name: 'salary_template_lines_base_component_id_fkey',
          columns: ['base_component_id'],
          references: { schema: 'app', table: 'salary_components', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'salary_templates',
        foreignKey: {
          name: 'salary_templates_client_id_fkey',
          columns: ['client_id'],
          references: { schema: 'app', table: 'clients', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'sessions',
        foreignKey: {
          name: 'sessions_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'app', table: 'users', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'sites',
        foreignKey: {
          name: 'sites_client_id_fkey',
          columns: ['client_id'],
          references: { schema: 'app', table: 'clients', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'sites',
        foreignKey: {
          name: 'sites_state_code_fkey',
          columns: ['state_code'],
          references: { schema: 'app', table: 'states', columns: ['code'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'sms_outbox',
        foreignKey: {
          name: 'sms_outbox_delivery_id_fkey',
          columns: ['delivery_id'],
          references: { schema: 'app', table: 'deliveries', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'supervisor_cost_allocations',
        foreignKey: {
          name: 'supervisor_cost_allocations_run_id_fkey',
          columns: ['run_id'],
          references: { schema: 'app', table: 'payroll_runs', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'supervisor_cost_allocations',
        foreignKey: {
          name: 'supervisor_cost_allocations_supervisor_id_fkey',
          columns: ['supervisor_id'],
          references: { schema: 'app', table: 'employees', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'supervisor_cost_allocations',
        foreignKey: {
          name: 'supervisor_cost_allocations_client_id_fkey',
          columns: ['client_id'],
          references: { schema: 'app', table: 'clients', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'travel_logs',
        foreignKey: {
          name: 'travel_logs_employee_id_fkey',
          columns: ['employee_id'],
          references: { schema: 'app', table: 'employees', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'travel_logs',
        foreignKey: {
          name: 'travel_logs_from_site_id_fkey',
          columns: ['from_site_id'],
          references: { schema: 'app', table: 'sites', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'travel_logs',
        foreignKey: {
          name: 'travel_logs_to_site_id_fkey',
          columns: ['to_site_id'],
          references: { schema: 'app', table: 'sites', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'user_site_scopes',
        foreignKey: {
          name: 'user_site_scopes_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'app', table: 'users', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'user_site_scopes',
        foreignKey: {
          name: 'user_site_scopes_site_id_fkey',
          columns: ['site_id'],
          references: { schema: 'app', table: 'sites', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'users',
        foreignKey: {
          name: 'users_employee_id_fkey',
          columns: ['employee_id'],
          references: { schema: 'app', table: 'employees', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'work_orders',
        foreignKey: {
          name: 'work_orders_client_id_fkey',
          columns: ['client_id'],
          references: { schema: 'app', table: 'clients', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'work_orders',
        foreignKey: {
          name: 'work_orders_licence_id_fkey',
          columns: ['licence_id'],
          references: { schema: 'app', table: 'contractor_licences', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'vault',
        table: 'aadhaar_records',
        foreignKey: {
          name: 'aadhaar_records_employee_id_fkey',
          columns: ['employee_id'],
          references: { schema: 'app', table: 'employees', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'vault',
        table: 'aadhaar_records',
        foreignKey: {
          name: 'aadhaar_records_daily_worker_id_fkey',
          columns: ['daily_worker_id'],
          references: { schema: 'app', table: 'daily_workers', columns: ['id'] },
        },
      }),
      // Database rules the contract cannot express: sql/001_extras.sql
      ...extrasSteps(),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
