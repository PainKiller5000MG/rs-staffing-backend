// Queries only, through the request's executor (its transaction on writes).
import { and, or } from '@prisma/orm-postgres/orm-client';
import type { Scalars } from '@prisma/orm-postgres/family-contract/types';
import type { Executor } from '../../core/context.ts';
import type { Models } from '../../prisma/contract.d.ts';
import type { Scope } from './settings.keys.ts';
import type { SettingRow } from './settings.resolve.ts';

type Row = Scalars<Models.app_PaySetting>;

export type Setting = SettingRow & {
  id: string;
  createdBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
};

export type SettingFilters = { scope: Scope; scopeId?: string; key?: string; cursor?: string; limit: number };

const dateOf = (s: string) => Temporal.PlainDate.from(s) as Row['effectiveFrom'];

const toSetting = (r: Row): Setting => ({
  id: r.id,
  scope: r.scope as Scope,
  scopeId: r.scopeId,
  key: r.key,
  value: r.value,
  effectiveFrom: r.effectiveFrom.toString(),
  effectiveTo: r.effectiveTo ? r.effectiveTo.toString() : null,
  approved: r.approvedBy != null,
  createdBy: r.createdBy,
  approvedBy: r.approvedBy,
  approvedAt: r.approvedAt ? r.approvedAt.toString() : null,
});

export class SettingsRepository {
  readonly #executor: Executor;

  constructor({ executor }: { executor: Executor }) {
    this.#executor = executor;
  }

  get #settings() {
    return this.#executor.orm.app.PaySetting;
  }

  async findById(id: string): Promise<Setting | null> {
    const row = await this.#settings.first({ id: id as Row['id'] });
    return row && toSetting(row);
  }

  /** Every row (any status) that can apply to this client / site: company, the client's, the site's. */
  async reaching(clientId?: string, siteId?: string): Promise<Setting[]> {
    const rows = await this.#settings
      .where((s) =>
        or(
          s.scope.eq('COMPANY'),
          ...(clientId ? [and(s.scope.eq('CLIENT'), s.scopeId.eq(clientId as Row['scopeId'] & string))] : []),
          ...(siteId ? [and(s.scope.eq('SITE'), s.scopeId.eq(siteId as Row['scopeId'] & string))] : []),
        ),
      )
      .all();
    return rows.map(toSetting);
  }

  /** Newest approved row for one scope + key (what a new value must start after). */
  async latestApproved(scope: Scope, scopeId: string | null, key: string): Promise<Setting | null> {
    const rows = await this.#settings
      .where((s) => and(s.scope.eq(scope), scopeId ? s.scopeId.eq(scopeId as Row['scopeId'] & string) : s.scopeId.isNull(), s.key.eq(key as Row['key']), s.approvedBy.isNotNull()))
      .orderBy((s) => s.effectiveFrom.desc())
      .limit(1)
      .all();
    return rows[0] ? toSetting(rows[0]) : null;
  }

  async list({ scope, scopeId, key, cursor, limit }: SettingFilters): Promise<Setting[]> {
    let query = this.#settings.where({ scope }).orderBy((s) => s.id.asc());
    if (scopeId) query = query.where({ scopeId: scopeId as Row['scopeId'] });
    if (key) query = key.includes(':') ? query.where({ key: key as Row['key'] }) : query.where((s) => or(s.key.eq(key as Row['key']), s.key.ilike(`${key}:%`)));
    if (cursor) query = query.where((s) => s.id.gt(cursor as Row['id']));
    return (await query.limit(limit).all()).map(toSetting);
  }

  async create(d: { scope: Scope; scopeId: string | null; key: string; value: string; effectiveFrom: string; createdBy: string }): Promise<Setting> {
    const row = await this.#settings.create({
      scope: d.scope,
      scopeId: d.scopeId as Row['scopeId'],
      key: d.key as Row['key'],
      value: d.value as Row['value'],
      effectiveFrom: dateOf(d.effectiveFrom),
      createdBy: d.createdBy as Row['createdBy'],
    });
    return toSetting(row);
  }

  async endOn(id: string, effectiveTo: string): Promise<void> {
    await this.#settings.where({ id: id as Row['id'] }).update({ effectiveTo: dateOf(effectiveTo) as Row['effectiveTo'] });
  }

  async approve(id: string, approvedBy: string): Promise<Setting> {
    const row = await this.#settings.where({ id: id as Row['id'] }).update({
      approvedBy: approvedBy as Row['approvedBy'],
      approvedAt: Temporal.Now.instant() as Row['approvedAt'],
    });
    if (!row) throw new Error(`setting ${id} vanished during approval`);
    return toSetting(row);
  }

  // --- parents -----------------------------------------------------------

  async client(id: string): Promise<{ status: string; payPeriodStartDay: number } | null> {
    const c = await this.#executor.orm.app.Client.first({ id: id as Scalars<Models.app_Client>['id'] });
    return c && { status: c.status, payPeriodStartDay: Number(c.payPeriodStartDay) };
  }

  async site(id: string): Promise<{ status: string; clientId: string } | null> {
    const s = await this.#executor.orm.app.Site.first({ id: id as Scalars<Models.app_Site>['id'] });
    return s && { status: s.status, clientId: s.clientId };
  }

  async template(id: string): Promise<{ status: string; clientId: string | null } | null> {
    const t = await this.#executor.orm.app.SalaryTemplate.first({ id: id as Scalars<Models.app_SalaryTemplate>['id'] });
    return t && { status: t.status, clientId: t.clientId };
  }
}
