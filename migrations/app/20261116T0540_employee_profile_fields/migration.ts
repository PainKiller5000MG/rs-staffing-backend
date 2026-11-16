#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/9a589209addd0b9c2bd6a7f2c564434df705dbcbdd40fc75b93df37c92c3a73f/contract';
import startContract from '../../snapshots/9a589209addd0b9c2bd6a7f2c564434df705dbcbdd40fc75b93df37c92c3a73f/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/a3806aa4366b1f33f502ea9d7805ca34ad18b912c3732878ce8a4583c88943a9/contract';
import endContract from '../../snapshots/a3806aa4366b1f33f502ea9d7805ca34ad18b912c3732878ce8a4583c88943a9/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'app',
        table: 'employees',
        column: col('aadhaar_last4', 'character(4)', {
          codecRef: { codecId: 'sql/char@1', typeParams: { length: 4 } },
        }),
      }),
      this.addColumn({
        schema: 'app',
        table: 'employees',
        column: col('alt_phone', 'character varying(15)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 15 } },
        }),
      }),
      this.addColumn({
        schema: 'app',
        table: 'employees',
        column: col('cur_address', 'character varying(300)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 300 } },
        }),
      }),
      this.addColumn({
        schema: 'app',
        table: 'employees',
        column: col('cur_pin', 'character(6)', {
          codecRef: { codecId: 'sql/char@1', typeParams: { length: 6 } },
        }),
      }),
      this.addColumn({
        schema: 'app',
        table: 'employees',
        column: col('cur_state_code', 'character varying(4)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 4 } },
        }),
      }),
      this.addColumn({
        schema: 'app',
        table: 'employees',
        column: col('father_name', 'character varying(120)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 120 } },
        }),
      }),
      this.addColumn({
        schema: 'app',
        table: 'employees',
        column: col('marital_status', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'app',
        table: 'employees',
        column: col('perm_address', 'character varying(300)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 300 } },
        }),
      }),
      this.addColumn({
        schema: 'app',
        table: 'employees',
        column: col('perm_pin', 'character(6)', {
          codecRef: { codecId: 'sql/char@1', typeParams: { length: 6 } },
        }),
      }),
      this.addColumn({
        schema: 'app',
        table: 'employees',
        column: col('perm_state_code', 'character varying(4)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 4 } },
        }),
      }),
      this.addCheckConstraint({
        schema: 'app',
        table: 'employee_statutory',
        constraint: 'employee_statutory_pan_format_e72d7d77',
        expression: "pan IS NULL OR pan ~ '^[A-Z]{3}[PCHFATBLJG][A-Z][0-9]{4}[A-Z]$'",
      }),
      this.addUnique({
        schema: 'app',
        table: 'employee_statutory',
        constraint: 'employee_statutory_pan_key',
        columns: ['pan'],
      }),
      this.addCheckConstraint({
        schema: 'app',
        table: 'employees',
        constraint: 'employees_adult_at_joining_5dd2111b',
        expression: "join_date IS NULL OR join_date >= (dob + interval '18 years')",
      }),
      this.addCheckConstraint({
        schema: 'app',
        table: 'employees',
        constraint: 'employees_cur_pin_format_4a9e7123',
        expression: "cur_pin IS NULL OR cur_pin ~ '^[1-9][0-9]{5}$'",
      }),
      this.addCheckConstraint({
        schema: 'app',
        table: 'employees',
        constraint: 'employees_marital_status_check_afe3a1d6',
        expression: "\"marital_status\" IN ('SINGLE', 'MARRIED', 'WIDOWED', 'DIVORCED')",
      }),
      this.addCheckConstraint({
        schema: 'app',
        table: 'employees',
        constraint: 'employees_perm_pin_format_17fd8b44',
        expression: "perm_pin IS NULL OR perm_pin ~ '^[1-9][0-9]{5}$'",
      }),
      this.createIndex({
        schema: 'app',
        table: 'employees',
        index: 'employees_cur_state_code_idx_d0ee84a6',
        columns: ['cur_state_code'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'employees',
        index: 'employees_perm_state_code_idx_2ed1e56f',
        columns: ['perm_state_code'],
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'employees',
        foreignKey: {
          name: 'employees_cur_state_code_fkey',
          columns: ['cur_state_code'],
          references: { schema: 'app', table: 'states', columns: ['code'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'employees',
        foreignKey: {
          name: 'employees_perm_state_code_fkey',
          columns: ['perm_state_code'],
          references: { schema: 'app', table: 'states', columns: ['code'] },
        },
      }),
      rawSql({
        id: 'employees.code_lock.function',
        label: 'employees: code is never changed (M3-PRF-01 AC2)',
        operationClass: 'additive',
        target: { id: 'postgres' },
        precheck: [],
        execute: [{ description: 'function app.forbid_employee_code_change', sql: `CREATE OR REPLACE FUNCTION app.forbid_employee_code_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'employees.code cannot change'
    USING ERRCODE = '23514', CONSTRAINT = 'employees_code_locked';
END;
$$`, params: [] }],
        postcheck: [],
      }),
      rawSql({
        id: 'employees.code_lock.trigger',
        label: 'employees: trigger for the code lock',
        operationClass: 'additive',
        target: { id: 'postgres' },
        precheck: [],
        execute: [{ description: 'trigger employees_code_lock', sql: `CREATE TRIGGER employees_code_lock
  BEFORE UPDATE OF code ON app.employees
  FOR EACH ROW WHEN (OLD.code IS DISTINCT FROM NEW.code)
  EXECUTE FUNCTION app.forbid_employee_code_change()`, params: [] }],
        postcheck: [],
      }),
      rawSql({
        id: 'employees.mobile_active_unique',
        label: 'employees: one active person per mobile; exit releases the number (M1-OTP-04)',
        operationClass: 'additive',
        target: { id: 'postgres' },
        precheck: [],
        execute: [{ description: 'unique index employees_mobile_active_key', sql: `CREATE UNIQUE INDEX employees_mobile_active_key ON app.employees (mobile) WHERE status <> 'EXITED'`, params: [] }],
        postcheck: [],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
