// Extra M1 acceptance-criteria tests for built stories (users, lockout).
import { randomInt } from 'node:crypto';
import { afterAll, expect, test } from 'vitest';
import { LOCKOUT } from '../../src/auth/lockout.ts';
import { db } from '../../src/prisma/db.ts';
import { freshMobile, mobileOf, testApp } from '../helpers.ts';

const { container, request, login } = testApp();
afterAll(() => db.close());

test('M1-SEC-06 AC4: the 31st verify from one IP in an hour is refused, whatever the number', async () => {
  const ip = `198.51.${randomInt(0, 255)}.${randomInt(1, 255)}`;
  const lockout = container.cradle.otpLockout;
  for (let i = 0; i < LOCKOUT.ipMax; i++) expect((await lockout.begin(freshMobile(), ip)).blocked).toBe(false);
  expect((await lockout.begin(freshMobile(), ip)).blocked).toBe(true);
  expect((await lockout.begin(freshMobile(), `198.51.${randomInt(0, 255)}.0`)).blocked).toBe(false); // another IP is unaffected
});

test('M1-USR-01 AC4: an auditor can be given an access expiry date; other roles cannot', async () => {
  const admin = await login(mobileOf('admin'));
  const expiresAt = '2027-03-31T18:29:59Z';
  const ok = await request('POST', '/users', { cookie: admin, body: { name: 'Audit Temp', mobile: freshMobile(), role: 'AUDITOR', expiresAt } });
  expect(ok.status).toBe(201);
  expect(Temporal.Instant.from(ok.body.expiresAt).toString()).toBe(Temporal.Instant.from(expiresAt).toString());
  const bad = await request('POST', '/users', { cookie: admin, body: { name: 'Not Auditor', mobile: freshMobile(), role: 'HR', expiresAt } });
  expect(bad).toMatchObject({ status: 422, body: { error: { code: 'VALIDATION_FAILED' } } });
});

test('M1-USR-04 AC2: the list and the detail show the last login time', async () => {
  const mobile = freshMobile();
  const admin = await login(mobileOf('admin'));
  const created = await request('POST', '/users', { cookie: admin, body: { name: 'Seen Test', mobile, role: 'HR' } });
  expect(created.body.lastLoginAt).toBeNull();
  await login(mobile);
  const got = await request('GET', `/users/${created.body.id}`, { cookie: admin });
  expect(got.body.lastLoginAt).toEqual(expect.any(String));
  const list = await request('GET', '/users?limit=100', { cookie: admin });
  const row = list.body.items.find((u: { id: string }) => u.id === created.body.id);
  expect(row?.lastLoginAt).toEqual(expect.any(String));
});

test('M1-USR-05 AC1: a role change applies on the very next request of an already-open session', async () => {
  const mobile = freshMobile();
  const admin = await login(mobileOf('admin'));
  const created = await request('POST', '/users', { cookie: admin, body: { name: 'Role Live', mobile, role: 'HR' } });
  const cookie = await login(mobile);
  expect((await request('GET', '/users', { cookie })).status).toBe(200); // HR can read users
  expect((await request('POST', '/users', { cookie, body: { name: 'X', mobile: freshMobile(), role: 'HR' } })).status).toBe(403);
  await request('PATCH', `/users/${created.body.id}/role`, { cookie: admin, body: { role: 'AUDITOR' } });
  expect((await request('GET', '/me', { cookie })).body.role).toBe('AUDITOR'); // same cookie, new role
});

test('M1-USR-06 AC2: users are never hard-deleted: no delete route, and a disabled user stays in the audit trail', async () => {
  const admin = await login(mobileOf('admin'));
  const created = await request('POST', '/users', { cookie: admin, body: { name: 'Keep Me', mobile: freshMobile(), role: 'HR' } });
  await request('POST', `/users/${created.body.id}/disable`, { cookie: admin });
  expect((await request('DELETE', `/users/${created.body.id}`, { cookie: admin })).status).toBeGreaterThanOrEqual(404);
  const got = await request('GET', `/users/${created.body.id}`, { cookie: admin });
  expect(got.body).toMatchObject({ name: 'Keep Me', status: 'DISABLED' });
  expect(await db.orm.audit.AuditLog.where({ action: 'user.create' as never, entityId: created.body.id }).first()).not.toBeNull();
});

test('M1-USR-06 AC4: a re-enabled user logs in with OTP straight away', async () => {
  const mobile = freshMobile();
  const admin = await login(mobileOf('admin'));
  const created = await request('POST', '/users', { cookie: admin, body: { name: 'Back Again', mobile, role: 'HR' } });
  await request('POST', `/users/${created.body.id}/disable`, { cookie: admin });
  await request('POST', `/users/${created.body.id}/enable`, { cookie: admin });
  const cookie = await login(mobile);
  expect((await request('GET', '/me', { cookie })).status).toBe(200);
});

// Deferred to the module that owns the data (no employee records or Excel export exist yet):
// M1-USR-02 AC1 n/a: staff type and employee records are Module 3
// M1-USR-02 AC2 n/a: "supervisor access" toggle lives on the Module 3 employee record
// M1-USR-02 AC3 n/a: removing the login on disable is built with the Module 3 toggle
// M1-USR-03 AC1 n/a: employee creation and import are Module 3
// M1-USR-03 AC2 n/a: bulk employee import is Module 3
// M1-USR-03 AC3 n/a: daily-wage workers are Module 4
// M1-USR-04 AC3 n/a: Excel export is Module 11
// M1-USR-06 AC3 n/a: employee exit status is Module 3
