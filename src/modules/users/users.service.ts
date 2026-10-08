// User management rules (M1-USR-01, 04, 05, 06, 07; M1-SCP-06 maker-checker
// on site scopes). Throws AppErrors; never touches HTTP or the ORM directly.
import { audit } from '../../core/audit.ts';
import type { Ctx } from '../../core/context.ts';
import { ConflictError, makerChecker, NotFoundError } from '../../core/errors.ts';
import type { EventBuffer } from '../../core/events.ts';
import type { Identity } from '../../auth/identity.ts';
import { parseDate, today } from '../../lib/dates.ts';
import { permissionsOf } from '../../lib/permissions.ts';
import type { SitesRepository } from '../sites/sites.repository.ts';
import * as errors from './users.errors.ts';
import type { SiteScope, User, UsersRepository } from './users.repository.ts';
import type { AssignScopeBody, ChangeRoleBody, CreateUserBody, ListUsersQuery } from './users.schemas.ts';

type Deps = {
  usersRepository: UsersRepository;
  sitesRepository: SitesRepository;
  identity: Identity;
  ctx: Ctx;
  events: EventBuffer;
};

/** What the API shows of a user (no auth link, no audit columns). */
export function publicUser(u: User) {
  return {
    id: u.id,
    name: u.name,
    mobile: u.mobile,
    email: u.email,
    role: u.role,
    status: u.status,
    employeeId: u.employeeId,
    expiresAt: u.expiresAt,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  };
}

export function withStatus(s: SiteScope) {
  return { ...s, status: s.endedAt ? ('ENDED' as const) : s.approvedBy ? ('ACTIVE' as const) : ('PENDING' as const) };
}

export class UsersService {
  readonly #users: UsersRepository;
  readonly #sites: SitesRepository;
  readonly #identity: Identity;
  readonly #ctx: Ctx;
  readonly #events: EventBuffer;

  constructor({ usersRepository, sitesRepository, identity, ctx, events }: Deps) {
    this.#users = usersRepository;
    this.#sites = sitesRepository;
    this.#identity = identity;
    this.#ctx = ctx;
    this.#events = events;
  }

  /** M1-LOG-07: who is signed in, what they may do, and (supervisors) where. */
  async me() {
    const { id, name, role, employeeId, siteIds } = this.#ctx.user;
    const siteScopes = role === 'SUPERVISOR' ? await this.#users.activeScopes(id, today()) : [];
    return { id, name, role, employeeId, siteIds, permissions: permissionsOf(role), siteScopes };
  }

  async list(query: ListUsersQuery) {
    const rows = await this.#users.list({ ...query, limit: query.limit + 1 });
    const items = rows.slice(0, query.limit);
    return { items: items.map(publicUser), nextCursor: rows.length > query.limit ? (items.at(-1)?.id ?? null) : null };
  }

  async get(id: string) {
    const user = await this.#mustFind(id);
    const scopes = await this.#users.listScopes(id);
    return { ...publicUser(user), siteScopes: scopes.map(withStatus) };
  }

  async create(body: CreateUserBody) {
    // The DB enforces uniqueness too; checking first keeps an existing
    // person's login identity from being reused for someone else.
    if (await this.#users.findByMobile(body.mobile)) {
      throw new ConflictError('DUPLICATE', 'A user with this mobile already exists', { fields: ['mobile'] });
    }

    const { authUserId, created } = await this.#identity.ensure(body.name, body.mobile);
    try {
      const user = await this.#users.create({
        name: body.name,
        mobile: body.mobile,
        email: body.email ?? null,
        role: body.role,
        employeeId: body.employeeId ?? null,
        expiresAt: body.expiresAt ?? null,
        authUserId,
        createdBy: this.#ctx.user.id,
      });
      await audit(this.#ctx, 'user.create', 'user', null, publicUser(user));
      this.#events.emit('user.created', { userId: user.id, role: user.role });
      return publicUser(user);
    } catch (err) {
      if (created) await this.#identity.remove(authUserId).catch(() => {});
      throw err;
    }
  }

  async changeRole(id: string, { role }: ChangeRoleBody) {
    const user = await this.#mustFind(id);
    if (user.role === 'ADMIN' && role !== 'ADMIN' && user.status === 'ACTIVE') await this.#keepOneAdmin();
    if ((role === 'SUPERVISOR' || role === 'EMPLOYEE') && !user.employeeId) throw errors.loginNeedsEmployee();

    const updated = await this.#users.update(id, { role, updatedBy: this.#ctx.user.id });
    await audit(this.#ctx, 'user.role_change', 'user', publicUser(user), publicUser(updated));
    if (user.role !== role) this.#events.emit('user.role_changed', { userId: id, from: user.role, to: role });
    return publicUser(updated);
  }

  async disable(id: string) {
    if (id === this.#ctx.user.id) throw errors.cannotDisableSelf();
    const user = await this.#mustFind(id);
    if (user.role === 'ADMIN' && user.status === 'ACTIVE') await this.#keepOneAdmin();

    const updated = await this.#users.update(id, { status: 'DISABLED', updatedBy: this.#ctx.user.id });
    await audit(this.#ctx, 'user.disable', 'user', publicUser(user), publicUser(updated));
    // M1-USR-06: deactivation ends every session immediately.
    if (user.authUserId) await this.#identity.revokeSessions(user.authUserId);
    return publicUser(updated);
  }

  async enable(id: string) {
    const user = await this.#mustFind(id);
    const updated = await this.#users.update(id, { status: 'ACTIVE', updatedBy: this.#ctx.user.id });
    await audit(this.#ctx, 'user.enable', 'user', publicUser(user), publicUser(updated));
    return publicUser(updated);
  }

  /** Maker: records a pending scope. It grants nothing until someone else approves it. */
  async assignScope(userId: string, body: AssignScopeBody) {
    const user = await this.#mustFind(userId);
    if (user.role !== 'SUPERVISOR') throw errors.notASupervisor();
    const site = await this.#sites.findById(body.siteId);
    if (!site) throw new NotFoundError('Site');
    if (site.status !== 'ACTIVE') throw errors.siteInactive();

    const scope = await this.#users.createScope({
      userId,
      siteId: body.siteId,
      effectiveFrom: body.effectiveFrom ? parseDate(body.effectiveFrom) : today(),
      createdBy: this.#ctx.user.id,
    });
    await audit(this.#ctx, 'user_site_scope.assign', 'user_site_scope', null, scope);
    return withStatus(scope);
  }

  /** Checker: approves a pending scope created by someone else. */
  async approveScope(scopeId: string) {
    const scope = await this.#mustFindScope(scopeId);
    if (scope.endedAt) throw errors.scopeEnded();
    if (scope.approvedBy) throw errors.scopeAlreadyApproved();
    if (scope.createdBy === this.#ctx.user.id) throw makerChecker();
    if (await this.#users.liveScopeExists(scope.userId, scope.siteId, scope.id)) throw errors.scopeAlreadyLive();

    const approved = await this.#users.approveScope(scopeId, this.#ctx.user.id);
    await audit(this.#ctx, 'user_site_scope.approve', 'user_site_scope', scope, approved);
    this.#events.emit('user.site_scope_approved', { userId: scope.userId, siteId: scope.siteId });
    return withStatus(approved);
  }

  /**
   * Ends a scope now (pending or approved). Takes effect on the next request
   * (M1-USR-07); it narrows access, so it does not wait for a checker.
   */
  async revokeScope(scopeId: string) {
    const scope = await this.#mustFindScope(scopeId);
    if (scope.endedAt) throw errors.scopeEnded();

    const yesterday = today().subtract({ days: 1 });
    const from = parseDate(scope.effectiveFrom);
    const effectiveTo = Temporal.PlainDate.compare(yesterday, from) < 0 ? from : yesterday;
    const ended = await this.#users.endScope(scopeId, this.#ctx.user.id, effectiveTo);
    await audit(this.#ctx, 'user_site_scope.revoke', 'user_site_scope', scope, ended);
    return withStatus(ended);
  }

  async #mustFind(id: string): Promise<User> {
    const user = await this.#users.findById(id);
    if (!user) throw new NotFoundError('User');
    return user;
  }

  async #mustFindScope(id: string): Promise<SiteScope> {
    const scope = await this.#users.findScope(id);
    if (!scope) throw new NotFoundError('Site scope');
    return scope;
  }

  /** M1-USR-05: the last active Admin can't be demoted or disabled. */
  async #keepOneAdmin(): Promise<void> {
    if ((await this.#users.countActiveAdmins()) <= 1) throw errors.lastAdmin();
  }
}
