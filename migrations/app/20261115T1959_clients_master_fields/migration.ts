#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/03056ddc505f1f8f1e1ea51a972e157148a510d08c1bef828e272821765aaae6/contract';
import endContract from '../../snapshots/03056ddc505f1f8f1e1ea51a972e157148a510d08c1bef828e272821765aaae6/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/0d5b643b1717f7b621577426a668d366a68d19a6a8899065b714e12da0ce6849/contract';
import startContract from '../../snapshots/0d5b643b1717f7b621577426a668d366a68d19a6a8899065b714e12da0ce6849/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
  rawSql,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'app',
        table: 'client_contacts',
        columns: [
          col('client_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('created_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('email', 'character varying(254)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 254 } },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('is_attendance_sender', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('name', 'character varying(120)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 120 } },
          }),
          col('phone', 'character varying(20)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 20 } },
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
            'client_contacts_role_check_ee81f616',
            "\"role\" IN ('HR', 'ACCOUNTS', 'SITE_INCHARGE', 'OTHER')",
          ),
          checkExpression(
            'client_contacts_status_check_ee520df2',
            "\"status\" IN ('ACTIVE', 'INACTIVE')",
          ),
        ],
      }),
      this.addColumn({
        schema: 'app',
        table: 'clients',
        column: col('contract_end', 'date', { codecRef: { codecId: 'pg/date-temporal@1' } }),
      }),
      this.addColumn({
        schema: 'app',
        table: 'clients',
        column: col('contract_start', 'date', { codecRef: { codecId: 'pg/date-temporal@1' } }),
      }),
      this.addColumn({
        schema: 'app',
        table: 'clients',
        column: col('pan', 'character(10)', {
          codecRef: { codecId: 'sql/char@1', typeParams: { length: 10 } },
        }),
      }),
      this.addColumn({
        schema: 'app',
        table: 'clients',
        column: col('registered_address', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'app',
        table: 'clients',
        column: col('work_order_number', 'character varying(60)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 60 } },
        }),
      }),
      this.addColumn({
        schema: 'app',
        table: 'clients',
        column: col('state_code', 'character varying(4)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 4 } },
        }),
      }),
      // Existing clients (dev data only; nothing is live): take the state of their first site, else MP.
      rawSql({
        id: 'backfill.clients.state_code',
        label: 'backfill clients.state_code from the first site, else MP',
        operationClass: 'data',
        target: { id: 'postgres' },
        precheck: [],
        execute: [
          {
            description: 'backfill clients.state_code',
            sql: "UPDATE app.clients c SET state_code = COALESCE((SELECT s.state_code FROM app.sites s WHERE s.client_id = c.id ORDER BY s.created_at LIMIT 1), 'MP') WHERE c.state_code IS NULL",
            params: [],
          },
        ],
        postcheck: [],
      }),
      this.setNotNull({ schema: 'app', table: 'clients', column: 'state_code' }),
      this.addCheckConstraint({
        schema: 'app',
        table: 'clients',
        constraint: 'clients_code_format_1f8023d7',
        expression: "code ~ '^[A-Z0-9][A-Z0-9-]{2,19}$'",
      }),
      this.addCheckConstraint({
        schema: 'app',
        table: 'clients',
        constraint: 'clients_contract_order_c0da0e19',
        expression:
          'contract_end IS NULL OR contract_start IS NULL OR contract_end >= contract_start',
      }),
      this.addCheckConstraint({
        schema: 'app',
        table: 'clients',
        constraint: 'clients_gstin_format_7e7c2c4c',
        expression: "gstin IS NULL OR gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'",
      }),
      this.addCheckConstraint({
        schema: 'app',
        table: 'clients',
        constraint: 'clients_pan_format_f9588a7c',
        expression: "pan IS NULL OR pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'",
      }),
      this.addUnique({
        schema: 'app',
        table: 'clients',
        constraint: 'clients_gstin_key',
        columns: ['gstin'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'client_contacts',
        index: 'client_contacts_client_id_idx_1bb5a570',
        columns: ['client_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'clients',
        index: 'clients_state_code_idx_defea6c7',
        columns: ['state_code'],
      }),
      rawSql({
        id: 'extras.client_contacts_one_sender',
        label: 'one active attendance sender per client',
        operationClass: 'additive',
        target: { id: 'postgres' },
        precheck: [],
        execute: [
          {
            description: 'one active attendance sender per client',
            sql: "CREATE UNIQUE INDEX client_contacts_one_sender ON app.client_contacts (client_id) WHERE is_attendance_sender AND status = 'ACTIVE'",
            params: [],
          },
        ],
        postcheck: [],
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'client_contacts',
        foreignKey: {
          name: 'client_contacts_client_id_fkey',
          columns: ['client_id'],
          references: { schema: 'app', table: 'clients', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'clients',
        foreignKey: {
          name: 'clients_state_code_fkey',
          columns: ['state_code'],
          references: { schema: 'app', table: 'states', columns: ['code'] },
        },
      }),
      rawSql({
        id: 'clients.code_lock.function',
        label: 'clients: short code is fixed once payroll has run (M2-CLI-01 AC4)',
        operationClass: 'additive',
        target: { id: 'postgres' },
        precheck: [],
        execute: [
          {
            description: 'function app.forbid_client_code_change',
            sql: `CREATE OR REPLACE FUNCTION app.forbid_client_code_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM app.payroll_runs r WHERE r.client_id = OLD.id AND r.status <> 'DRAFT') THEN
    RAISE EXCEPTION 'clients.code cannot change once payroll has run for the client'
      USING ERRCODE = '23514', CONSTRAINT = 'clients_code_locked';
  END IF;
  RETURN NEW;
END;
$$`,
            params: [],
          },
        ],
        postcheck: [],
      }),
      rawSql({
        id: 'clients.code_lock.trigger',
        label: 'clients: trigger for the short-code lock',
        operationClass: 'additive',
        target: { id: 'postgres' },
        precheck: [],
        execute: [
          {
            description: 'trigger clients_code_lock',
            sql: `CREATE TRIGGER clients_code_lock
  BEFORE UPDATE OF code ON app.clients
  FOR EACH ROW WHEN (OLD.code IS DISTINCT FROM NEW.code)
  EXECUTE FUNCTION app.forbid_client_code_change()`,
            params: [],
          },
        ],
        postcheck: [],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
