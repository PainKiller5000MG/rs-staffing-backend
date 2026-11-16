#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/8bf32e323e13fcb93fbcc99b84bb29a4166ac0a2fda21e4de2b743d228cc2927/contract';
import startContract from '../../snapshots/8bf32e323e13fcb93fbcc99b84bb29a4166ac0a2fda21e4de2b743d228cc2927/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/97e86f516ea9424e77b6ea7d62a19ee8fc12af108ec034e42b919dce1e9a2c70/contract';
import endContract from '../../snapshots/97e86f516ea9424e77b6ea7d62a19ee8fc12af108ec034e42b919dce1e9a2c70/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'app',
        table: 'deployments',
        column: col('kind', 'character varying(10)', {
          notNull: true,
          default: lit('DEPLOY'),
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 10 } },
        }),
      }),
      this.addColumn({
        schema: 'app',
        table: 'deployments',
        column: col('reason', 'character varying(200)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 200 } },
        }),
      }),
      this.addColumn({
        schema: 'app',
        table: 'deployments',
        column: col('template_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
      }),
      this.addColumn({
        schema: 'app',
        table: 'deployments',
        column: col('monthly_ctc_paise', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
      }),
      rawSql({
        id: 'backfill.deployments_ctc',
        label: 'backfill deployment CTC from the employee salary structure',
        operationClass: 'data',
        target: { id: 'postgres' },
        precheck: [],
        execute: [{ description: 'backfill deployment CTC from the employee salary structure', sql: 'UPDATE app.deployments d SET monthly_ctc_paise = COALESCE((SELECT s.monthly_gross_paise FROM app.employee_salary_structures s WHERE s.employee_id = d.employee_id ORDER BY s.effective_from DESC LIMIT 1), 100) WHERE d.monthly_ctc_paise IS NULL', params: [] }],
        postcheck: [],
      }),
      this.setNotNull({ schema: 'app', table: 'deployments', column: 'monthly_ctc_paise' }),
      this.addColumn({
        schema: 'app',
        table: 'deployments',
        column: col('skill_level', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      rawSql({
        id: 'backfill.deployments_skill',
        label: 'backfill deployment skill level from the employee',
        operationClass: 'data',
        target: { id: 'postgres' },
        precheck: [],
        execute: [{ description: 'backfill deployment skill level from the employee', sql: 'UPDATE app.deployments d SET skill_level = e.skill_level FROM app.employees e WHERE e.id = d.employee_id AND d.skill_level IS NULL', params: [] }],
        postcheck: [],
      }),
      this.setNotNull({ schema: 'app', table: 'deployments', column: 'skill_level' }),
      this.addCheckConstraint({
        schema: 'app',
        table: 'deployments',
        constraint: 'deployments_ctc_positive_fde0b6ab',
        expression: 'monthly_ctc_paise > 0',
      }),
      this.addCheckConstraint({
        schema: 'app',
        table: 'deployments',
        constraint: 'deployments_kind_values_2daca219',
        expression: "kind IN ('DEPLOY','REDEPLOY','REVISION')",
      }),
      this.addCheckConstraint({
        schema: 'app',
        table: 'deployments',
        constraint: 'deployments_skill_level_check_3d5f273a',
        expression: "\"skill_level\" IN ('UNSKILLED', 'SEMI_SKILLED', 'SKILLED', 'HIGHLY_SKILLED')",
      }),
      this.createIndex({
        schema: 'app',
        table: 'deployments',
        index: 'deployments_template_id_idx_dc536619',
        columns: ['template_id'],
      }),
      this.addForeignKey({
        schema: 'app',
        table: 'deployments',
        foreignKey: {
          name: 'deployments_template_id_fkey',
          columns: ['template_id'],
          references: { schema: 'app', table: 'salary_templates', columns: ['id'] },
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
