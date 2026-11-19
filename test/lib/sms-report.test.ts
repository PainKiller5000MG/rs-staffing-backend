// M1-OTP-03 AC3 AC4 (daily SMS bill + low-balance alert) and M1-OTP-08 AC2 (no mock in production).
import { afterAll, expect, test, vi } from 'vitest';
import { loadConfig } from '../../src/core/config.ts';
import { SmsDailyReport } from '../../src/jobs/sms-daily-report.ts';
import { db } from '../../src/prisma/db.ts';
import { freshMobile } from '../helpers.ts';

afterAll(() => db.close());

const day = Temporal.PlainDate.from({ year: 2100, month: 1, day: 1 }).add({ days: Math.floor(Math.random() * 20000) }); // a far-future day per run: events are append-only, so reruns must not collide
const at = (h: number) => day.toZonedDateTime({ timeZone: 'Asia/Kolkata', plainTime: { hour: h } }).toInstant();

async function sent(n: number, when: Temporal.Instant, result = 'OTP_SENT') {
  for (let i = 0; i < n; i++) await db.orm.app.LoginEvent.create({ mobile: freshMobile(), result, at: when, ip: null } as never);
}

function report(balance: bigint | null, lowAt?: number) {
  const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
  const sms = { balancePaise: vi.fn(async () => balance) };
  const job = new SmsDailyReport({ db, sms: sms as never, logger: logger as never, config: { OTP_SMS_COST_PAISE: 30, SMS_LOW_BALANCE_PAISE: lowAt } });
  return { job, logger };
}

test('M1-OTP-03 AC3: the report counts the IST day\'s sent OTPs (not throttled, not the next day) and prices them', async () => {
  await sent(3, at(0));
  await sent(2, at(23));
  await sent(4, at(12), 'OTP_THROTTLED');
  await sent(5, day.add({ days: 1 }).toZonedDateTime('Asia/Kolkata').toInstant());
  const { job, logger } = report(500_000n);
  const r = await job.run(day);
  expect(r).toMatchObject({ date: day.toString(), otpSent: 5, costPaise: 150n, balancePaise: 500_000n, lowBalance: false });
  expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ otpSent: 5, costPaise: '150' }), 'sms daily report');
  expect(logger.error).not.toHaveBeenCalled();
});

test('M1-OTP-03 AC4: balance below the configured amount raises the alert; at or above does not', async () => {
  const low = report(99_999n, 100_000);
  expect((await low.job.run(day)).lowBalance).toBe(true);
  expect(low.logger.error).toHaveBeenCalledWith(expect.objectContaining({ thresholdPaise: 100_000 }), 'sms balance low');
  expect((await report(100_000n, 100_000).job.run(day)).lowBalance).toBe(false);
  expect((await report(1n).job.run(day)).lowBalance).toBe(false); // no threshold configured
  expect((await report(null, 100_000).job.run(day)).lowBalance).toBe(false); // mock has no balance
});

test('M1-OTP-08 AC2: production refuses to start with the mock SMS provider', () => {
  const prod = {
    DATABASE_URL: 'postgresql://x@localhost/db', NODE_ENV: 'production',
    BETTER_AUTH_SECRET: 'x'.repeat(32), DATA_KEY: Buffer.alloc(32).toString('base64'), HMAC_KEY: Buffer.alloc(32).toString('base64'),
  };
  expect(() => loadConfig(prod)).toThrow(/SMS_PROVIDER: the mock SMS provider is not allowed in production/);
  expect(() => loadConfig({ ...prod, SMS_PROVIDER: 'mock' })).toThrow(/not allowed in production/);
  expect(() => loadConfig({ DATABASE_URL: prod.DATABASE_URL })).not.toThrow(); // dev default is still the mock
});

test('M1-OTP-08 AC3: auth takes the provider as an interface only; a different provider changes nothing else', async () => {
  const { createAuth } = await import('../../src/auth/auth.ts');
  const sendOtp = vi.fn(async () => {});
  const auth = createAuth({
    config: loadConfig({ DATABASE_URL: process.env['DATABASE_URL'] ?? 'postgresql://x@localhost/db' }),
    logger: { error: vi.fn() } as never,
    sms: { sendOtp, sendTemplate: vi.fn(), balancePaise: vi.fn() } as never,
    otpGate: { decide: async () => 'SEND' as const },
  });
  expect(auth.options.session?.expiresIn).toBe(60 * 60 * 12); // sessions/roles/audit don't depend on the provider
});
