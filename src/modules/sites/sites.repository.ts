// Queries only, through the request's executor (its transaction on writes).
// Returns plain objects; no business rules here.
import { and, or } from '@prisma/orm-postgres/orm-client';
import type { Scalars } from '@prisma/orm-postgres/family-contract/types';
import type { Executor } from '../../core/context.ts';
import type { Models } from '../../prisma/contract.d.ts';

type SiteRow = Scalars<Models.app_Site>;
type ScopeRow = Scalars<Models.app_UserSiteScope>;
type DepRow = Scalars<Models.app_Deployment>;
type Status = SiteRow['status'];

export type Site = {
  id: string;
  clientId: string;
  code: string;
  name: string;
  address: string | null;
  stateCode: string;
  district: string;
  pincode: string;
  minWageZone: string | null;
  sphere: 'CENTRAL' | 'STATE' | null;
  minWageReady: boolean;
  lat: number | null;
  lng: number | null;
  inchargeName: string | null;
  inchargePhone: string | null;
  shiftStart: string | null;
  shiftEnd: string | null;
  status: Status;
  createdAt: string;
};

/** Fields written on create/update; null clears an optional field, undefined leaves it alone. */
export type SiteFields = {
  clientId: string;
  code: string;
  name: string;
  address: string | null;
  stateCode: string;
  district: string;
  pincode: string;
  minWageZone: string | null;
  sphere: 'CENTRAL' | 'STATE' | null;
  lat: number | null;
  lng: number | null;
  inchargeName: string | null;
  inchargePhone: string | null;
  shiftStart: string | null;
  shiftEnd: string | null;
};

export type SiteFilters = {
  q?: string;
  clientId?: string;
  stateCode?: string;
  status?: Status;
  cursor?: string;
  limit: number;
  /** Only these sites (a supervisor's reach, or a supervisor filter). */
  ids?: string[];
};

export type Assignment = {
  id: string;
  userId: string;
  name: string;
  isPrimary: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  approvedBy: string | null;
  endedAt: string | null;
};

export type Candidate = {
  userId: string;
  name: string;
  role: string;
  userStatus: string;
  employeeId: string | null;
  employeeStatus: string | null;
  staffType: string | null;
};

const iso = (v: { toString(): string } | null | undefined) => (v == null ? null : v.toString());
const num = (v: { toString(): string } | null | undefined) => (v == null ? null : Number(v.toString()));
const dateOf = (s: string) => Temporal.PlainDate.from(s) as ScopeRow['effectiveFrom'];

const toSite = (r: SiteRow): Site => ({
  id: r.id,
  clientId: r.clientId,
  code: r.code,
  name: r.name,
  address: r.address === '' ? null : r.address,
  stateCode: r.stateCode,
  district: r.district,
  pincode: r.pincode,
  minWageZone: r.minWageZone,
  sphere: (r.wageSphere as Site['sphere']) ?? null,
  minWageReady: r.minWageZone != null && r.wageSphere != null,
  lat: num(r.lat),
  lng: num(r.lng),
  inchargeName: r.inchargeName,
  inchargePhone: r.inchargePhone,
  shiftStart: r.shiftStart,
  shiftEnd: r.shiftEnd,
  status: r.status,
  createdAt: r.createdAt.toString(),
});

/** Escapes LIKE wildcards in user input. */
const likeTerm = (q: string) => `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;

/** Column values from a partial field set (undefined = leave alone). */
function toData(f: Partial<SiteFields>) {
  const d: Record<string, unknown> = {};
  const put = (key: keyof SiteFields, value: unknown) => {
    if (value !== undefined) d[key] = value;
  };
  put('clientId', f.clientId);
  put('code', f.code);
  put('name', f.name);
  put('address', f.address === undefined ? undefined : (f.address ?? ''));
  put('stateCode', f.stateCode);
  put('district', f.district);
  put('pincode', f.pincode);
  put('minWageZone', f.minWageZone);
  if (f.sphere !== undefined) d['wageSphere'] = f.sphere;
  put('lat', f.lat === undefined ? undefined : f.lat === null ? null : String(f.lat));
  put('lng', f.lng === undefined ? undefined : f.lng === null ? null : String(f.lng));
  put('inchargeName', f.inchargeName);
  put('inchargePhone', f.inchargePhone);
  put('shiftStart', f.shiftStart);
  put('shiftEnd', f.shiftEnd);
  return d as Partial<SiteRow>;
}

export class SitesRepository {
  readonly #executor: Executor;

  constructor({ executor }: { executor: Executor }) {
    this.#executor = executor;
  }

  get #sites() {
    return this.#executor.orm.app.Site;
  }

  get #scopes() {
    return this.#executor.orm.app.UserSiteScope;
  }

  async findById(id: string): Promise<Site | null> {
    const row = await this.#sites.first({ id: id as SiteRow['id'] });
    return row && toSite(row);
  }

  async findByCode(code: string): Promise<Site | null> {
    const row = await this.#sites.where({ code: code as SiteRow['code'] }).first();
    return row && toSite(row);
  }

  async create(data: SiteFields & { createdBy: string }): Promise<Site> {
    const d = toData(data);
    const row = await this.#sites.create({
      ...d,
      address: d.address ?? '',
      status: 'ACTIVE',
      createdBy: data.createdBy as SiteRow['createdBy'],
      updatedBy: data.createdBy as SiteRow['updatedBy'],
    } as never);
    return toSite(row);
  }

  async update(id: string, patch: Partial<SiteFields> & { status?: Status; updatedBy: string }): Promise<Site> {
    const row = await this.#sites.where({ id: id as SiteRow['id'] }).update({
      ...toData(patch),
      ...(patch.status ? { status: patch.status } : {}),
      updatedBy: patch.updatedBy as SiteRow['updatedBy'],
    });
    if (!row) throw new Error(`site ${id} vanished during update`);
    return toSite(row);
  }

  /** Cursor-paged, ordered by id (uuid v7 = creation order). */
  async list({ q, clientId, stateCode, status, cursor, limit, ids }: SiteFilters): Promise<Site[]> {
    let query = this.#sites.orderBy((s) => s.id.asc());
    if (ids) query = query.where((s) => s.id.in(ids as SiteRow['id'][]));
    if (clientId) query = query.where({ clientId: clientId as SiteRow['clientId'] });
    if (stateCode) query = query.where({ stateCode: stateCode as SiteRow['stateCode'] });
    if (status) query = query.where({ status });
    if (q) {
      const term = likeTerm(q);
      query = query.where((s) => or(s.name.ilike(term), s.code.ilike(term)));
    }
    if (cursor) query = query.where((s) => s.id.gt(cursor as SiteRow['id']));
    return (await query.limit(limit).all()).map(toSite);
  }

  async clientById(id: string): Promise<{ id: string; code: string; name: string; status: Status } | null> {
    const c = await this.#executor.orm.app.Client.first({ id: id as Scalars<Models.app_Client>['id'] });
    return c && { id: c.id, code: c.code, name: c.name, status: c.status };
  }

  async clientByCode(code: string): Promise<{ id: string; code: string; name: string; status: Status } | null> {
    const c = await this.#executor.orm.app.Client.where({ code: code as Scalars<Models.app_Client>['code'] }).first();
    return c && { id: c.id, code: c.code, name: c.name, status: c.status };
  }

  async clientNames(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.#executor.orm.app.Client.select('id', 'name').where((c) => c.id.in(ids as Scalars<Models.app_Client>['id'][])).all();
    return new Map(rows.map((c) => [c.id, c.name]));
  }

  async stateExists(code: string): Promise<boolean> {
    const row = await this.#executor.orm.app.State.where({ code: code as Scalars<Models.app_State>['code'] }).first();
    return row !== null;
  }

  /** Has any payroll run (beyond a DRAFT) included this site? */
  async hasPayrollRun(siteId: string): Promise<boolean> {
    const lines = await this.#executor.orm.app.RunLine.select('runId').where({ siteId: siteId as Scalars<Models.app_RunLine>['siteId'] }).all();
    const runIds = [...new Set(lines.map((l) => l.runId))];
    if (runIds.length === 0) return false;
    const run = await this.#executor.orm.app.PayrollRun
      .select('id')
      .where((r) => and(r.id.in(runIds as Scalars<Models.app_PayrollRun>['id'][]), r.status.neq('DRAFT')))
      .first();
    return run !== null;
  }

  // --- deployments --------------------------------------------------------

  /** Deployments that cover `day` (`future` also counts ones that start later and are still open). */
  async deployments(siteIds: string[], day: Temporal.PlainDate, future = false) {
    if (siteIds.length === 0) return [];
    return this.#executor.orm.app.Deployment
      .select('siteId', 'employeeId', 'effectiveFrom', 'effectiveTo')
      .where((d) =>
        and(
          d.siteId.in(siteIds as DepRow['siteId'][]),
          ...(future ? [] : [d.effectiveFrom.lte(day as DepRow['effectiveFrom'])]),
          or(d.effectiveTo.isNull(), d.effectiveTo.gte(day as DepRow['effectiveFrom'])),
        ),
      )
      .orderBy((d) => d.effectiveFrom.asc())
      .all();
  }

  async employees(ids: string[]): Promise<Map<string, { code: string; name: string }>> {
    if (ids.length === 0) return new Map();
    const rows = await this.#executor.orm.app.Employee.select('id', 'code', 'name').where((e) => e.id.in(ids as Scalars<Models.app_Employee>['id'][])).all();
    return new Map(rows.map((e) => [e.id, { code: e.code, name: e.name }]));
  }

  // --- supervisors --------------------------------------------------------

  /** Approved, current, un-ended assignments for these sites, with the user's name. */
  async currentAssignments(siteIds: string[], day: Temporal.PlainDate): Promise<(Assignment & { siteId: string })[]> {
    if (siteIds.length === 0) return [];
    const rows = await this.#scopes
      .where((s) =>
        and(
          s.siteId.in(siteIds as ScopeRow['siteId'][]),
          s.approvedBy.isNotNull(),
          s.endedAt.isNull(),
          s.effectiveFrom.lte(day as ScopeRow['effectiveFrom']),
          or(s.effectiveTo.isNull(), s.effectiveTo.gte(day as ScopeRow['effectiveFrom'])),
        ),
      )
      .include('user', (u) => u.select('id', 'name'))
      .all();
    return rows.map((r) => ({ ...toAssignment(r, r.user?.name ?? ''), siteId: r.siteId }));
  }

  /** Every assignment ever made on a site, newest first. */
  async assignmentsOf(siteId: string): Promise<Assignment[]> {
    const rows = await this.#scopes
      .where({ siteId: siteId as ScopeRow['siteId'] })
      .include('user', (u) => u.select('id', 'name'))
      .orderBy([(s) => s.effectiveFrom.desc(), (s) => s.id.desc()])
      .all();
    return rows.map((r) => toAssignment(r, r.user?.name ?? ''));
  }

  /** Sites where this user has a current approved assignment. */
  async siteIdsOfSupervisor(userId: string, day: Temporal.PlainDate): Promise<string[]> {
    const rows = await this.#scopes
      .select('siteId')
      .where((s) =>
        and(
          s.userId.eq(userId as ScopeRow['userId']),
          s.approvedBy.isNotNull(),
          s.endedAt.isNull(),
          s.effectiveFrom.lte(day as ScopeRow['effectiveFrom']),
          or(s.effectiveTo.isNull(), s.effectiveTo.gte(day as ScopeRow['effectiveFrom'])),
        ),
      )
      .all();
    return [...new Set(rows.map((r) => r.siteId))];
  }

  /** The user's current approved assignments with their (active) sites, for GET /me/sites. */
  async mySites(userId: string, day: Temporal.PlainDate) {
    const rows = await this.#scopes
      .where((s) =>
        and(
          s.userId.eq(userId as ScopeRow['userId']),
          s.approvedBy.isNotNull(),
          s.endedAt.isNull(),
          s.effectiveFrom.lte(day as ScopeRow['effectiveFrom']),
          or(s.effectiveTo.isNull(), s.effectiveTo.gte(day as ScopeRow['effectiveFrom'])),
        ),
      )
      .include('site')
      .all();
    return rows.flatMap((r) => (r.site && r.site.status === 'ACTIVE' ? [{ isPrimary: r.isPrimary, site: toSite(r.site) }] : []));
  }

  async createAssignment(data: { userId: string; siteId: string; isPrimary: boolean; effectiveFrom: string; effectiveTo: string | null; createdBy: string }): Promise<Assignment> {
    const row = await this.#scopes.create({
      userId: data.userId as ScopeRow['userId'],
      siteId: data.siteId as ScopeRow['siteId'],
      isPrimary: data.isPrimary,
      effectiveFrom: dateOf(data.effectiveFrom),
      effectiveTo: data.effectiveTo ? (dateOf(data.effectiveTo) as ScopeRow['effectiveTo']) : null,
      createdBy: data.createdBy as ScopeRow['createdBy'],
    });
    return toAssignment(row, '');
  }

  /** Un-ended assignments (pending or approved) that are still open or end later than `day`. */
  async liveAssignments(siteId: string, day: Temporal.PlainDate) {
    return this.#scopes
      .where((s) =>
        and(
          s.siteId.eq(siteId as ScopeRow['siteId']),
          s.endedAt.isNull(),
          or(s.effectiveTo.isNull(), s.effectiveTo.gte(day as ScopeRow['effectiveFrom'])),
        ),
      )
      .all();
  }

  async endAssignment(id: string, endedBy: string, effectiveTo: Temporal.PlainDate): Promise<void> {
    await this.#scopes.where({ id: id as ScopeRow['id'] }).update({
      effectiveTo: effectiveTo as ScopeRow['effectiveTo'],
      endedBy: endedBy as ScopeRow['endedBy'],
      endedAt: Temporal.Now.instant() as ScopeRow['endedAt'],
    });
  }

  /** Who can be assigned: the user with their linked employee. */
  async candidate(userId: string): Promise<Candidate | null> {
    const u = await this.#executor.orm.app.User.first({ id: userId as Scalars<Models.app_User>['id'] });
    if (!u) return null;
    const e = u.employeeId ? await this.#executor.orm.app.Employee.first({ id: u.employeeId }) : null;
    return { userId: u.id, name: u.name, role: u.role, userStatus: u.status, employeeId: u.employeeId, employeeStatus: e?.status ?? null, staffType: e?.staffType ?? null };
  }

  async userIdOfEmployeeCode(code: string): Promise<string | null> {
    const e = await this.#executor.orm.app.Employee.where({ code: code as Scalars<Models.app_Employee>['code'] }).first();
    if (!e) return null;
    const u = await this.#executor.orm.app.User.where({ employeeId: e.id as Scalars<Models.app_User>['employeeId'] }).first();
    return u?.id ?? null;
  }
}

function toAssignment(r: ScopeRow, name: string): Assignment {
  return {
    id: r.id,
    userId: r.userId,
    name,
    isPrimary: r.isPrimary,
    effectiveFrom: r.effectiveFrom.toString(),
    effectiveTo: iso(r.effectiveTo),
    approvedBy: r.approvedBy,
    endedAt: iso(r.endedAt),
  };
}
