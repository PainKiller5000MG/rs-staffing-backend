// Outbound SMS. P0 ships only the mock (Decision 12): messages land in
// app.sms_outbox for the Outbox screen. A real DLT-registered provider — and
// a DLT OTP template — is a launch blocker for production.
import type { Logger } from '../core/logger.ts';
import type { db as Db } from '../prisma/db.ts';
import type { Models } from '../prisma/contract.d.ts';

export interface SmsProvider {
  sendOtp(mobile: string, code: string): Promise<void>;
  send(mobile: string, body: string): Promise<void>;
}

type Outbox = Models.app_SmsOutbox;

export class MockSms implements SmsProvider {
  readonly #db: typeof Db;
  readonly #logger: Logger;
  readonly #echoOtp: boolean;

  constructor({ db, logger, config }: { db: typeof Db; logger: Logger; config: { NODE_ENV: string } }) {
    this.#db = db;
    this.#logger = logger;
    this.#echoOtp = config.NODE_ENV !== 'production';
  }

  async sendOtp(mobile: string, code: string): Promise<void> {
    await this.send(mobile, `${code} is your RS Staffing login code. It expires in 5 minutes.`);
    // Development convenience: the code is printed, never logged through pino.
    if (this.#echoOtp) console.log(`[mock sms] OTP for ${mobile}: ${code}`);
  }

  async send(mobile: string, body: string): Promise<void> {
    await this.#db.orm.app.SmsOutbox.create({
      toMobile: mobile as Outbox['toMobile'],
      body,
      deliveryId: null,
    });
    this.#logger.debug('sms queued to outbox');
  }
}
