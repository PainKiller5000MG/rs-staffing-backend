// M1 login through Better Auth phone OTP (Decision 16), with the mock SMS outbox.
import { afterAll, expect, test } from 'vitest';
import { db } from '../../src/prisma/db.ts';
import { countOutbox, mobileOf, testApp } from '../helpers.ts';

const { request, login } = testApp();
afterAll(() => db.close());

test('9000000001 logs in with the OTP from the outbox and gets a session', async () => {
  const cookie = await login(mobileOf('admin'));
  expect(cookie).toContain('better-auth.session_token=');
  const me = await request('GET', '/me', { cookie });
  expect(me).toMatchObject({ status: 200, body: { name: 'Asha Verma', role: 'ADMIN', siteIds: [] } });
});

test('login is audit-logged and stamps last login', async () => {
  await login(mobileOf('hr'));
  const user = (await db.orm.app.User.where({ mobile: mobileOf('hr') as never }).first())!;
  expect(user.lastLoginAt).not.toBeNull();
  const entry = await db.orm.audit.AuditLog.where({ actorId: user.id, action: 'auth.login' as never }).first();
  expect(entry).not.toBeNull();
});

test('an unregistered number gets the same reply and no SMS (no self sign-up)', async () => {
  const since = Temporal.Now.instant();
  const unknown = '+919898989898';
  const known = await request('POST', '/api/auth/phone-number/send-otp', { body: { phoneNumber: mobileOf('payroll') } });
  const res = await request('POST', '/api/auth/phone-number/send-otp', { body: { phoneNumber: unknown } });
  expect(res.status).toBe(known.status);
  expect(res.body).toEqual(known.body);
  await new Promise((r) => setTimeout(r, 300));
  expect(await countOutbox(unknown, since)).toBe(0);
});

test('a supervisor sees their three sites on /me', async () => {
  const cookie = await login(mobileOf('supA'));
  const me = await request('GET', '/me', { cookie });
  expect(me.body.role).toBe('SUPERVISOR');
  expect(me.body.siteIds).toHaveLength(3);
});
