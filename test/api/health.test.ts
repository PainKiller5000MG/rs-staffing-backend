import { afterAll, expect, test } from 'vitest';
import { db } from '../../src/prisma/db.ts';
import { testApp } from '../helpers.ts';

const { request } = testApp();
afterAll(() => db.close());

test('GET /health and /ready', async () => {
  expect(await request('GET', '/health')).toMatchObject({ status: 200, body: { ok: true } });
  expect(await request('GET', '/ready')).toMatchObject({ status: 200, body: { ok: true } });
});

test('every response carries a request id; errors use the standard shape', async () => {
  const res = await request('GET', '/nope');
  expect(res.status).toBe(404);
  expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Route not found', details: null, requestId: expect.any(String) } });
  expect(res.headers.get('x-request-id')).toBe(res.body.error.requestId);
});

test('/openapi.json lists the module routes', async () => {
  const { body } = await request('GET', '/openapi.json');
  expect(Object.keys(body.paths)).toEqual(expect.arrayContaining(['/health', '/ready', '/sites', '/sites/{siteId}']));
});

test('protected routes need a session', async () => {
  expect(await request('GET', '/sites')).toMatchObject({ status: 401, body: { error: { code: 'UNAUTHENTICATED' } } });
});
