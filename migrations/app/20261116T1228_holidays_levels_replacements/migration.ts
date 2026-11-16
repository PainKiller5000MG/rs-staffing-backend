#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/8bf32e323e13fcb93fbcc99b84bb29a4166ac0a2fda21e4de2b743d228cc2927/contract';
import endContract from '../../snapshots/8bf32e323e13fcb93fbcc99b84bb29a4166ac0a2fda21e4de2b743d228cc2927/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/0f6703d7cdb8808f84b241caa333ad36086bc568e713ef1a12640bf580b04542/contract';
import startContract from '../../snapshots/0f6703d7cdb8808f84b241caa333ad36086bc568e713ef1a12640bf580b04542/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  rawSql,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropConstraint({
        schema: 'app',
        table: 'holidays',
        constraint: 'holidays_level_scope_key_date_key',
      }),
      this.createTable({
        schema: 'app',
        table: 'holiday_replacements',
        columns: [
          col('client_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('created_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('holiday_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('removed_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('removed_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('replacement_date', 'date', {
            notNull: true,
            codecRef: { codecId: 'pg/date-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'holiday_replacements_removed_together_a0981901',
            '(removed_at IS NULL) = (removed_by IS NULL)',
          ),
        ],
      }),
      this.addColumn({
        schema: 'app',
        table: 'holidays',
        column: col('half', 'bool', {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      this.addColumn({
        schema: 'app',
        table: 'holidays',
        column: col('removed_at', 'timestamptz(6)', {
          codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
        }),
      }),
      this.addColumn({
        schema: 'app',
        table: 'holidays',
        column: col('removed_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
      }),
      this.addColumn({
        schema: 'app',
        table: 'holidays',
        column: col('year', 'int2', { codecRef: { codecId: 'pg/int2@1' } }),
      }),
      rawSql({
        id: 'holidays.backfill_year',
        label: 'backfill holidays.year from date',
        operationClass: 'additive',
        target: { id: 'postgres' },
        precheck: [],
        execute: [{ description: 'backfill holidays.year from date', sql: 'UPDATE app.holidays SET year = EXTRACT(YEAR FROM date)', params: [] }],
        postcheck: [],
      }),
      this.setNotNull({ schema: 'app', table: 'holidays', column: 'year' }),
      this.addCheckConstraint({
        schema: 'app',
        table: 'holidays',
        constraint: 'holidays_national_paid_fixed_6abe4056',
        expression: "level <> 'NATIONAL' OR (paid AND NOT optional AND NOT half)",
      }),
      this.addCheckConstraint({
        schema: 'app',
        table: 'holidays',
        constraint: 'holidays_removed_together_a0981901',
        expression: '(removed_at IS NULL) = (removed_by IS NULL)',
      }),
      this.addCheckConstraint({
        schema: 'app',
        table: 'holidays',
        constraint: 'holidays_scope_key_by_level_42a63ec2',
        expression: "(level = 'NATIONAL') = (scope_key IS NULL)",
      }),
      this.addCheckConstraint({
        schema: 'app',
        table: 'holidays',
        constraint: 'holidays_year_matches_date_4953e491',
        expression: 'year = EXTRACT(YEAR FROM date)',
      }),
      this.createIndex({
        schema: 'app',
        table: 'holiday_replacements',
        index: 'holiday_replacements_client_id_idx_1bb5a570',
        columns: ['client_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'holiday_replacements',
        index: 'holiday_replacements_holiday_id_idx_57087977',
        columns: ['holiday_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'holidays',
        index: 'holidays_level_scope_key_year_idx_1d504125',
        columns: ['level', 'scope_key', 'year'],
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'holiday_replacements',
        foreignKey: {
          name: 'holiday_replacements_client_id_fkey',
          columns: ['client_id'],
          references: { schema: 'app', table: 'clients', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'holiday_replacements',
        foreignKey: {
          name: 'holiday_replacements_holiday_id_fkey',
          columns: ['holiday_id'],
          references: { schema: 'app', table: 'holidays', columns: ['id'] },
        },
      }),
      rawSql({
        id: 'extras.holidays_live_unique',
        label: 'one live holiday per level, scope and date (M14-HOL-01 AC4; national included)',
        operationClass: 'additive',
        target: { id: 'postgres' },
        precheck: [],
        execute: [{ description: 'one live holiday per level, scope and date (M14-HOL-01 AC4; national included)', sql: 'CREATE UNIQUE INDEX holidays_live_unique ON app.holidays (level, scope_key, date) NULLS NOT DISTINCT WHERE removed_at IS NULL', params: [] }],
        postcheck: [],
      }),
      rawSql({
        id: 'extras.holiday_replacements_live_unique',
        label: 'a client replaces a state holiday at most once (M14-HOL-02)',
        operationClass: 'additive',
        target: { id: 'postgres' },
        precheck: [],
        execute: [{ description: 'a client replaces a state holiday at most once (M14-HOL-02)', sql: 'CREATE UNIQUE INDEX holiday_replacements_live_unique ON app.holiday_replacements (client_id, holiday_id) WHERE removed_at IS NULL', params: [] }],
        postcheck: [],
      }),
      rawSql({
        id: 'extras.holiday_replacements_fn',
        label: 'replaced holiday must be a state holiday (M14-HOL-02 AC2)',
        operationClass: 'additive',
        target: { id: 'postgres' },
        precheck: [],
        execute: [{ description: 'replaced holiday must be a state holiday (M14-HOL-02 AC2)', sql: "CREATE FUNCTION app.holiday_replacement_state_only() RETURNS trigger LANGUAGE plpgsql AS $f$\nBEGIN\n  IF NOT EXISTS (SELECT 1 FROM app.holidays h WHERE h.id = NEW.holiday_id AND h.level = 'STATE' AND h.removed_at IS NULL) THEN\n    RAISE EXCEPTION 'only a state holiday can be replaced by a client' USING ERRCODE = '23514', CONSTRAINT = 'holiday_replacements_state_only';\n  END IF;\n  IF NEW.replacement_date = (SELECT date FROM app.holidays WHERE id = NEW.holiday_id) THEN\n    RAISE EXCEPTION 'the replacement day must differ from the holiday' USING ERRCODE = '23514', CONSTRAINT = 'holiday_replacements_other_day';\n  END IF;\n  RETURN NEW;\nEND $f$", params: [] }],
        postcheck: [],
      }),
      rawSql({
        id: 'extras.holiday_replacements_trg',
        label: 'trigger holiday_replacements_state_only',
        operationClass: 'additive',
        target: { id: 'postgres' },
        precheck: [],
        execute: [{ description: 'trigger holiday_replacements_state_only', sql: 'CREATE TRIGGER holiday_replacements_state_only BEFORE INSERT ON app.holiday_replacements FOR EACH ROW EXECUTE FUNCTION app.holiday_replacement_state_only()', params: [] }],
        postcheck: [],
      }),
      rawSql({
        id: 'holidays.national_seed',
        label: 'national holidays for every year 2000..2100 (M14-HOL-01 AC2)',
        operationClass: 'additive',
        target: { id: 'postgres' },
        precheck: [],
        execute: [
          {
            description: 'insert 26 Jan, 15 Aug and 2 Oct for each year (idempotent)',
            sql: "INSERT INTO app.holidays (id, level, scope_key, date, year, name, paid, optional, half) SELECT gen_random_uuid(), 'NATIONAL', NULL, make_date(y, m, d), y, n, true, false, false FROM generate_series(2000, 2100) AS y CROSS JOIN (VALUES (1, 26, 'Republic Day'), (8, 15, 'Independence Day'), (10, 2, 'Gandhi Jayanti')) AS t(m, d, n) WHERE NOT EXISTS (SELECT 1 FROM app.holidays h WHERE h.level = 'NATIONAL' AND h.date = make_date(y, m, d) AND h.removed_at IS NULL)",
            params: [],
          },
        ],
        postcheck: [],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
