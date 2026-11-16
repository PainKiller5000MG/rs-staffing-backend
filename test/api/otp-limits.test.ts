// M1-OTP-03: OTP sends are capped per phone and per IP; over the limit the
// caller gets the same reply and no SMS.
import { randomInt } from 'node:crypto';
import { afterAll, expect, test } from 'vitest';
import { OtpGate } from '../../src/auth/otp-gate.ts';
import { db } from '../../src/prisma/db.ts';
import { countOutbox, freshMobile, testApp } from '../helpers.ts';

afterAll(() => db.close());
const randomIp = () => `203.0.${randomInt(0, 255)}.${randomInt(1, 255)}`;

test('M1-OTP-03 AC1: per phone: the 6th send in an hour is dropped', async () => {
  const mobile = freshMobile();
  await db.orm.app.User.create({ name: 'Limit Test', mobile, role: 'HR', status: 'ACTIVE' } as never);
  const gate = new OtpGate({ db, config: { OTP_MAX_PER_PHONE_HOUR: 5, OTP_MAX_PER_IP_HOUR: 1000 } });
  const decisions = [];
  for (let i = 0; i < 6; i++) decisions.push(await gate.decide(mobile, randomIp()));
  expect(decisions).toEqual(['SEND', 'SEND', 'SEND', 'SEND', 'SEND', 'THROTTLED']);
});

test('M1-OTP-03 AC1: concurrent sends for one phone still stop at the cap (no race)', async () => {
  const mobile = freshMobile();
  await db.orm.app.User.create({ name: 'Race Test', mobile, role: 'HR', status: 'ACTIVE' } as never);
  const gate = new OtpGate({ db, config: { OTP_MAX_PER_PHONE_HOUR: 5, OTP_MAX_PER_IP_HOUR: 1000 } });
  const decisions = await Promise.all(Array.from({ length: 12 }, () => gate.decide(mobile, randomIp())));
  expect(decisions.filter((d) => d === 'SEND')).toHaveLength(5);
});

test('M1-OTP-03 AC1: per IP: attempts on unknown numbers count too', async () => {
  const gate = new OtpGate({ db, config: { OTP_MAX_PER_PHONE_HOUR: 5, OTP_MAX_PER_IP_HOUR: 20 } });
  const ip = randomIp();
  const decisions = [];
  for (let i = 0; i < 21; i++) decisions.push(await gate.decide(freshMobile(), ip));
  expect(decisions.slice(0, 20).every((d) => d === 'UNKNOWN')).toBe(true);
  expect(decisions[20]).toBe('THROTTLED');
});

test('M1-OTP-03 AC1: over the limit, send-otp answers exactly like a successful send, and no SMS goes out', async () => {
  const { app, container } = testApp();
  const mobile = freshMobile();
  await db.orm.app.User.create({ name: 'Limit Test', mobile, role: 'HR', status: 'ACTIVE' } as never);
  // Use up this phone's quota through the gate the app uses.
  const strict = new OtpGate({ db, config: { OTP_MAX_PER_PHONE_HOUR: 5, OTP_MAX_PER_IP_HOUR: 1000 } });
  for (let i = 0; i < 5; i++) await strict.decide(mobile, null);
  (container.cradle.otpGate as unknown as { decide: OtpGate['decide'] }).decide = strict.decide.bind(strict);

  const since = Temporal.Now.instant();
  const res = await app.request('/api/auth/phone-number/send-otp', {
    method: 'POST',
    headers: { origin: 'http://localhost:3001', 'content-type': 'application/json' },
    body: JSON.stringify({ phoneNumber: mobile }),
  });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ message: 'code sent' });
  await new Promise((r) => setTimeout(r, 300));
  expect(await countOutbox(mobile, since)).toBe(0);
});
