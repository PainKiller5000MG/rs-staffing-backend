// Users service rules against in-memory fakes (no database).
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Ctx, SessionUser } from '../../src/core/context.ts';
import { EventBuffer } from '../../src/core/events.ts';
import type { Identity } from '../../src/auth/identity.ts';
import type { SitesRepository } from '../../src/modules/sites/sites.repository.ts';
import type { SiteScope, User, UsersRepository } from '../../src/modules/users/users.repository.ts';
import { UsersService } from '../../src/modules/users/users.service.ts';

let seq = 0;
const id = () => `00000000-0000-7000-8000-${String(++seq).padStart(12, '0')}`;

function makeUser(over: Partial<User> = {}): User {
  return {
    id: id(),
    name: 'Someone',
    mobile: `+91900000${String(seq).padStart(4, '0')}`,
    email: null,
    role: 'HR',
    status: 'ACTIVE',
    employeeId: null,
    authUserId: `auth-${seq}`,
    expiresAt: null,
    lastLoginAt: null,
    createdAt: '2026-10-01T00:00:00Z',
    createdBy: null,
    ...over,
  };
}

class FakeUsers {
  users = new Map<string, User>();
  scopes = new Map<string, SiteScope>();
  failCreate = false;

  async findById(i: string) { return this.users.get(i) ?? null; }
  async findByMobile(m: string) { return [...this.users.values()].find((u) => u.mobile === m) ?? null; }
  async list() { return [...this.users.values()]; }
  async countActiveAdmins() { return [...this.users.values()].filter((u) => u.role === 'ADMIN' && u.status === 'ACTIVE').length; }
  async create(d: Omit<User, 'id' | 'status' | 'lastLoginAt' | 'createdAt'>) {
    if (this.failCreate) throw new Error('db down');
    const u = makeUser({ ...d, id: id() });
    this.users.set(u.id, u);
    return u;
  }
  async update(i: string, p: Partial<User>) {
    const u = { ...this.users.get(i)!, ...p };
    this.users.set(i, u);
    return u;
  }
  async findScope(i: string) { return this.scopes.get(i) ?? null; }
  async listScopes() { return [...this.scopes.values()]; }
  async createScope(d: { userId: string; siteId: string; effectiveFrom: Temporal.PlainDate; createdBy: string }) {
    const s: SiteScope = { id: id(), userId: d.userId, siteId: d.siteId, effectiveFrom: d.effectiveFrom.toString(), effectiveTo: null, createdBy: d.createdBy, createdAt: 'now', approvedBy: null, approvedAt: null, endedBy: null, endedAt: null };
    this.scopes.set(s.id, s);
    return s;
  }
  async approveScope(i: string, by: string) {
    const s = { ...this.scopes.get(i)!, approvedBy: by, approvedAt: 'now' };
    this.scopes.set(i, s);
    return s;
  }
  async endScope(i: string, by: string, to: Temporal.PlainDate) {
    const s = { ...this.scopes.get(i)!, endedBy: by, endedAt: 'now', effectiveTo: to.toString() };
    this.scopes.set(i, s);
    return s;
  }
  async liveScopeExists() { return false; }
}

const SITE_ID = id();
const sites = {
  findById: async (i: string) => (i === SITE_ID ? { id: SITE_ID, clientId: 'c', code: 'S', name: 'Site', stateCode: 'MP', minWageZone: 'A', status: 'ACTIVE' as const } : null),
} as unknown as SitesRepository;

function setup(actor: Partial<SessionUser> = {}) {
  const repo = new FakeUsers();
  const identity = { ensure: vi.fn(async () => ({ authUserId: 'auth-new', created: true })), remove: vi.fn(async () => {}), revokeSessions: vi.fn(async () => {}) } satisfies Identity;
  const auditRows: unknown[] = [];
  const me: SessionUser = { id: id(), authUserId: 'auth-me', name: 'Admin', role: 'ADMIN', employeeId: null, siteIds: [], ...actor };
  const ctx = {
    user: me,
    maybeUser: me,
    ip: null,
    audited: false,
    executor: { orm: { audit: { AuditLog: { create: async (r: unknown) => auditRows.push(r) } } } },
  } as unknown as Ctx;
  const otpLockout = { clear: vi.fn(async () => {}) };
  const service = new UsersService({ usersRepository: repo as unknown as UsersRepository, sitesRepository: sites, identity, ctx, events: new EventBuffer(), otpLockout });
  return { repo, identity, ctx, me, service, auditRows };
}

describe('create', () => {
  test('creates the login identity and the user, and audits it', async () => {
    const { service, identity, auditRows, ctx } = setup();
    const user = await service.create({ name: 'New HR', mobile: '+919111111111', role: 'HR' });
    expect(user).toMatchObject({ name: 'New HR', role: 'HR', status: 'ACTIVE' });
    expect(identity.ensure).toHaveBeenCalledWith('New HR', '+919111111111');
    expect(auditRows).toHaveLength(1);
    expect(ctx.audited).toBe(true);
  });

  test('a mobile that already has a user is a 409 DUPLICATE, before touching the identity', async () => {
    const { service, repo, identity } = setup();
    const existing = makeUser({ mobile: '+919222222222' });
    repo.users.set(existing.id, existing);
    await expect(service.create({ name: 'X', mobile: '+919222222222', role: 'HR' })).rejects.toMatchObject({ status: 409, code: 'DUPLICATE' });
    expect(identity.ensure).not.toHaveBeenCalled();
  });

  test('if saving the user fails, the identity it created is removed', async () => {
    const { service, repo, identity } = setup();
    repo.failCreate = true;
    await expect(service.create({ name: 'X', mobile: '+919333333333', role: 'HR' })).rejects.toThrow('db down');
    expect(identity.remove).toHaveBeenCalledWith('auth-new');
  });
});

describe('role changes and disabling (M1-USR-05, 06)', () => {
  let ctxSetup: ReturnType<typeof setup>;
  beforeEach(() => {
    ctxSetup = setup();
  });

  test('the last active Admin cannot be demoted', async () => {
    const { service, repo, me } = ctxSetup;
    repo.users.set(me.id, makeUser({ id: me.id, role: 'ADMIN' }));
    await expect(service.changeRole(me.id, { role: 'HR' })).rejects.toMatchObject({ status: 422, code: 'LAST_ADMIN' });
  });

  test('an Admin can be demoted while another active Admin remains', async () => {
    const { service, repo } = ctxSetup;
    const a = makeUser({ role: 'ADMIN' });
    const b = makeUser({ role: 'ADMIN' });
    repo.users.set(a.id, a).set(b.id, b);
    await expect(service.changeRole(a.id, { role: 'HR' })).resolves.toMatchObject({ role: 'HR' });
  });

  test('supervisor and employee roles need an employee record', async () => {
    const { service, repo } = ctxSetup;
    const u = makeUser({ role: 'HR', employeeId: null });
    repo.users.set(u.id, u);
    await expect(service.changeRole(u.id, { role: 'SUPERVISOR' })).rejects.toMatchObject({ code: 'EMPLOYEE_REQUIRED' });
  });

  test('disabling ends the user’s sessions; you cannot disable yourself', async () => {
    const { service, repo, identity, me } = ctxSetup;
    const u = makeUser({ role: 'HR', authUserId: 'auth-hr' });
    repo.users.set(u.id, u);
    await expect(service.disable(u.id)).resolves.toMatchObject({ status: 'DISABLED' });
    expect(identity.revokeSessions).toHaveBeenCalledWith('auth-hr');
    await expect(service.disable(me.id)).rejects.toMatchObject({ code: 'SELF_DISABLE' });
  });
});

describe('site scopes: maker-checker (M1-SCP-06, M1-USR-07)', () => {
  test('assigning creates a pending scope; only supervisors can have one', async () => {
    const { service, repo } = setup();
    const sup = makeUser({ role: 'SUPERVISOR', employeeId: 'e1' });
    const hr = makeUser({ role: 'HR' });
    repo.users.set(sup.id, sup).set(hr.id, hr);
    await expect(service.assignScope(sup.id, { siteId: SITE_ID })).resolves.toMatchObject({ status: 'PENDING', approvedBy: null });
    await expect(service.assignScope(hr.id, { siteId: SITE_ID })).rejects.toMatchObject({ code: 'NOT_A_SUPERVISOR' });
    await expect(service.assignScope(sup.id, { siteId: id() })).rejects.toMatchObject({ status: 404 });
  });

  test('the maker cannot approve their own scope; someone else can', async () => {
    const maker = setup({ role: 'HR' });
    const sup = makeUser({ role: 'SUPERVISOR', employeeId: 'e1' });
    maker.repo.users.set(sup.id, sup);
    const scope = await maker.service.assignScope(sup.id, { siteId: SITE_ID });
    await expect(maker.service.approveScope(scope.id)).rejects.toMatchObject({ status: 422, code: 'MAKER_CHECKER' });

    const checker = setup({ role: 'ADMIN' });
    checker.repo.users = maker.repo.users;
    checker.repo.scopes = maker.repo.scopes;
    await expect(checker.service.approveScope(scope.id)).resolves.toMatchObject({ status: 'ACTIVE', approvedBy: checker.me.id });
  });

  test('revoking ends a scope at once and cannot be repeated', async () => {
    const { service, repo } = setup();
    const sup = makeUser({ role: 'SUPERVISOR', employeeId: 'e1' });
    repo.users.set(sup.id, sup);
    const scope = await service.assignScope(sup.id, { siteId: SITE_ID, effectiveFrom: '2026-04-01' });
    const ended = await service.revokeScope(scope.id);
    expect(ended.status).toBe('ENDED');
    await expect(service.revokeScope(scope.id)).rejects.toMatchObject({ code: 'SCOPE_ENDED' });
  });
});
