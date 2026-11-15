#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/105e2ce81bcfb34b6aaed7d77a717a5fc40e28aa3944904d2737b4ee40b7fb22/contract';
import startContract from '../../snapshots/105e2ce81bcfb34b6aaed7d77a717a5fc40e28aa3944904d2737b4ee40b7fb22/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/9a589209addd0b9c2bd6a7f2c564434df705dbcbdd40fc75b93df37c92c3a73f/contract';
import endContract from '../../snapshots/9a589209addd0b9c2bd6a7f2c564434df705dbcbdd40fc75b93df37c92c3a73f/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
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
        table: 'attendance_layouts',
        columns: [
          col('client_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('confirmed_at', 'timestamptz(6)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('confirmed_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('created_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('definition', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('header_fingerprint', 'character varying(128)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 128 } },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('layout_key', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('name', 'character varying(120)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 120 } },
          }),
          col('site_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('version', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'attendance_layouts_confirmed_80e96171',
            '(confirmed_by IS NULL) = (confirmed_at IS NULL)',
          ),
          checkExpression('attendance_layouts_version_positive_c2490804', 'version >= 1'),
        ],
      }),
      this.addColumn({
        schema: 'app',
        table: 'attendance_imports',
        column: col('layout_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
      }),
      this.addUnique({
        schema: 'app',
        table: 'attendance_layouts',
        constraint: 'attendance_layouts_layout_key_version_key',
        columns: ['layout_key', 'version'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'attendance_imports',
        index: 'attendance_imports_layout_id_idx_dbb3a04e',
        columns: ['layout_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'attendance_layouts',
        index: 'attendance_layouts_client_id_idx_1bb5a570',
        columns: ['client_id'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'attendance_layouts',
        index: 'attendance_layouts_client_id_layout_key_idx_8476666c',
        columns: ['client_id', 'layout_key'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'attendance_layouts',
        index: 'attendance_layouts_site_id_idx_99208b9d',
        columns: ['site_id'],
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'attendance_layouts',
        foreignKey: {
          name: 'attendance_layouts_client_id_fkey',
          columns: ['client_id'],
          references: { schema: 'app', table: 'clients', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'attendance_layouts',
        foreignKey: {
          name: 'attendance_layouts_site_id_fkey',
          columns: ['site_id'],
          references: { schema: 'app', table: 'sites', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'attendance_imports',
        foreignKey: {
          name: 'attendance_imports_layout_id_fkey',
          columns: ['layout_id'],
          references: { schema: 'app', table: 'attendance_layouts', columns: ['id'] },
        },
      }),
      rawSql({
        id: 'extras.attendance_layouts_immutable',
        label: 'attendance layout versions are immutable (M2-SET-05 AC4)',
        operationClass: 'additive',
        target: { id: 'postgres' },
        precheck: [],
        execute: [
          {
            description: 'trigger attendance_layouts_append_only',
            sql: 'CREATE TRIGGER attendance_layouts_append_only BEFORE UPDATE OR DELETE ON app.attendance_layouts FOR EACH ROW EXECUTE FUNCTION audit.forbid_change()',
            params: [],
          },
        ],
        postcheck: [],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
