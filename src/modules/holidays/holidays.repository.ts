// Queries only, through the request's executor (its transaction on writes).
import { and, or } from '@prisma/orm-postgres/orm-client';
import type { Scalars } from '@prisma/orm-postgres/family-contract/types';
import type { Executor } from '../../core/context.ts';
import type { HolidayLevel, HolidayRow, ReplacementRow, SiteReach } from '../../engine/calendar.ts';
import type { Models } from '../../prisma/contract.d.ts';

type Row = Scalars<Models.app_Holiday>;
type ReplRow = Scalars<Models.app_HolidayReplacement>;
type SiteRow = Scalars<Models.app_Site>;
type RunRow = Scalars<Models.app_PayrollRun>;

export type Holiday = HolidayRow & { year: number; createdBy: string | null; removedAt: string | null };
export type Replacement = ReplacementRow & { id: string; createdBy: string | null; removedAt: string | null };
export type HolidayFields = { level: HolidayLevel; scopeKey: string | null; date: string; year: number; name: string; paid: boolean; optional: boolean; half: boolean };
export type HolidayFilters = { year?: number; level?: HolidayLevel; key?: string; cursor?: string; limit: number };
export type RunTouch = { id: string; clientId: string | null; type: string; status: string; periodFrom: string; periodTo: string };

const dateOf = (s: string) => Temporal.PlainDate.from(s) as Row['date'];

const toHoliday = (r: Row): Holiday => ({
  id: r.id,
  level: r.level,
  scopeKey: r.scopeKey,
  date: r.date.toString(),
  year: Number(r.year),
  name: r.name,
  paid: r.paid,
  optional: r.optional,
  half: r.half,
  createdBy: r.createdBy,
  removedAt: r.removedAt ? r.removedAt.toString() : null,
});

const toReplacement = (r: ReplRow): Replacement => ({
  id: r.id,
  clientId: r.clientId,
  holidayId: r.holidayId,
  replacementDate: r.replacementDate.toString(),
  createdBy: r.createdBy,
  removedAt: r.removedAt ? r.removedAt.toString() : null,
});

export class HolidaysRepository {
  readonly #executor: Executor;

  constructor({ executor }: { executor: Executor }) {
    this.#executor = executor;
  }

  get #holidays() {
    return this.#executor.orm.app.Holiday;
  }

  get #replacements() {
    return this.#executor.orm.app.HolidayReplacement;
  }

  // --- holidays -----------------------------------------------------------

  async findById(id: string): Promise<Holiday | null> {
    const r = await this.#holidays.first({ id: id as Row['id'] });
    return r && toHoliday(r);
  }

  async list({ year, level, key, cursor, limit }: HolidayFilters): Promise<Holiday[]> {
    let query = this.#holidays.where((h) => h.removedAt.isNull()).orderBy((h) => h.id.asc());
    if (year) query = query.where({ year: year as Row['year'] });
    if (level) query = query.where({ level });
    if (key) query = query.where({ scopeKey: key as Row['scopeKey'] });
    if (cursor) query = query.where((h) => h.id.gt(cursor as Row['id']));
    return (await query.limit(limit).all()).map(toHoliday);
  }

  async insert(f: HolidayFields, createdBy: string): Promise<Holiday> {
    const r = await this.#holidays.create({
      level: f.level,
      scopeKey: f.scopeKey as Row['scopeKey'],
      date: dateOf(f.date),
      year: f.year as Row['year'],
      name: f.name as Row['name'],
      paid: f.paid,
      optional: f.optional,
      half: f.half,
      createdBy: createdBy as Row['createdBy'],
    });
    return toHoliday(r);
  }

  async update(id: string, patch: Partial<Pick<HolidayFields, 'name' | 'paid' | 'optional' | 'half'>>): Promise<Holiday> {
    const r = await this.#holidays.where({ id: id as Row['id'] }).update(patch as never);
    if (!r) throw new Error(`holiday ${id} vanished during update`);
    return toHoliday(r);
  }

  async remove(id: string, by: string): Promise<Holiday> {
    const r = await this.#holidays.where({ id: id as Row['id'] }).update({ removedAt: Temporal.Now.instant() as Row['removedAt'], removedBy: by as Row['removedBy'] });
    if (!r) throw new Error(`holiday ${id} vanished during removal`);
    return toHoliday(r);
  }

  /** A live row with this level, key and date (used to report duplicates before the unique index does). */
  async liveAt(level: HolidayLevel, scopeKey: string | null, date: string): Promise<Holiday | null> {
    const r = await this.#holidays
      .where((h) => and(h.level.eq(level), scopeKey ? h.scopeKey.eq(scopeKey as Row['scopeKey'] & string) : h.scopeKey.isNull(), h.date.eq(dateOf(date)), h.removedAt.isNull()))
      .first();
    return r && toHoliday(r);
  }

  /** Every live row that can reach this site in `year`. */
  async reaching(site: SiteReach, year: number): Promise<Holiday[]> {
    const rows = await this.#holidays
      .where((h) =>
        and(
          h.year.eq(year as Row['year']),
          h.removedAt.isNull(),
          or(
            h.level.eq('NATIONAL'),
            and(h.level.eq('STATE'), h.scopeKey.eq(site.stateCode as Row['scopeKey'] & string)),
            and(h.level.eq('CLIENT'), h.scopeKey.eq(site.clientId as Row['scopeKey'] & string)),
            and(h.level.eq('SITE'), h.scopeKey.eq(site.siteId as Row['scopeKey'] & string)),
          ),
        ),
      )
      .all();
    return rows.map(toHoliday);
  }

  // --- replacements -------------------------------------------------------

  async replacementById(id: string): Promise<Replacement | null> {
    const r = await this.#replacements.first({ id: id as ReplRow['id'] });
    return r && toReplacement(r);
  }

  async liveReplacements(filter: { clientId?: string; holidayId?: string; cursor?: string; limit?: number }): Promise<Replacement[]> {
    let query = this.#replacements.where((r) => r.removedAt.isNull()).orderBy((r) => r.id.asc());
    if (filter.clientId) query = query.where({ clientId: filter.clientId as ReplRow['clientId'] });
    if (filter.holidayId) query = query.where({ holidayId: filter.holidayId as ReplRow['holidayId'] });
    if (filter.cursor) query = query.where((r) => r.id.gt(filter.cursor as ReplRow['id']));
    return (await query.limit(filter.limit ?? 1000).all()).map(toReplacement);
  }

  async insertReplacement(d: { clientId: string; holidayId: string; replacementDate: string }, createdBy: string): Promise<Replacement> {
    const r = await this.#replacements.create({
      clientId: d.clientId as ReplRow['clientId'],
      holidayId: d.holidayId as ReplRow['holidayId'],
      replacementDate: dateOf(d.replacementDate) as ReplRow['replacementDate'],
      createdBy: createdBy as ReplRow['createdBy'],
    });
    return toReplacement(r);
  }

  async removeReplacement(id: string, by: string): Promise<Replacement> {
    const r = await this.#replacements.where({ id: id as ReplRow['id'] }).update({ removedAt: Temporal.Now.instant() as ReplRow['removedAt'], removedBy: by as ReplRow['removedBy'] });
    if (!r) throw new Error(`replacement ${id} vanished during removal`);
    return toReplacement(r);
  }

  // --- parents ------------------------------------------------------------

  async site(id: string): Promise<(SiteReach & { status: string; code: string }) | null> {
    const s = await this.#executor.orm.app.Site.first({ id: id as SiteRow['id'] });
    return s && { siteId: s.id, clientId: s.clientId, stateCode: s.stateCode, status: s.status, code: s.code };
  }

  async siteByCode(code: string): Promise<{ id: string; status: string } | null> {
    const s = await this.#executor.orm.app.Site.where({ code: code as SiteRow['code'] }).first();
    return s && { id: s.id, status: s.status };
  }

  async client(id: string): Promise<{ id: string; status: string } | null> {
    const c = await this.#executor.orm.app.Client.first({ id: id as Scalars<Models.app_Client>['id'] });
    return c && { id: c.id, status: c.status };
  }

  async clientByCode(code: string): Promise<{ id: string; status: string } | null> {
    const c = await this.#executor.orm.app.Client.where({ code: code as Scalars<Models.app_Client>['code'] }).first();
    return c && { id: c.id, status: c.status };
  }

  async stateExists(code: string): Promise<boolean> {
    return (await this.#executor.orm.app.State.where({ code: code as Scalars<Models.app_State>['code'] }).first()) !== null;
  }

  // --- impact (M14-HOL-05) ------------------------------------------------

  /** Ids of the active sites a holiday at this level and key reaches. */
  async activeSiteIds(level: HolidayLevel, key: string | null, inState?: string): Promise<string[]> {
    let query = this.#executor.orm.app.Site.select('id').where({ status: 'ACTIVE' as SiteRow['status'] });
    if (inState) query = query.where({ stateCode: inState as SiteRow['stateCode'] });
    if (level === 'STATE') query = query.where({ stateCode: key as SiteRow['stateCode'] });
    if (level === 'CLIENT') query = query.where({ clientId: key as SiteRow['clientId'] });
    if (level === 'SITE') query = query.where({ id: key as SiteRow['id'] });
    return (await query.all()).map((s) => s.id);
  }

  /** Runs of these statuses whose period covers any of the dates and which include a line at one of the sites. */
  async runsTouching(siteIds: string[], dates: string[], statuses: string[]): Promise<RunTouch[]> {
    if (siteIds.length === 0 || dates.length === 0) return [];
    const lines = await this.#executor.orm.app.RunLine.select('runId').where((l) => l.siteId.in(siteIds as Scalars<Models.app_RunLine>['siteId'][])).all();
    const runIds = [...new Set(lines.map((l) => l.runId))];
    if (runIds.length === 0) return [];
    const days = dates.map(dateOf) as RunRow['periodFrom'][];
    const runs = await this.#executor.orm.app.PayrollRun
      .where((r) => and(r.id.in(runIds as RunRow['id'][]), r.status.in(statuses as RunRow['status'][]), or(...days.map((d) => and(r.periodFrom.lte(d), r.periodTo.gte(d))))))
      .all();
    return runs.map((r) => ({ id: r.id, clientId: r.clientId, type: r.type, status: r.status, periodFrom: r.periodFrom.toString(), periodTo: r.periodTo.toString() }));
  }

  /** Employees deployed at any of the sites on any of the dates. */
  async employeesDeployed(siteIds: string[], dates: string[]): Promise<string[]> {
    if (siteIds.length === 0 || dates.length === 0) return [];
    const days = dates.map(dateOf) as Scalars<Models.app_Deployment>['effectiveFrom'][];
    const rows = await this.#executor.orm.app.Deployment
      .select('employeeId')
      .where((d) => and(d.siteId.in(siteIds as Scalars<Models.app_Deployment>['siteId'][]), or(...days.map((day) => and(d.effectiveFrom.lte(day), or(d.effectiveTo.isNull(), d.effectiveTo.gte(day)))))))
      .all();
    return [...new Set(rows.map((r) => r.employeeId))];
  }

  /** Approved leave applications of these employees that cover any of the dates. */
  async approvedLeaveOver(employeeIds: string[], dates: string[]): Promise<number> {
    if (employeeIds.length === 0 || dates.length === 0) return 0;
    const days = dates.map(dateOf) as Scalars<Models.app_LeaveApplication>['fromDate'][];
    const rows = await this.#executor.orm.app.LeaveApplication
      .select('id')
      .where((a) => and(a.employeeId.in(employeeIds as Scalars<Models.app_LeaveApplication>['employeeId'][]), a.status.eq('APPROVED' as Scalars<Models.app_LeaveApplication>['status']), or(...days.map((d) => and(a.fromDate.lte(d), a.toDate.gte(d))))))
      .all();
    return rows.length;
  }
}
