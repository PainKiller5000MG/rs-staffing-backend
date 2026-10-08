// Users module end to end (M1-USR-01, 04–07, M1-SCP-06, M1-AUD-01).
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { db } from '../../src/prisma/db.ts';
import { freshMobile, mobileOf, testApp } from '../helpers.ts';

const { request, login } = testApp();
let admin: string;
let hr: string;
let siteId: Record<string, string> = {};
let supB: { id: string };

beforeAll(async () => {
  admin = await login(mobileOf('admin'));
  hr = await login(mobileOf('hr'));
  for (const s of await db.orm.app.Site.all()) siteId[s.code] = s.id;
  supB = (await db.orm.app.User.where({ mobile: mobileOf('supB') as never }).first())!;
});
afterAll(() => db.close());

test('the Users routes are in /openapi.json and need a session', async () => {
  const { body } = await request('GET', '/openapi.json');
  expect(Object.keys(body.paths)).toEqual(expect.arrayContaining(['/me', '/users', '/users/{id}', '/site-scopes/{scopeId}/approve']));
  expect(await request('GET', '/me')).toMatchObject({ status: 401, body: { error: { code: 'UNAUTHENTICATED' } } });
});

describe('create (M1-USR-01)', () => {
  test('Admin creates an HQ user; the write is audited in the same transaction', async () => {
    const mobile = freshMobile();
    const res = await request('POST', '/users', { cookie: admin, body: { name: 'New Payroll Exec', mobile, email: `pe.${Date.now()}@rsstaffing.test`, role: 'PAYROLL' } });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'New Payroll Exec', mobile, role: 'PAYROLL', status: 'ACTIVE' });
    const entry = await db.orm.audit.AuditLog.where({ action: 'user.create' as never, entityId: res.body.id }).first();
    expect(entry).not.toBeNull();

    // The new user can log in straight away.
    const cookie = await login(mobile);
    expect((await request('GET', '/me', { cookie })).body.role).toBe('PAYROLL');
  });

  test('duplicate mobile → 409 DUPLICATE', async () => {
    const res = await request('POST', '/users', { cookie: admin, body: { name: 'Dup', mobile: mobileOf('hr'), role: 'HR' } });
    expect(res).toMatchObject({ status: 409, body: { error: { code: 'DUPLICATE' } } });
  });

  test('validation → 422 VALIDATION_FAILED with field paths', async () => {
    const res = await request('POST', '/users', { cookie: admin, body: { name: 'Sup', mobile: freshMobile(), role: 'SUPERVISOR' } });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({ code: 'VALIDATION_FAILED', details: [{ path: 'employeeId', message: expect.any(String) }] });
  });

  test('only Admin creates users', async () => {
    const res = await request('POST', '/users', { cookie: hr, body: { name: 'X', mobile: freshMobile(), role: 'HR' } });
    expect(res).toMatchObject({ status: 403, body: { error: { code: 'FORBIDDEN' } } });
  });
});

describe('list and get (M1-USR-04)', () => {
  test('filters by role and pages with a cursor', async () => {
    const page1 = await request('GET', '/users?role=SUPERVISOR&limit=1', { cookie: hr });
    expect(page1.status).toBe(200);
    expect(page1.body.items).toHaveLength(1);
    expect(page1.body.nextCursor).toEqual(expect.any(String));
    const page2 = await request('GET', `/users?role=SUPERVISOR&limit=1&cursor=${page1.body.nextCursor}`, { cookie: hr });
    expect(page2.body.items[0].id).not.toBe(page1.body.items[0].id);
  });

  test('get returns site scopes with their status', async () => {
    const res = await request('GET', `/users/${supB.id}`, { cookie: hr });
    expect(res.status).toBe(200);
    const statuses = res.body.siteScopes.map((s: { status: string }) => s.status);
    expect(statuses).toEqual(expect.arrayContaining(['ACTIVE', 'PENDING']));
  });
});

describe('site scopes are maker-checker (M1-SCP-06)', () => {
  test('HR assigns; HR cannot approve their own; Admin approves; the supervisor gains the site', async () => {
    const assigned = await request('POST', `/users/${supB.id}/site-scopes`, { cookie: hr, body: { siteId: siteId['NTX-MDP'] } });
    expect(assigned).toMatchObject({ status: 201, body: { status: 'PENDING' } });

    const supCookie = await login(mobileOf('supB'));
    expect((await request('GET', `/sites/${siteId['NTX-MDP']}`, { cookie: supCookie })).status).toBe(404);

    const selfApprove = await request('POST', `/site-scopes/${assigned.body.id}/approve`, { cookie: hr });
    expect(selfApprove.status).toBe(422);
    expect(selfApprove.body).toEqual({
      error: { code: 'MAKER_CHECKER', message: 'The approver cannot be the person who made the change', details: null, requestId: expect.any(String) },
    });

    const approved = await request('POST', `/site-scopes/${assigned.body.id}/approve`, { cookie: admin });
    expect(approved).toMatchObject({ status: 200, body: { status: 'ACTIVE' } });
    expect((await request('GET', `/sites/${siteId['NTX-MDP']}`, { cookie: supCookie })).status).toBe(200);

    // Revoking takes effect on the next request.
    const revoked = await request('POST', `/site-scopes/${assigned.body.id}/revoke`, { cookie: hr });
    expect(revoked).toMatchObject({ status: 200, body: { status: 'ENDED' } });
    expect((await request('GET', `/sites/${siteId['NTX-MDP']}`, { cookie: supCookie })).status).toBe(404);
  });
});

describe('roles and deactivation (M1-USR-05, 06)', () => {
  test('a user can be disabled, which ends their session, and re-enabled', async () => {
    const mobile = freshMobile();
    const created = await request('POST', '/users', { cookie: admin, body: { name: 'Temp HR', mobile, role: 'HR' } });
    const cookie = await login(mobile);
    expect((await request('GET', '/me', { cookie })).status).toBe(200);

    expect((await request('POST', `/users/${created.body.id}/disable`, { cookie: admin })).body.status).toBe('DISABLED');
    expect((await request('GET', '/me', { cookie })).status).toBe(401);

    expect((await request('POST', `/users/${created.body.id}/enable`, { cookie: admin })).body.status).toBe('ACTIVE');
  });

  test('role change is audited with old and new role', async () => {
    const created = await request('POST', '/users', { cookie: admin, body: { name: 'Role Test', mobile: freshMobile(), role: 'HR' } });
    const changed = await request('PATCH', `/users/${created.body.id}/role`, { cookie: admin, body: { role: 'ACCOUNTS' } });
    expect(changed.body.role).toBe('ACCOUNTS');
    const entry = (await db.orm.audit.AuditLog.where({ action: 'user.role_change' as never, entityId: created.body.id }).first())!;
    expect(entry.before).toMatchObject({ role: 'HR' });
    expect(entry.after).toMatchObject({ role: 'ACCOUNTS' });
  });

  test('the Admin cannot disable themselves', async () => {
    const me = await request('GET', '/me', { cookie: admin });
    const res = await request('POST', `/users/${me.body.id}/disable`, { cookie: admin });
    expect(res).toMatchObject({ status: 422, body: { error: { code: 'SELF_DISABLE' } } });
  });
});
