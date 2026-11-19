// M1-OTP-03 AC2: verify calls are rate-limited per IP (10 per 5 minutes).
// Better Auth's limiter is off when NODE_ENV=test, so this app runs with it on.
import { randomInt } from 'node:crypto';
import { afterAll, expect, test } from 'vitest';
import { createApp } from '../../src/core/app.ts';
import { config } from '../../src/core/config.ts';
import { createRootContainer } from '../../src/core/container.ts';
import { modules } from '../../src/modules/index.ts';
import { db } from '../../src/prisma/db.ts';
import { freshMobile } from '../helpers.ts';

afterAll(() => db.close());

const container = createRootContainer({ config: { ...config(), NODE_ENV: 'development', TRUST_PROXY: true } });
const app = createApp({ modules, container });

const verify = (ip: string, mobile = freshMobile()) =>
  app.request('/api/auth/phone-number/verify', {
    method: 'POST',
    headers: { origin: 'http://localhost:3001', 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ phoneNumber: mobile, code: '000000' }),
  });

test('M1-OTP-03 AC2: the 11th verify from one IP in 5 minutes is 429; another IP is unaffected', async () => {
  const ip = `198.51.${randomInt(0, 255)}.${randomInt(1, 255)}`;
  for (let i = 0; i < 10; i++) expect((await verify(ip)).status).not.toBe(429);
  expect((await verify(ip)).status).toBe(429);
  expect((await verify(`192.0.2.${randomInt(1, 255)}`)).status).not.toBe(429);
});
