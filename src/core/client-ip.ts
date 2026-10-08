// The caller's IP, computed once per request. Client-supplied headers are not
// trusted: by default the IP is the TCP peer. Behind our own reverse proxy
// (TRUST_PROXY=true) it is the last X-Forwarded-For entry — the one that proxy
// appended — never the leftmost, which the client controls.
//
// The result feeds the audit trail (Ctx.ip) and Better Auth's rate limiter,
// which reads only CLIENT_IP_HEADER; the app overwrites that header itself.
import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context } from 'hono';

export const CLIENT_IP_HEADER = 'x-rs-client-ip';

export function clientIp(c: Context, trustProxy: boolean): string | null {
  if (trustProxy) {
    const hops = c.req.header('x-forwarded-for')?.split(',').map((s) => s.trim()).filter(Boolean);
    if (hops?.length) return hops.at(-1)!;
  }
  try {
    return getConnInfo(c).remote.address ?? null;
  } catch {
    return null; // no socket (in-process requests in tests)
  }
}

/** A copy of the request whose CLIENT_IP_HEADER is ours, whatever the client sent. */
export function withClientIp(req: Request, ip: string | null): Request {
  const headers = new Headers(req.headers);
  headers.delete(CLIENT_IP_HEADER);
  if (ip) headers.set(CLIENT_IP_HEADER, ip);
  return new Request(req, { headers });
}
