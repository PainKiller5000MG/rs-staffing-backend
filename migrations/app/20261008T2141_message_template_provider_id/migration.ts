#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/5698b565a20802657df773d0786ba4b418eed52b5499e4dc9a79bd0ad3b2663c/contract';
import endContract from '../../snapshots/5698b565a20802657df773d0786ba4b418eed52b5499e4dc9a79bd0ad3b2663c/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/fbdb70c9c517031dd1ce2535c63a4c2e82795a406c66eec939c10c3b16a243b8/contract';
import startContract from '../../snapshots/fbdb70c9c517031dd1ce2535c63a4c2e82795a406c66eec939c10c3b16a243b8/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'app',
        table: 'message_templates',
        column: col('provider_template_id', 'character varying(40)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 40 } },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
