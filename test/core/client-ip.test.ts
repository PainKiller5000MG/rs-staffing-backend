// Security: the caller can't choose the IP that audit rows and rate limits see.
import { Hono } from 'hono';
import { expect, test } from 'vitest';
import { CLIENT_IP_HEADER, clientIp, withClientIp } from '../../src/core/client-ip.ts';

async function ipFor(trustProxy: boolean, headers: Record<string, string>) {
  const app = new Hono();
  app.get('/', (c) => c.json({ ip: clientIp(c, trustProxy) }));
  const res = await app.request('/', { headers });
  return (await res.json()) as { ip: string | null };
}

test('X-Forwarded-For is ignored unless TRUST_PROXY is on', async () => {
  expect((await ipFor(false, { 'x-forwarded-for': '6.6.6.6' })).ip).toBeNull();
});

test('behind our proxy, the last hop wins, not the client-chosen first one', async () => {
  expect((await ipFor(true, { 'x-forwarded-for': '6.6.6.6, 203.0.113.9' })).ip).toBe('203.0.113.9');
});

test('a client-sent client-IP header is replaced, not forwarded', () => {
  const req = new Request('http://x/api/auth/phone-number/send-otp', { headers: { [CLIENT_IP_HEADER]: '6.6.6.6' } });
  expect(withClientIp(req, '203.0.113.9').headers.get(CLIENT_IP_HEADER)).toBe('203.0.113.9');
  expect(withClientIp(req, null).headers.get(CLIENT_IP_HEADER)).toBeNull();
});
