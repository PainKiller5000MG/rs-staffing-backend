#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/323f070e1e05ab23a9eb2c61c44c545e3485f08c35440989d7de7793e1715fc3/contract';
import startContract from '../../snapshots/323f070e1e05ab23a9eb2c61c44c545e3485f08c35440989d7de7793e1715fc3/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/9f47ccbeba2ebfae57cceed881188fa4f5d994b2c2e42141a1a43fafbf351c0b/contract';
import endContract from '../../snapshots/9f47ccbeba2ebfae57cceed881188fa4f5d994b2c2e42141a1a43fafbf351c0b/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropTable({ schema: 'app', table: 'sessions' }),
      this.dropConstraint({ schema: 'app', table: 'users', constraint: 'users_firebase_uid_key' }),
      this.dropColumn({ schema: 'app', table: 'users', column: 'firebase_uid' }),
      this.addColumn({
        schema: 'app',
        table: 'user_site_scopes',
        column: col('approved_at', 'timestamptz(6)', {
          codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
        }),
      }),
      this.addColumn({
        schema: 'app',
        table: 'user_site_scopes',
        column: col('approved_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
      }),
      this.addColumn({
        schema: 'app',
        table: 'user_site_scopes',
        column: col('ended_at', 'timestamptz(6)', {
          codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 6 } },
        }),
      }),
      this.addColumn({
        schema: 'app',
        table: 'user_site_scopes',
        column: col('ended_by', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
      }),
      this.addColumn({
        schema: 'app',
        table: 'users',
        column: col('auth_user_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addCheckConstraint({
        schema: 'app',
        table: 'user_site_scopes',
        constraint: 'user_site_scopes_maker_checker_49c0af58',
        expression: 'approved_by IS NULL OR created_by IS NULL OR approved_by <> created_by',
      }),
      this.addUnique({
        schema: 'app',
        table: 'users',
        constraint: 'users_auth_user_id_key',
        columns: ['auth_user_id'],
      }),
      // Only live scopes may not overlap: pending (unapproved) and ended (revoked)
      // scopes grant nothing, and an ended one must not block re-granting the site.
      rawSql({
        id: 'user_site_scopes.no_overlap_live_only',
        label: 'no-overlap: supervisor site scopes (approved, not ended)',
        operationClass: 'widening',
        target: { id: 'postgres' },
        precheck: [],
        execute: [
          {
            description: 'replace user_site_scopes_no_overlap with a live-scopes-only version',
            sql: `ALTER TABLE app.user_site_scopes DROP CONSTRAINT user_site_scopes_no_overlap;
ALTER TABLE app.user_site_scopes
  ADD CONSTRAINT user_site_scopes_no_overlap
  EXCLUDE USING gist (
    user_id WITH =,
    site_id WITH =,
    daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&
  ) WHERE (approved_by IS NOT NULL AND ended_at IS NULL);`,
            params: [],
          },
        ],
        postcheck: [],
      }),
      // Better Auth's tables (user, session, account, verification) live here;
      // its own CLI creates them (npm run auth:migrate), not Prisma.
      rawSql({
        id: 'schema.auth',
        label: 'Create schema "auth" for Better Auth',
        operationClass: 'additive',
        target: { id: 'postgres' },
        precheck: [],
        execute: [{ description: 'create schema auth', sql: 'CREATE SCHEMA IF NOT EXISTS auth;', params: [] }],
        postcheck: [],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
