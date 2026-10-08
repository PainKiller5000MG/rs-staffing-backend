#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/3912b9610501b034f4067c38fad8c1d33675ea21a7f219a195ab250bffab3033/contract';
import startContract from '../../snapshots/3912b9610501b034f4067c38fad8c1d33675ea21a7f219a195ab250bffab3033/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/fbdb70c9c517031dd1ce2535c63a4c2e82795a406c66eec939c10c3b16a243b8/contract';
import endContract from '../../snapshots/fbdb70c9c517031dd1ce2535c63a4c2e82795a406c66eec939c10c3b16a243b8/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'app',
        table: 'idempotency_keys',
        columns: [
          col('created_at', 'timestamptz(6)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('key', 'character varying(100)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 100 } },
          }),
          col('method', 'character varying(10)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 10 } },
          }),
          col('path', 'character varying(300)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 300 } },
          }),
          col('request_hash', 'character(64)', {
            notNull: true,
            codecRef: { codecId: 'sql/char@1', typeParams: { length: 64 } },
          }),
          col('response', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('status', 'int2', { notNull: true, codecRef: { codecId: 'pg/int2@1' } }),
          col('user_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'app',
        table: 'idempotency_keys',
        constraint: 'idempotency_keys_user_id_key_key',
        columns: ['user_id', 'key'],
      }),
      this.createIndex({
        schema: 'app',
        table: 'idempotency_keys',
        index: 'idempotency_keys_created_at_idx_225d8c0f',
        columns: ['created_at'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
