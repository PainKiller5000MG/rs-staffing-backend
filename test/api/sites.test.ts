// M1-SCP-02: a supervisor reaches only their approved, current site scopes.
import { afterAll, beforeAll, expect, test } from 'vitest';
import { db } from '../../src/prisma/db.ts';
import { mobileOf, testApp } from '../helpers.ts';

const { request, login } = testApp();
const siteId: Record<string, string> = {};
let supA: string;
let hq: string;

beforeAll(async () => {
  for (const s of await db.orm.app.Site.all()) siteId[s.code] = s.id;
  supA = await login(mobileOf('supA'));
  hq = await login(mobileOf('payroll'));
});
afterAll(() => db.close());

test('supervisor 9000000010 lists exactly their 3 sites', async () => {
  const res = await request('GET', '/sites', { cookie: supA });
  expect(res.status).toBe(200);
  expect(res.body.items.map((s: { code: string }) => s.code).sort()).toEqual(['NTX-BPL', 'NTX-MDP', 'VHC-IDR']);
});

test('their own site: 200; a site outside their scope: 404, identical to a site that does not exist', async () => {
  expect((await request('GET', `/sites/${siteId['NTX-BPL']}`, { cookie: supA })).status).toBe(200);
  const outside = await request('GET', `/sites/${siteId['CCW-KOT']}`, { cookie: supA });
  const missing = await request('GET', '/sites/01900000-0000-7000-8000-000000000000', { cookie: hq });
  expect(outside.status).toBe(404);
  expect(outside.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Site not found', details: null, requestId: expect.any(String) } });
  expect({ ...outside.body.error, requestId: null }).toEqual({ ...missing.body.error, requestId: null });
});

test('supervisors cannot manage users; HQ sees every site', async () => {
  expect((await request('GET', '/users', { cookie: supA })).status).toBe(403);
  const res = await request('GET', '/sites', { cookie: hq });
  expect(res.body.items.map((s: { code: string }) => s.code)).toEqual(
    expect.arrayContaining(['NTX-BPL', 'NTX-MDP', 'VHC-IDR', 'VHC-UJN', 'CCW-GWL', 'CCW-KOT']),
  );
});
