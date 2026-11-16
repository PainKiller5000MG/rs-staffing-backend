// M1-LOG-06: an HQ session idle for 30 minutes needs a fresh login.
import { afterAll, expect, test } from 'vitest';
import { db } from '../../src/prisma/db.ts';
import { mobileOf, testApp } from '../helpers.ts';

const { request, login, container } = testApp();
afterAll(() => db.close());

/** Backdates this session's last activity. (ORM .update() changes one row, so target the session itself.) */
async function idleFor(cookie: string, minutes: number) {
  await request('GET', '/me', { cookie });
  const session = await container.cradle.auth.api.getSession({ headers: new Headers({ cookie }) });
  const at = Temporal.Now.instant().subtract({ minutes });
  await db.orm.app.SessionActivity.where({ sessionId: session!.session.id as never }).update({ lastSeenAt: at as never });
}

test('M1-LOG-06 AC1: HQ: 31 idle minutes end the session (and it stays ended)', async () => {
  const cookie = await login(mobileOf('accounts'));
  expect((await request('GET', '/me', { cookie })).status).toBe(200);
  await idleFor(cookie, 31);
  expect(await request('GET', '/me', { cookie })).toMatchObject({ status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'Signed out after 30 minutes without activity' } } });
  expect((await request('GET', '/me', { cookie })).status).toBe(401);
});

test('M1-LOG-06 AC1 AC2: HQ and auditor: 29 idle minutes are fine', async () => {
  const cookie = await login(mobileOf('auditor'));
  await idleFor(cookie, 29);
  expect((await request('GET', '/me', { cookie })).status).toBe(200);
});

test('M1-LOG-06 AC1: the timeout is per role: supervisors have none by default', async () => {
  const cookie = await login(mobileOf('supB'));
  await idleFor(cookie, 600);
  expect((await request('GET', '/me', { cookie })).status).toBe(200);
});

test('M1-LOG-06 AC1: an idle session is dead on Better Auth endpoints too', async () => {
  const cookie = await login(mobileOf('hr'));
  await idleFor(cookie, 31);
  const res = await request('GET', '/api/auth/get-session', { cookie });
  expect(res.status).toBe(401);
  expect((await request('GET', '/me', { cookie })).status).toBe(401);
});

test('M1-LOG-06 AC1: a session with no activity row yet still times out (counted from its creation)', async () => {
  const cookie = await login(mobileOf('payroll'));
  const session = await container.cradle.auth.api.getSession({ headers: new Headers({ cookie }) });
  await db.orm.app.SessionActivity.where({ sessionId: session!.session.id as never }).delete();
  await container.cradle.db.orm.app.SessionActivity.select('sessionId').first(); // no row for this session
  const { internalAdapter } = await container.cradle.auth.$context;
  await internalAdapter.updateSession(session!.session.token, { createdAt: new Date(Date.now() - 45 * 60_000) } as never);
  expect((await request('GET', '/me', { cookie })).status).toBe(401);
});
