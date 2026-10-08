// Idempotency-Key on POSTs that create money records, through a test-only route.
import { z } from '@hono/zod-openapi';
import { randomUUID } from 'node:crypto';
import { asClass } from 'awilix';
import { afterAll, expect, test } from 'vitest';
import { audit } from '../../src/core/audit.ts';
import { createApp } from '../../src/core/app.ts';
import { createRootContainer } from '../../src/core/container.ts';
import type { Ctx } from '../../src/core/context.ts';
import { Module } from '../../src/core/module.ts';
import { defineRoutes } from '../../src/core/routes.ts';
import { modules } from '../../src/modules/index.ts';
import { db } from '../../src/prisma/db.ts';
import { mobileOf, testApp } from '../helpers.ts';

class MoneyService {
  async record(ctx: Ctx, body: { amountPaise: string }) {
    const id = randomUUID();
    await audit(ctx, 'test.money', 'test_money', null, { id, amountPaise: body.amountPaise });
    return { id, amountPaise: body.amountPaise };
  }
}

class MoneyController {
  constructor() {}
  static readonly routes = defineRoutes<MoneyController>([
    {
      method: 'post',
      path: '/test/money',
      summary: 'test-only money write',
      roles: ['ADMIN'],
      body: z.object({ amountPaise: z.string() }),
      response: z.object({ id: z.string(), amountPaise: z.string() }),
      status: 201,
      audit: 'test.money',
      idempotent: true,
      handler: (_c, ctx) => new MoneyService().record(ctx, ctx.body()),
    },
  ]);
}

class MoneyModule extends Module {
  readonly name = 'test-money';
  readonly providers = {};
  readonly controllers = [MoneyController];
}

const container = createRootContainer();
const app = createApp({ modules: [...modules, new MoneyModule()], container });
const { login } = testApp();
afterAll(() => db.close());

async function post(cookie: string, body: unknown, key?: string) {
  const res = await app.request('/test/money', {
    method: 'POST',
    headers: { origin: 'http://localhost:3001', 'content-type': 'application/json', cookie, ...(key ? { 'idempotency-key': key } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, replayed: res.headers.get('idempotent-replayed'), body: (await res.json()) as any };
}

test('a retry with the same key and body replays the first response and writes nothing', async () => {
  const cookie = await login(mobileOf('admin'));
  const key = `test-${randomUUID()}`;
  const first = await post(cookie, { amountPaise: '1655000' }, key);
  expect(first.status).toBe(201);
  const again = await post(cookie, { amountPaise: '1655000' }, key);
  expect(again).toMatchObject({ status: 201, replayed: 'true', body: first.body });
  const rows = await db.orm.audit.AuditLog.where({ action: 'test.money' as never, entityId: first.body.id }).all();
  expect(rows).toHaveLength(1);
});

test('the same key with a different body is refused; a missing key is refused', async () => {
  const cookie = await login(mobileOf('admin'));
  const key = `test-${randomUUID()}`;
  await post(cookie, { amountPaise: '100' }, key);
  expect(await post(cookie, { amountPaise: '200' }, key)).toMatchObject({ status: 422, body: { error: { code: 'IDEMPOTENCY_KEY_REUSED' } } });
  expect(await post(cookie, { amountPaise: '100' })).toMatchObject({ status: 422, body: { error: { code: 'IDEMPOTENCY_KEY_REQUIRED' } } });
});

test('startup refuses a route without a schema for its path param', () => {
  class Broken {
    static readonly routes = defineRoutes<Broken>([
      { method: 'get', path: '/broken/{id}', summary: 'x', roles: 'authenticated', response: z.object({}), handler: async () => ({}) },
    ]);
  }
  class BrokenModule extends Module {
    readonly name = 'broken';
    readonly providers = { unused: asClass(MoneyService) };
    readonly controllers = [Broken];
  }
  expect(() => createApp({ modules: [new BrokenModule()], container: createRootContainer() })).toThrow('path param {id} has no params schema');
});
