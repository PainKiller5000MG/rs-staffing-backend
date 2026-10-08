#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/3912b9610501b034f4067c38fad8c1d33675ea21a7f219a195ab250bffab3033/contract';
import endContract from '../../snapshots/3912b9610501b034f4067c38fad8c1d33675ea21a7f219a195ab250bffab3033/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/9f47ccbeba2ebfae57cceed881188fa4f5d994b2c2e42141a1a43fafbf351c0b/contract';
import startContract from '../../snapshots/9f47ccbeba2ebfae57cceed881188fa4f5d994b2c2e42141a1a43fafbf351c0b/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'app',
        table: 'lwf_rates',
        column: col('note', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'app',
        table: 'min_wages',
        column: col('note', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'app',
        table: 'pt_slabs',
        column: col('note', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
