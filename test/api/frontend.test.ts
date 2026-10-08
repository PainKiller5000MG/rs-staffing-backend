// D2: what the frontend team relies on — /me, /lookups, bearer tokens.
import { afterAll, expect, test } from 'vitest';
import { db } from '../../src/prisma/db.ts';
import { mobileOf, testApp } from '../helpers.ts';

const { request, login, bearerToken } = testApp();
afterAll(() => db.close());

test('GET /me: role, permissions and (supervisors) site scopes with code and name', async () => {
  const cookie = await login(mobileOf('supA'));
  const me = await request('GET', '/me', { cookie });
  expect(me.status).toBe(200);
  expect(me.body.permissions).toEqual(expect.arrayContaining(['sites.read', 'attendance.write']));
  expect(me.body.permissions).not.toContain('users.read');
  expect(me.body.siteScopes.map((s: { siteCode: string }) => s.siteCode).sort()).toEqual(['NTX-BPL', 'NTX-MDP', 'VHC-IDR']);

  const admin = await request('GET', '/me', { cookie: await login(mobileOf('admin')) });
  expect(admin.body.permissions).toEqual(expect.arrayContaining(['users.write', 'payroll.lock', 'aadhaar.reveal']));
  expect(admin.body.siteScopes).toEqual([]);
});

test('GET /lookups: enums from the contract (with labels), states, permissions, rule codes', async () => {
  const res = await request('GET', '/lookups', { cookie: await login(mobileOf('hr')) });
  expect(res.status).toBe(200);
  expect(res.body.enums.DayCode).toEqual(expect.arrayContaining([{ value: 'WOP', label: 'Weekly off worked' }]));
  expect(res.body.enums.Role.map((o: { value: string }) => o.value)).toEqual(['ADMIN', 'PAYROLL', 'HR', 'ACCOUNTS', 'AUDITOR', 'SUPERVISOR', 'EMPLOYEE']);
  expect(res.body.enums.EmployeeStatus).toEqual(expect.arrayContaining([{ value: 'ON_NOTICE', label: 'On notice' }]));
  expect(res.body.states).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'MP', rulesCompleteThrough: '2026-12-31' })]));
  expect(res.body.ruleCodes).toContain('EPF_WAGE_CEILING');
});

test('a frontend on another domain uses a bearer token instead of the cookie', async () => {
  await login(mobileOf('payroll'));
  const token = bearerToken();
  expect(token).toEqual(expect.any(String));
  const me = await request('GET', '/me', { bearer: token! });
  expect(me).toMatchObject({ status: 200, body: { role: 'PAYROLL' } });
  expect((await request('GET', '/me', { bearer: 'not-a-real-token' })).status).toBe(401);
});
