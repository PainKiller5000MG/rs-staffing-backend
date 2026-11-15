#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/03056ddc505f1f8f1e1ea51a972e157148a510d08c1bef828e272821765aaae6/contract';
import startContract from '../../snapshots/03056ddc505f1f8f1e1ea51a972e157148a510d08c1bef828e272821765aaae6/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/105e2ce81bcfb34b6aaed7d77a717a5fc40e28aa3944904d2737b4ee40b7fb22/contract';
import endContract from '../../snapshots/105e2ce81bcfb34b6aaed7d77a717a5fc40e28aa3944904d2737b4ee40b7fb22/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'app',
        table: 'sites',
        column: col('incharge_name', 'character varying(120)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 120 } },
        }),
      }),
      this.addColumn({
        schema: 'app',
        table: 'sites',
        column: col('incharge_phone', 'character varying(20)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 20 } },
        }),
      }),
      this.addColumn({
        schema: 'app',
        table: 'sites',
        column: col('shift_end', 'character varying(5)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 5 } },
        }),
      }),
      this.addColumn({
        schema: 'app',
        table: 'sites',
        column: col('shift_start', 'character varying(5)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 5 } },
        }),
      }),
      this.addColumn({
        schema: 'app',
        table: 'sites',
        column: col('wage_sphere', 'character varying(7)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 7 } },
        }),
      }),
      this.addColumn({
        schema: 'app',
        table: 'user_site_scopes',
        column: col('is_primary', 'bool', {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      this.addColumn({
        schema: 'app',
        table: 'sites',
        column: col('district', 'character varying(80)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 80 } },
        }),
      }),
      // Existing sites (dev data only; nothing is live): district from the address's last word.
      rawSql({
        id: 'backfill.sites.district',
        label: 'backfill sites.district',
        operationClass: 'data',
        target: { id: 'postgres' },
        precheck: [],
        execute: [{ description: 'backfill sites.district', sql: "UPDATE app.sites SET district = COALESCE(NULLIF(trim(split_part(address, ',', 2)), ''), 'Unknown') WHERE district IS NULL", params: [] }],
        postcheck: [],
      }),
      this.setNotNull({ schema: 'app', table: 'sites', column: 'district' }),
      this.addColumn({
        schema: 'app',
        table: 'sites',
        column: col('pincode', 'character(6)', {
          codecRef: { codecId: 'sql/char@1', typeParams: { length: 6 } },
        }),
      }),
            rawSql({
        id: 'backfill.sites.pincode',
        label: 'backfill sites.pincode (placeholder 100000; dev data only)',
        operationClass: 'data',
        target: { id: 'postgres' },
        precheck: [],
        execute: [{ description: 'backfill sites.pincode (placeholder 100000; dev data only)', sql: "UPDATE app.sites SET pincode = '100000' WHERE pincode IS NULL", params: [] }],
        postcheck: [],
      }),
      this.setNotNull({ schema: 'app', table: 'sites', column: 'pincode' }),
      this.setDefault({
        schema: 'app',
        table: 'sites',
        column: 'address',
        defaultSql: "DEFAULT ''",
      }),
      this.addCheckConstraint({
        schema: 'app',
        table: 'sites',
        constraint: 'sites_lat_lng_range_dca82d1b',
        expression: 'lat IS NULL OR (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180)',
      }),
      this.addCheckConstraint({
        schema: 'app',
        table: 'sites',
        constraint: 'sites_lat_lng_together_0e7ee438',
        expression: '(lat IS NULL) = (lng IS NULL)',
      }),
      this.addCheckConstraint({
        schema: 'app',
        table: 'sites',
        constraint: 'sites_pincode_format_02a4aef6',
        expression: "pincode ~ '^[1-9][0-9]{5}$'",
      }),
      this.addCheckConstraint({
        schema: 'app',
        table: 'sites',
        constraint: 'sites_shift_end_format_5dda953e',
        expression: "shift_end IS NULL OR shift_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'",
      }),
      this.addCheckConstraint({
        schema: 'app',
        table: 'sites',
        constraint: 'sites_shift_start_format_0a5a3400',
        expression: "shift_start IS NULL OR shift_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'",
      }),
      this.addCheckConstraint({
        schema: 'app',
        table: 'sites',
        constraint: 'sites_wage_sphere_values_3e1a5a75',
        expression: "wage_sphere IS NULL OR wage_sphere IN ('CENTRAL','STATE')",
      }),
      rawSql({
        id: 'extras.user_site_scopes_one_primary',
        label: 'one approved primary supervisor per site',
        operationClass: 'additive',
        target: { id: 'postgres' },
        precheck: [],
        execute: [{ description: 'one approved primary supervisor per site', sql: "ALTER TABLE app.user_site_scopes ADD CONSTRAINT user_site_scopes_one_primary EXCLUDE USING gist (site_id WITH =, daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&) WHERE (is_primary AND approved_by IS NOT NULL)", params: [] }],
        postcheck: [],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
