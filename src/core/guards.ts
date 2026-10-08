// Guards run before validation and the handler, in this order:
// requireSession → requireNotExpired → requireRole → requireSiteScope.
import { and, or } from '@prisma/orm-postgres/orm-client';
import type { Auth } from '../auth/auth.ts';
import { today } from '../lib/dates.ts';
import type { Role } from '../lib/roles.ts';
import type { Models } from '../prisma/contract.d.ts';
import type { Db, SessionUser } from './context.ts';
import { ForbiddenError, NotFoundError, UnauthorizedError } from './errors.ts';

type UserRow = Models.app_User;

/** Better Auth session → the app.users row → the caller's role and site reach. */
export async function requireSession(auth: Auth, db: Db, headers: Headers): Promise<SessionUser> {
  // No session cookie: answer 401 without a database round trip.
  if (!headers.get('cookie')?.includes('session_token')) throw new UnauthorizedError();
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
