// M1-SEC-06: repeated wrong OTPs lock the number out; 10 in a day locks the user.
import { afterAll, expect, test } from 'vitest';
import { LOCKOUT } from '../../src/auth/lockout.ts';
import { db } from '../../src/prisma/db.ts';
import { freshMobile, mobileOf, testApp, waitForOtp } from '../helpers.ts';

const { app, container, request, login } = testApp();
afterAll(() => db.close());

const verify = async (phoneNumber: string, code: string) => {
  const res = await app.request('/api/auth/phone-number/verify', {
    method: 'POST',
    headers: { origin: 'http://localhost:3001', 'content-type': 'application/json' },
    body: JSON.stringify({ phoneNumber, code }),
  });
  return { status: res.status, body: (await res.json()) as { code?: string } };
};

async function newUser() {
  const admin = await login(mobileOf('admin'));
  const mobile = freshMobile();
  const created = await request('POST', '/users', { cookie: admin, body: { name: 'Lockout Test', mobile, role: 'HR' } });
  return { admin, mobile, id: created.body.id as string };
}

test(`M1-SEC-06 AC1: ${LOCKOUT.shortMax} wrong codes lock the number for 15 minutes, even for the right code`, async () => {
  const { mobile } = await newUser();
  const since = Temporal.Now.instant();
  await request('POST', '/api/auth/phone-number/send-otp', { body: { phoneNumber: mobile } });
  const code = await waitForOtp(mobile, since);
  // Better Auth answers 400 for a wrong code and 403 once it discards the code after 3 tries; both count.
  for (let i = 0; i < LOCKOUT.shortMax; i++) expect([400, 403]).toContain((await verify(mobile, '000000')).status);
  expect(await verify(mobile, code)).toMatchObject({ status: 429, body: { code: 'TOO_MANY_ATTEMPTS' } });
});

test('M1-SEC-06 AC3: an unregistered number is refused the same way (no hint that it exists)', async () => {
  const mobile = freshMobile();
  for (let i = 0; i < LOCKOUT.shortMax; i++) await verify(mobile, '000000');
  expect(await verify(mobile, '123456')).toMatchObject({ status: 429, body: { code: 'TOO_MANY_ATTEMPTS' } });
});

test(`M1-SEC-06 AC2 AC3: ${LOCKOUT.longMax} failures in a day lock the user until an Admin re-enables them`, async () => {
  const { admin, mobile, id } = await newUser();
  const lockout = container.cradle.otpLockout;
  for (let i = 0; i < LOCKOUT.longMax; i++) await (await lockout.begin(mobile, null)).fail();
  expect((await db.orm.app.User.first({ id: id as never }))!.status).toBe('LOCKED');
  expect(await db.orm.audit.AuditLog.where({ action: 'auth.lockout' as never, entityId: id as never }).first()).not.toBeNull();
  expect((await lockout.begin(mobile, null)).blocked).toBe(true);

  expect((await request('POST', `/users/${id}/enable`, { cookie: admin })).body.status).toBe('ACTIVE');
  expect((await lockout.begin(mobile, null)).blocked).toBe(false); // the counter was cleared
  await login(mobile); // and they can sign in again
});

test('M1-SEC-06 AC1: concurrent wrong guesses cannot all slip under the cap', async () => {
  const { mobile } = await newUser();
  const results = await Promise.all(Array.from({ length: 15 }, () => verify(mobile, '000000')));
  expect(results.filter((r) => r.status === 429).length).toBeGreaterThanOrEqual(15 - LOCKOUT.shortMax);
});
