import { randomInt } from 'node:crypto';
// Shared test helpers. DB/API tests expect a database reset with
// `npm run seed:reset` (see README).
import { createApp } from '../src/core/app.ts';
import { createRootContainer } from '../src/core/container.ts';
import { modules } from '../src/modules/index.ts';
import { db } from '../src/prisma/db.ts';
import { USERS } from '../seed/data.ts';

export const mobileOf = (key: (typeof USERS)[number]['key']) => USERS.find((u) => u.key === key)!.mobile;

export function testApp() {
  const container = createRootContainer();
  const app = createApp({ modules, container });
  const origin = container.cradle.config.WEB_ORIGIN;

  async function request(method: string, path: string, opts: { cookie?: string; body?: unknown } = {}) {
    const headers: Record<string, string> = { origin };
    if (opts.cookie) headers['cookie'] = opts.cookie;
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    const res = await app.request(path, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
    const text = await res.text();
    return { status: res.status, headers: res.headers, body: text ? (JSON.parse(text) as any) : null };
  }

  /** Phone OTP login through Better Auth; the mock SMS provider's outbox supplies the code. */
  async function login(mobile: string): Promise<string> {
    const since = Temporal.Now.instant();
    const sent = await request('POST', '/api/auth/phone-number/send-otp', { body: { phoneNumber: mobile } });
    if (sent.status !== 200) throw new Error(`send-otp ${sent.status}: ${JSON.stringify(sent.body)}`);
    const code = await waitForOtp(mobile, since);
    const res = await app.request('/api/auth/phone-number/verify', {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ phoneNumber: mobile, code }),
    });
    if (res.status !== 200) throw new Error(`verify ${res.status}: ${await res.text()}`);
    const cookies = res.headers.getSetCookie().map((c) => c.split(';')[0]);
    return cookies.join('; ');
  }

  return { app, container, request, login };
}

export async function waitForOtp(mobile: string, since: Temporal.Instant): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const msg = await db.orm.app.SmsOutbox.where((m) => m.toMobile.eq(mobile as never))
      .where((m) => m.createdAt.gte(since as never))
      .orderBy((m) => m.createdAt.desc())
      .first();
    const code = msg?.body.match(/^(\d{6}) /)?.[1];
    if (code) return code;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`no OTP in the outbox for ${mobile}`);
}

export async function countOutbox(mobile: string, since: Temporal.Instant): Promise<number> {
  const rows = await db.orm.app.SmsOutbox.select('id')
    .where((m) => m.toMobile.eq(mobile as never))
    .where((m) => m.createdAt.gte(since as never))
    .all();
  return rows.length;
}

/** A random test mobile (+9170 + 8 digits): tests create their own users, so runs don't collide. */
export const freshMobile = () => `+9170${String(randomInt(0, 100_000_000)).padStart(8, '0')}`;
