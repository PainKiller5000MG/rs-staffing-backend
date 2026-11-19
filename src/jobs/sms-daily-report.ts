// M1-OTP-03 AC3 AC4: the daily SMS bill report and the low-balance alert.
// Counts OTP SMS actually sent (login_events OTP_SENT) for one IST day, prices
// them at OTP_SMS_COST_PAISE, and checks the provider balance. HQ sees the
// result in the log line `sms daily report`; a low balance logs at error level
// (`sms balance low`), which the log alerting picks up.
import type { Logger } from '../core/logger.ts';
import type { Db } from '../core/context.ts';
import type { SmsProvider } from '../lib/sms.ts';
import type { Models } from '../prisma/contract.d.ts';

export type SmsReport = {
  date: string;
  otpSent: number;
  costPaise: bigint;
  balancePaise: bigint | null;
  lowBalance: boolean;
};

type Deps = {
  db: Db;
  sms: SmsProvider;
  logger: Logger;
  config: { OTP_SMS_COST_PAISE: number; SMS_LOW_BALANCE_PAISE?: number };
};

export class SmsDailyReport {
  readonly #d: Deps;
  constructor(deps: Deps) {
    this.#d = deps;
  }

  /** `day` is an IST calendar date; the job runs shortly after midnight for yesterday. */
  async run(day: Temporal.PlainDate = Temporal.Now.plainDateISO('Asia/Kolkata').subtract({ days: 1 })): Promise<SmsReport> {
    type E = Models.app_LoginEvent;
    const from = day.toZonedDateTime('Asia/Kolkata').toInstant();
    const to = day.add({ days: 1 }).toZonedDateTime('Asia/Kolkata').toInstant();
    const { n } = await this.#d.db.orm.app.LoginEvent
      .where((e) => e.result.eq('OTP_SENT' as E['result']))
      .where((e) => e.at.gte(from as E['at']))
      .where((e) => e.at.lt(to as E['at']))
      .aggregate((a) => ({ n: a.count() }));

    let balancePaise: bigint | null = null;
    try {
      balancePaise = await this.#d.sms.balancePaise();
    } catch (err) {
      this.#d.logger.error({ err }, 'sms balance check failed');
    }
    const threshold = this.#d.config.SMS_LOW_BALANCE_PAISE;
    const lowBalance = balancePaise !== null && threshold !== undefined && balancePaise < BigInt(threshold);

    const report: SmsReport = {
      date: day.toString(),
      otpSent: Number(n),
      costPaise: BigInt(n) * BigInt(this.#d.config.OTP_SMS_COST_PAISE),
      balancePaise,
      lowBalance,
    };
    const fields = { ...report, costPaise: String(report.costPaise), balancePaise: balancePaise === null ? null : String(balancePaise) };
    this.#d.logger.info(fields, 'sms daily report');
    if (lowBalance) this.#d.logger.error({ ...fields, thresholdPaise: threshold }, 'sms balance low');
    return report;
  }
}
