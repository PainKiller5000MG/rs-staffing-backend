// The only layer that touches the database for users and their site scopes.
// Runs through the request's executor (its transaction on write routes) and
// returns plain objects — timestamps as ISO strings, dates as YYYY-MM-DD.
import { and, or } from '@prisma/orm-postgres/orm-client';
import type { Executor } from '../../core/context.ts';
import type { Role } from '../../lib/roles.ts';
import type { Scalars } from '@prisma/orm-postgres/family-contract/types';
import type { Models } from '../../prisma/contract.d.ts';

type UserRow = Scalars<Models.app_User>;
type ScopeRow = Scalars<Models.app_UserSiteScope>;
type Status = UserRow['status'];

export type User = {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  role: Role;
  status: Status;
  employeeId: string | null;
  authUserId: string | null;
  expiresAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  createdBy: string | null;
};

export type SiteScope = {
  id: string;
  userId: string;
  siteId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdBy: string | null;
  createdAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  endedBy: string | null;
  endedAt: string | null;
};

export type UserFilters = { role?: Role; status?: Status; q?: string; cursor?: string; limit: number };

const iso = (v: { toString(): string } | null | undefined) => (v == null ? null : v.toString());

function toUser(r: UserRow): User {
  return {
    id: r.id,
    name: r.name,
    mobile: r.mobile,
    email: r.email,
    role: r.role,
    status: r.status,
    employeeId: r.employeeId,
    authUserId: r.authUserId,
    expiresAt: iso(r.expiresAt),
    lastLoginAt: iso(r.lastLoginAt),
    createdAt: r.createdAt.toString(),
    createdBy: r.createdBy,
  };
}

function toScope(r: ScopeRow): SiteScope {
  return {
    id: r.id,
    userId: r.userId,
    siteId: r.siteId,
    effectiveFrom: r.effectiveFrom.toString(),
    effectiveTo: iso(r.effectiveTo),
    createdBy: r.createdBy,
    createdAt: r.createdAt.toString(),
    approvedBy: r.approvedBy,
    approvedAt: iso(r.approvedAt),
    endedBy: r.endedBy,
    endedAt: iso(r.endedAt),
  };
}

/** Escapes LIKE wildcards in user input. */
const likeTerm = (q: string) => `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;

export class UsersRepository {
  readonly #executor: Executor;

  constructor({ executor }: { executor: Executor }) {
    this.#executor = executor;
  }

  get #users() {
    return this.#executor.orm.app.User;
  }

  get #scopes() {
    return this.#executor.orm.app.UserSiteScope;
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.#users.first({ id: id as UserRow['id'] });
    return row && toUser(row);
  }

  async findByMobile(mobile: string): Promise<User | null> {
    const row = await this.#users.where({ mobile: mobile as UserRow['mobile'] }).first();
    return row && toUser(row);
  }

  async list({ role, status, q, cursor, limit }: UserFilters): Promise<User[]> {
    let query = this.#users.orderBy((u) => u.id.asc());
    if (role) query = query.where({ role });
    if (status) query = query.where({ status });
    if (q) {
      const term = likeTerm(q);
      query = query.where((u) => or(u.name.ilike(term), u.email.ilike(term), u.mobile.ilike(term)));
    }
    if (cursor) query = query.where((u) => u.id.gt(cursor as UserRow['id']));
    const rows = await query.limit(limit).all();
    return rows.map(toUser);
  }

  async countActiveAdmins(): Promise<number> {
    const { n } = await this.#users.where({ role: 'ADMIN', status: 'ACTIVE' }).aggregate((a) => ({ n: a.count() }));
    return n;
  }

  async create(data: {
    name: string;
    mobile: string;
    email: string | null;
    role: Role;
    employeeId: string | null;
    expiresAt: string | null;
    authUserId: string;
    createdBy: string;
  }): Promise<User> {
    const row = await this.#users.create({
      name: data.name as UserRow['name'],
      mobile: data.mobile as UserRow['mobile'],
      email: data.email as UserRow['email'],
      role: data.role,
      employeeId: data.employeeId as UserRow['employeeId'],
      expiresAt: (data.expiresAt ? Temporal.Instant.from(data.expiresAt) : null) as UserRow['expiresAt'],
      authUserId: data.authUserId as UserRow['authUserId'],
      status: 'ACTIVE',
      createdBy: data.createdBy as UserRow['createdBy'],
      updatedBy: data.createdBy as UserRow['updatedBy'],
    });
    return toUser(row);
  }

  async update(id: string, patch: { role?: Role; status?: Status; updatedBy: string }): Promise<User> {
    const row = await this.#users.where({ id: id as UserRow['id'] }).update({
      ...(patch.role ? { role: patch.role } : {}),
      ...(patch.status ? { status: patch.status } : {}),
      updatedBy: patch.updatedBy as UserRow['updatedBy'],
    });
    if (!row) throw new Error(`user ${id} vanished during update`);
    return toUser(row);
  }

  async findScope(id: string): Promise<SiteScope | null> {
    const row = await this.#scopes.first({ id: id as ScopeRow['id'] });
    return row && toScope(row);
  }

  async listScopes(userId: string): Promise<SiteScope[]> {
    const rows = await this.#scopes
      .where({ userId: userId as ScopeRow['userId'] })
      .orderBy([(s) => s.effectiveFrom.desc(), (s) => s.id.desc()])
      .all();
    return rows.map(toScope);
  }

  async createScope(data: { userId: string; siteId: string; effectiveFrom: Temporal.PlainDate; createdBy: string }): Promise<SiteScope> {
    const row = await this.#scopes.create({
      userId: data.userId as ScopeRow['userId'],
      siteId: data.siteId as ScopeRow['siteId'],
      effectiveFrom: data.effectiveFrom as ScopeRow['effectiveFrom'],
      effectiveTo: null,
      createdBy: data.createdBy as ScopeRow['createdBy'],
    });
    return toScope(row);
  }

  async approveScope(id: string, approvedBy: string): Promise<SiteScope> {
    const row = await this.#scopes.where({ id: id as ScopeRow['id'] }).update({
      approvedBy: approvedBy as ScopeRow['approvedBy'],
      approvedAt: Temporal.Now.instant() as ScopeRow['approvedAt'],
    });
    if (!row) throw new Error(`scope ${id} vanished during update`);
    return toScope(row);
  }

  async endScope(id: string, endedBy: string, effectiveTo: Temporal.PlainDate): Promise<SiteScope> {
    const row = await this.#scopes.where({ id: id as ScopeRow['id'] }).update({
      effectiveTo: effectiveTo as ScopeRow['effectiveTo'],
      endedBy: endedBy as ScopeRow['endedBy'],
      endedAt: Temporal.Now.instant() as ScopeRow['endedAt'],
    });
    if (!row) throw new Error(`scope ${id} vanished during update`);
    return toScope(row);
  }

  /** Approved, current, un-ended scopes with their site (for GET /me). */
  async activeScopes(userId: string, day: Temporal.PlainDate) {
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
      .include('site', (site) => site.select('id', 'code', 'name'))
      .orderBy((s) => s.effectiveFrom.asc())
      .all();
    return rows.flatMap((r) =>
      r.site
        ? [{ siteId: r.siteId, siteCode: r.site.code, siteName: r.site.name, effectiveFrom: r.effectiveFrom.toString(), effectiveTo: iso(r.effectiveTo) }]
        : [],
    );
  }

  /** Approved, live scopes for the same user and site (for a clearer error than the DB's OVERLAP). */
  async liveScopeExists(userId: string, siteId: string, exceptId: string): Promise<boolean> {
    const row = await this.#scopes
      .select('id')
      .where((s) =>
        and(
          s.userId.eq(userId as ScopeRow['userId']),
          s.siteId.eq(siteId as ScopeRow['siteId']),
          s.approvedBy.isNotNull(),
          s.endedAt.isNull(),
          s.id.neq(exceptId as ScopeRow['id']),
        ),
      )
      .first();
    return row !== null;
  }
}
