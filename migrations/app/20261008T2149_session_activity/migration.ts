#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/0d5b643b1717f7b621577426a668d366a68d19a6a8899065b714e12da0ce6849/contract';
import endContract from '../../snapshots/0d5b643b1717f7b621577426a668d366a68d19a6a8899065b714e12da0ce6849/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/5698b565a20802657df773d0786ba4b418eed52b5499e4dc9a79bd0ad3b2663c/contract';
import startContract from '../../snapshots/5698b565a20802657df773d0786ba4b418eed52b5499e4dc9a79bd0ad3b2663c/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'app',
        table: 'session_activity',
        columns: [
          col('last_seen_at', 'timestamptz(6)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
          }),
          col('session_id', 'character varying(64)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 64 } },
          }),
          col('user_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [primaryKey(['session_id'])],
      }),
      this.createIndex({
        schema: 'app',
        table: 'session_activity',
        index: 'session_activity_user_id_idx_6c952402',
        columns: ['user_id'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
