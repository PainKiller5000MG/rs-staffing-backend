#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/0f6703d7cdb8808f84b241caa333ad36086bc568e713ef1a12640bf580b04542/contract';
import endContract from '../../snapshots/0f6703d7cdb8808f84b241caa333ad36086bc568e713ef1a12640bf580b04542/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/a3806aa4366b1f33f502ea9d7805ca34ad18b912c3732878ce8a4583c88943a9/contract';
import startContract from '../../snapshots/a3806aa4366b1f33f502ea9d7805ca34ad18b912c3732878ce8a4583c88943a9/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'app',
        table: 'ifsc_codes',
        columns: [
          col('bank_name', 'character varying(80)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 80 } },
          }),
          col('branch', 'character varying(120)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 120 } },
          }),
          col('ifsc', 'character(11)', {
            notNull: true,
            codecRef: { codecId: 'sql/char@1', typeParams: { length: 11 } },
          }),
          col('updated_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
        ],
        constraints: [
          primaryKey(['ifsc']),
          checkExpression('ifsc_codes_format_f94934d9', "ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'"),
        ],
      }),
      this.addColumn({
        schema: 'app',
        table: 'bank_accounts',
        column: col('account_hmac', 'character varying(64)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 64 } },
        }),
      }),
      this.addColumn({
        schema: 'app',
        table: 'bank_accounts',
        column: col('account_type', 'text', {
          notNull: true,
          default: lit('SAVINGS'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'app',
        table: 'bank_accounts',
        column: col('bank_name', 'character varying(80)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 80 } },
        }),
      }),
      this.addColumn({
        schema: 'app',
        table: 'bank_accounts',
        column: col('bank_returned_name', 'character varying(120)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 120 } },
        }),
      }),
      this.addColumn({
        schema: 'app',
        table: 'bank_accounts',
        column: col('branch', 'character varying(120)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 120 } },
        }),
      }),
      this.addColumn({
        schema: 'app',
        table: 'bank_accounts',
        column: col('mismatch_approved_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
      }),
      this.addColumn({
        schema: 'app',
        table: 'bank_accounts',
        column: col('mismatch_reason', 'character varying(300)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 300 } },
        }),
      }),
      this.addColumn({
        schema: 'app',
        table: 'bank_accounts',
        column: col('name_match_score', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'app',
        table: 'bank_accounts',
        column: col('proof_key', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'app',
        table: 'bank_accounts',
        column: col('shared_override_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
      }),
      this.addColumn({
        schema: 'app',
        table: 'bank_accounts',
        column: col('shared_override_reason', 'character varying(300)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 300 } },
        }),
      }),
      this.addColumn({
        schema: 'app',
        table: 'bank_accounts',
        column: col('verify_status', 'text', {
          notNull: true,
          default: lit('PENDING'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addCheckConstraint({
        schema: 'app',
        table: 'bank_accounts',
        constraint: 'bank_accounts_account_type_check_9903954f',
        expression: "\"account_type\" IN ('SAVINGS', 'CURRENT')",
      }),
      this.addCheckConstraint({
        schema: 'app',
        table: 'bank_accounts',
        constraint: 'bank_accounts_approved_needs_verified_9160b4c1',
        expression:
          "approved_by IS NULL OR verify_status = 'VERIFIED' OR (verify_status = 'NAME_MISMATCH' AND mismatch_approved_by IS NOT NULL AND mismatch_reason IS NOT NULL)",
      }),
      this.addCheckConstraint({
        schema: 'app',
        table: 'bank_accounts',
        constraint: 'bank_accounts_mismatch_maker_checker_df76b1e4',
        expression:
          'mismatch_approved_by IS NULL OR created_by IS NULL OR mismatch_approved_by <> created_by',
      }),
      this.addCheckConstraint({
        schema: 'app',
        table: 'bank_accounts',
        constraint: 'bank_accounts_score_range_7c7cb17b',
        expression: 'name_match_score IS NULL OR (name_match_score BETWEEN 0 AND 100)',
      }),
      this.addCheckConstraint({
        schema: 'app',
        table: 'bank_accounts',
        constraint: 'bank_accounts_shared_override_reason_a50b05b8',
        expression: 'shared_override_by IS NULL OR shared_override_reason IS NOT NULL',
      }),
      this.addCheckConstraint({
        schema: 'app',
        table: 'bank_accounts',
        constraint: 'bank_accounts_verify_status_check_1d195c9d',
        expression: "\"verify_status\" IN ('PENDING', 'VERIFIED', 'NAME_MISMATCH', 'FAILED')",
      }),
      this.createIndex({
        schema: 'app',
        table: 'bank_accounts',
        index: 'bank_accounts_account_hmac_idx_64e5f05e',
        columns: ['account_hmac'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
