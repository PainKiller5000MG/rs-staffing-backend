// M1-OTP-03: decides whether an OTP request actually sends an SMS. Better
// Auth answers every send-otp request with the same 200 "code sent"; this
// gate silently drops sends to unknown/inactive numbers and over-limit ones:
//   at most OTP_MAX_PER_PHONE_HOUR SMS per phone, OTP_MAX_PER_IP_HOUR attempts per IP.
// Attempts are recorded in app.login_events, so limits survive restarts and
// HQ can see OTP volume (and SMS cost) per day.
//
// Count-then-record runs in one transaction behind advisory locks on the phone
// and the IP (always in that order), so concurrent requests can't all read
// the same count and overshoot the cap.
//
// Known trade-off: anyone can spend a victim's per-phone quota, so the real
// user gets no SMS for up to an hour. The per-IP cap limits one attacker;
// OTP_THROTTLED rows make it visible to HQ.
import type { Models } from '../prisma/contract.d.ts';
import type { Db, Tx } from '../core/context.ts';

export type OtpDecision = 'SEND' | 'UNKNOWN' | 'THROTTLED';
type Event = Models.app_LoginEvent;

const HOUR_MS = 3_600_000;

export class OtpGate {
  readonly #db: Db;
  readonly #maxPerPhone: number;
  readonly #maxPerIp: number;

  constructor({ db, config }: { db: Db; config: { OTP_MAX_PER_PHONE_HOUR: number; OTP_MAX_PER_IP_HOUR: number } }) {
    this.#db = db;
    this.#maxPerPhone = config.OTP_MAX_PER_PHONE_HOUR;
    this.#maxPerIp = config.OTP_MAX_PER_IP_HOUR;
  }

  async decide(mobile: string, ip: string | null): Promise<OtpDecision> {
    return this.#db.transaction(async (tx) => {
      await this.#lock(tx, `otp:phone:${mobile}`);
      if (ip) await this.#lock(tx, `otp:ip:${ip}`);
      return this.#decide(tx, mobile, ip);
    });
  }

  async #lock(tx: Tx, key: string): Promise<void> {
    const plan = this.#db.raw.sql`SELECT pg_advisory_xact_lock(hashtext(${key}))::text AS locked`
      .returnsRow({ locked: 'pg/text@1' })
      .build();
    await tx.query(plan);
  }

  async #decide(tx: Tx, mobile: string, ip: string | null): Promise<OtpDecision> {
    const since = Temporal.Now.instant().subtract({ milliseconds: HOUR_MS });
    const events = tx.orm.app.LoginEvent;

    const sentToPhone = await events
      .where((e) => e.mobile.eq(mobile as Event['mobile']))
      .where((e) => e.result.eq('OTP_SENT' as Event['result']))
      .where((e) => e.at.gte(since as Event['at']))
      .aggregate((a) => ({ n: a.count() }));
    const fromIp = ip
      ? await events
          .where((e) => e.ip.eq(ip as Event['ip']))
          .where((e) => e.result.in(['OTP_SENT', 'OTP_UNKNOWN'] as Event['result'][]))
          .where((e) => e.at.gte(since as Event['at']))
          .aggregate((a) => ({ n: a.count() }))
      : { n: 0 };

    const user = await tx.orm.app.User.select('id').where({ mobile: mobile as Models.app_User['mobile'], status: 'ACTIVE' }).first();
    const decision: OtpDecision =
      sentToPhone.n >= this.#maxPerPhone || fromIp.n >= this.#maxPerIp ? 'THROTTLED' : user ? 'SEND' : 'UNKNOWN';

    await events.create({
      userId: user?.id ?? null,
      mobile: mobile as Event['mobile'],
      result: (decision === 'SEND' ? 'OTP_SENT' : `OTP_${decision}`) as Event['result'],
      ip: ip as Event['ip'],
    });
    return decision;
  }
}
