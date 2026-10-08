// Guards run before validation and the handler, in this order:
// requireSession → requireNotExpired → requireRole → requireSiteScope.
import { and, or } from '@prisma/orm-postgres/orm-client';
import type { Auth } from '../auth/auth.ts';
import { today } from '../lib/dates.ts';
import type { Role } from '../lib/roles.ts';
import type { Models } from '../prisma/contract.d.ts';
import type { Db, SessionUser } from './context.ts';
import { findPgError } from './error-handler.ts';
import { ForbiddenError, NotFoundError, UnauthorizedError } from './errors.ts';

type UserRow = Models.app_User;

export type SessionOptions = { idleTimeoutMinutes: (role: Role) => number };

const ACTIVITY_WRITE_EVERY_MS = 60_000;

/**
 * M1-LOG-06: a session idle longer than its role's limit is revoked. Fails
 * closed: a session with no activity row counts as last seen when it was
 * created, and a failed activity write is an error, not a skipped check.
 * Activity is written at most once a minute per session (app.session_activity).
 */
async function checkIdle(auth: Auth, db: Db, session: { id: string; token: string; createdAt: Date | string }, userId: string, limitMinutes: number) {
  type A = Models.app_SessionActivity;
  const now = Temporal.Now.instant();
  const activity = await db.orm.app.SessionActivity.first({ sessionId: session.id as A['sessionId'] });
  const lastSeen = activity?.lastSeenAt ?? Temporal.Instant.fromEpochMilliseconds(new Date(session.createdAt).getTime());
  if (limitMinutes > 0 && Temporal.Instant.compare(lastSeen.add({ minutes: limitMinutes }), now) < 0) {
    const { internalAdapter } = await auth.$context;
    await internalAdapter.deleteSession(session.token);
    throw new UnauthorizedError(`Signed out after ${limitMinutes} minutes without activity`);
  }
  if (!activity) {
    try {
      await db.orm.app.SessionActivity.create({ sessionId: session.id as A['sessionId'], userId: userId as A['userId'], lastSeenAt: now as A['lastSeenAt'] });
    } catch (err) {
      if (findPgError(err)?.code !== '23505') throw err; // a concurrent first request created it
    }
  } else if (Temporal.Instant.compare(activity.lastSeenAt.add({ milliseconds: ACTIVITY_WRITE_EVERY_MS }), now) < 0) {
    await db.orm.app.SessionActivity.where({ sessionId: session.id as A['sessionId'] }).update({ lastSeenAt: now as A['lastSeenAt'] });
  }
}

/**
 * For Better Auth's own endpoints (/api/auth/*): a session that is idle past
 * its limit can't be used there either (get-session, update-user…). No-op
 * without credentials.
 */
export async function enforceIdle(auth: Auth, db: Db, headers: Headers, opts: SessionOptions): Promise<void> {
  const hasCredentials = /session_token/.test(headers.get('cookie') ?? '') || /^Bearer \S+/i.test(headers.get('authorization') ?? '');
  if (!hasCredentials) return;
  const session = await auth.api.getSession({ headers });
  if (!session) return;
  const user = await db.orm.app.User.select('id', 'role').where({ authUserId: session.user.id as UserRow['authUserId'] }).first();
  if (user) await checkIdle(auth, db, session.session, user.id, opts.idleTimeoutMinutes(user.role));
}

/** Better Auth session → the app.users row → the caller's role and site reach. */
export async function requireSession(auth: Auth, db: Db, headers: Headers, opts?: SessionOptions): Promise<SessionUser> {
  // No session cookie and no bearer token: answer 401 without a database round trip.
  const hasCookie = headers.get('cookie')?.includes('session_token') ?? false;
  const hasBearer = /^Bearer \S+/i.test(headers.get('authorization') ?? '');
  if (!hasCookie && !hasBearer) throw new UnauthorizedError();
  const session = await auth.api.getSession({ headers });
  if (!session) throw new UnauthorizedError();

  const user = await db.orm.app.User.where({ authUserId: session.user.id as UserRow['authUserId'] }).first();
  if (!user) throw new UnauthorizedError();
  if (user.status !== 'ACTIVE') throw new UnauthorizedError('This account is not active. Contact HQ.');

  const sessionUser: SessionUser = {
    id: user.id,
    authUserId: session.user.id,
    name: user.name,
    role: user.role,
    employeeId: user.employeeId,
    siteIds: user.role === 'SUPERVISOR' ? await activeSiteIds(db, user.id) : [],
  };
  requireNotExpired(user);
  if (opts) await checkIdle(auth, db, session.session, user.id, opts.idleTimeoutMinutes(user.role));
  return sessionUser;
}

/** Auditor accounts stop working at their expiry (M1-USR-01, M1-USR-09). */
export function requireNotExpired(user: Pick<UserRow, 'role' | 'expiresAt'>): void {
  if (user.expiresAt && Temporal.Instant.compare(user.expiresAt, Temporal.Now.instant()) <= 0) {
    throw new UnauthorizedError('This account has expired. Contact HQ.');
  }
}

export function requireRole(user: SessionUser, roles: readonly Role[]): void {
  if (!roles.includes(user.role)) throw new ForbiddenError();
}

/**
 * Supervisors reach only sites with an approved, current, un-ended scope;
 * HQ roles reach every site; anyone else reaches none through a site route.
 * Out of scope answers exactly like a site that doesn't exist (404), so site
 * ids can't be probed (M1-SCP-02). A wrong role is still a 403.
 */
export function requireSiteScope(user: SessionUser, siteIds: readonly string[]): void {
  if (user.role === 'SUPERVISOR') {
    if (siteIds.every((id) => user.siteIds.includes(id))) return;
    throw new NotFoundError('Site');
  }
  if (user.role === 'EMPLOYEE') throw new ForbiddenError();
}

export async function activeSiteIds(db: Db, userId: string): Promise<string[]> {
  const day = today();
  const scopes = await db.orm.app.UserSiteScope.select('siteId')
    .where((s) =>
      and(
        s.userId.eq(userId as Models.app_UserSiteScope['userId']),
        s.approvedBy.isNotNull(),
        s.endedAt.isNull(),
        s.effectiveFrom.lte(day),
        or(s.effectiveTo.isNull(), s.effectiveTo.gte(day)),
      ),
    )
    .all();
  return [...new Set(scopes.map((s) => s.siteId))];
}
