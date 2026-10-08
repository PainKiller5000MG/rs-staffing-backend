// M1-SEC-06, applied to phone OTP (there are no passwords):
//   - 5 failed OTP verifies for a number in 15 minutes → that number is refused for 15 minutes
//   - 10 failed verifies in 24 hours → the user is set LOCKED until an Admin re-enables them
//     (POST /users/{id}/enable), which also clears the counter
//   - 30 failed verifies from one IP in an hour → that IP is refused
// A refused number gets the same TOO_MANY_ATTEMPTS reply whether or not it is
// registered. Failures and unlocks are app.login_events rows; lockouts are audited.
import { auditSystem } from '../core/audit.ts';
import type { Db } from '../core/context.ts';
import type { Logger } from '../core/logger.ts';
import type { Models } from '../prisma/contract.d.ts';

type Event = Models.app_LoginEvent;
const MIN = 60_000;

export const LOCKOUT = {
  shortWindowMs: 15 * MIN,
  shortMax: 5,
  longWindowMs: 24 * 60 * MIN,
  longMax: 10,
  ipWindowMs: 60 * MIN,
  ipMax: 30,
};

export type Attempt = { blocked: boolean; succeed(): Promise<void>; fail(): Promise<void> };

export class OtpLockout {
  readonly #db: Db;
  readonly #logger: Logger;

  constructor({ db, logger }: { db: Db; logger: Logger }) {
    this.#db = db;
    this.#logger = logger;
  }

  /**
   * Records the attempt BEFORE the code is checked (result OTP_TRY) and counts it
   * together with earlier ones, so concurrent guesses can't all slip under the
   * cap: each sees every attempt inserted before its own count.
   */
  async begin(mobile: string, ip: string | null): Promise<Attempt> {
    const user = await this.#user(mobile);
    const row = await this.#db.orm.app.LoginEvent.create({
      userId: user?.id ?? null,
      mobile: mobile as Event['mobile'],
      result: 'OTP_TRY' as Event['result'],
      ip: ip as Event['ip'],
    });
    const blocked =
      user?.status === 'LOCKED' ||
      (await this.#tries(mobile, LOCKOUT.shortWindowMs)) > LOCKOUT.shortMax ||
      (ip !== null && (await this.#ipTries(ip)) > LOCKOUT.ipMax);
    return {
      blocked,
      succeed: () => this.#settle(row.id, 'OTP_OK'),
      fail: async () => {
        await this.#settle(row.id, 'OTP_FAIL');
        if (user) await this.#afterFailure(user, mobile, ip);
      },
    };
  }

  async #settle(id: string, result: 'OTP_OK' | 'OTP_FAIL') {
    await this.#db.orm.app.LoginEvent.where({ id: id as Event['id'] }).update({ result: result as Event['result'] });
  }

  async #afterFailure(user: { id: string; status: string }, mobile: string, ip: string | null) {
    const long = await this.#tries(mobile, LOCKOUT.longWindowMs);
    if (long >= LOCKOUT.longMax && user.status === 'ACTIVE') {
      await this.#db.transaction(async (tx) => {
        await tx.orm.app.User.where({ id: user.id as Models.app_User['id'] }).update({ status: 'LOCKED' });
        await auditSystem(tx, { action: 'auth.lockout', entity: 'user', entityId: user.id, after: { status: 'LOCKED' }, reason: `${long} failed OTPs in 24 hours`, ip });
      });
      this.#logger.warn({ userId: user.id }, 'account locked after repeated failed OTPs');
    } else if ((await this.#tries(mobile, LOCKOUT.shortWindowMs)) === LOCKOUT.shortMax) {
      await auditSystem(this.#db, { action: 'auth.lockout_temporary', entity: 'user', entityId: user.id, reason: `${LOCKOUT.shortMax} failed OTPs in 15 minutes`, ip });
    }
  }

  /** Called when an Admin re-enables a LOCKED user: earlier failures stop counting. */
  async clear(userId: string, mobile: string, executor: Pick<Db, 'orm'> = this.#db): Promise<void> {
    await executor.orm.app.LoginEvent.create({ userId, mobile: mobile as Event['mobile'], result: 'UNLOCKED' as Event['result'], ip: null });
  }

  async #user(mobile: string) {
    return this.#db.orm.app.User.select('id', 'status').where({ mobile: mobile as Models.app_User['mobile'] }).first();
  }

  /** Unsettled and failed tries for a number within the window, ignoring any before the last unlock. */
  async #tries(mobile: string, windowMs: number): Promise<number> {
    const events = this.#db.orm.app.LoginEvent;
    const windowStart = Temporal.Now.instant().subtract({ milliseconds: windowMs });
    const unlock = await events
      .select('at')
      .where((e) => e.mobile.eq(mobile as Event['mobile']))
      .where((e) => e.result.eq('UNLOCKED' as Event['result']))
      .orderBy((e) => e.at.desc())
      .first();
    const since = unlock && Temporal.Instant.compare(unlock.at, windowStart) > 0 ? unlock.at : windowStart;
    const { n } = await events
      .where((e) => e.mobile.eq(mobile as Event['mobile']))
      .where((e) => e.result.in(['OTP_TRY', 'OTP_FAIL'] as Event['result'][]))
      .where((e) => e.at.gt(since as Event['at']))
      .aggregate((a) => ({ n: a.count() }));
    return n;
  }

  async #ipTries(ip: string): Promise<number> {
    const since = Temporal.Now.instant().subtract({ milliseconds: LOCKOUT.ipWindowMs });
    const { n } = await this.#db.orm.app.LoginEvent.where((e) => e.ip.eq(ip as Event['ip']))
      .where((e) => e.result.in(['OTP_TRY', 'OTP_FAIL'] as Event['result'][]))
      .where((e) => e.at.gte(since as Event['at']))
      .aggregate((a) => ({ n: a.count() }));
    return n;
  }
}
