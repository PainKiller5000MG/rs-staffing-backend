// Outbound SMS. Messages are DLT templates, so callers send a template kind
// plus its variables, never free text. Providers:
//   mock  — dev/test (Decision 12): writes the rendered text to app.sms_outbox
//   msg91 — production: MSG91's template (flow) API; templates and DLT
//           registration are a launch blocker (docs/GO-LIVE.md)
// Better Auth generates and verifies OTPs; providers only deliver the code.
// The OTP is never logged, except printed by MockSms outside production.
import type { Logger } from '../core/logger.ts';
import type { Models } from '../prisma/contract.d.ts';
import type { db as Db } from '../prisma/db.ts';

export type TemplateKind = 'OTP' | 'PAYSLIP' | 'PAYSLIP_REVISED' | 'FNF';

/**
 * Variables each template receives. The MSG91 templates must use exactly
 * these names (##otp##, ##name##, ##month##, ##link##): they are case-sensitive.
 */
export type TemplateVars = {
  OTP: { otp: string };
  PAYSLIP: { name: string; month: string; link: string };
  PAYSLIP_REVISED: { name: string; month: string; link: string };
  FNF: { name: string; link: string };
};

export type SendResult = { providerMsgId: string | null };

export interface SmsProvider {
  sendOtp(mobile: string, code: string): Promise<void>;
  /** templateId overrides the provider's default for the kind (message_templates.provider_template_id). */
  sendTemplate<K extends TemplateKind>(kind: K, mobile: string, vars: TemplateVars[K], templateId?: string | null): Promise<SendResult>;
}

/** The text the mock writes; real wording lives in the DLT-registered templates. */
const MOCK_TEXT: { [K in TemplateKind]: (v: TemplateVars[K]) => string } = {
  OTP: (v) => `${v.otp} is your RS Staffing login code. It expires in 5 minutes.`,
  PAYSLIP: (v) => `Dear ${v.name}, your ${v.month} payslip from RS Staffing: ${v.link}`,
  PAYSLIP_REVISED: (v) => `Dear ${v.name}, your revised ${v.month} payslip from RS Staffing: ${v.link}`,
  FNF: (v) => `Dear ${v.name}, your final settlement statement from RS Staffing: ${v.link}`,
};

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
    await this.sendTemplate('OTP', mobile, { otp: code });
    // Development convenience: printed to stdout, never through pino.
    if (this.#echoOtp) console.log(`[mock sms] OTP for ${mobile}: ${code}`);
  }

  async sendTemplate<K extends TemplateKind>(kind: K, mobile: string, vars: TemplateVars[K]): Promise<SendResult> {
    const row = await this.#db.orm.app.SmsOutbox.create({
      toMobile: mobile as Outbox['toMobile'],
      body: MOCK_TEXT[kind](vars),
      deliveryId: null,
    });
    this.#logger.debug({ kind }, 'sms queued to outbox');
    return { providerMsgId: `mock-${row.id}` };
  }
}

export class SmsProviderError extends Error {}

type Msg91Config = {
  MSG91_AUTH_KEY?: string;
  MSG91_SENDER_ID?: string;
  MSG91_TPL_OTP?: string;
  MSG91_TPL_PAYSLIP?: string;
  MSG91_TPL_PAYSLIP_REVISED?: string;
  MSG91_TPL_FNF?: string;
};

/**
 * MSG91 template (flow) API:
 *   POST https://control.msg91.com/api/v5/flow
 *   headers: authkey, content-type: application/json
 *   body:    { template_id, sender, short_url: "0", recipients: [{ mobiles: "91XXXXXXXXXX", ...vars }] }
 *   reply:   { type: "success", message: "<request id>" } | { type: "error", message: "<reason>" }
 * The request id comes back on every delivery report (requestId).
 */
export class Msg91Sms implements SmsProvider {
  static readonly ENDPOINT = 'https://control.msg91.com/api/v5/flow';

  readonly #config: Required<Msg91Config>;
  readonly #fetch: typeof fetch;
  readonly #logger: Logger;

  constructor({ config, logger, httpClient }: { config: Msg91Config; logger: Logger; httpClient?: typeof fetch }) {
    for (const k of ['MSG91_AUTH_KEY', 'MSG91_SENDER_ID', 'MSG91_TPL_OTP', 'MSG91_TPL_PAYSLIP', 'MSG91_TPL_PAYSLIP_REVISED', 'MSG91_TPL_FNF'] as const) {
      if (!config[k]) throw new Error(`${k} is required for the MSG91 provider`);
    }
    this.#config = config as Required<Msg91Config>;
    this.#fetch = httpClient ?? fetch;
    this.#logger = logger;
  }

  async sendOtp(mobile: string, code: string): Promise<void> {
    await this.sendTemplate('OTP', mobile, { otp: code });
  }

  async sendTemplate<K extends TemplateKind>(kind: K, mobile: string, vars: TemplateVars[K], templateId?: string | null): Promise<SendResult> {
    const defaults: Record<TemplateKind, string> = {
      OTP: this.#config.MSG91_TPL_OTP,
      PAYSLIP: this.#config.MSG91_TPL_PAYSLIP,
      PAYSLIP_REVISED: this.#config.MSG91_TPL_PAYSLIP_REVISED,
      FNF: this.#config.MSG91_TPL_FNF,
    };
    const res = await this.#fetch(Msg91Sms.ENDPOINT, {
      method: 'POST',
      headers: { authkey: this.#config.MSG91_AUTH_KEY, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        template_id: templateId ?? defaults[kind],
        sender: this.#config.MSG91_SENDER_ID,
        short_url: '0',
        recipients: [{ mobiles: mobile.replace(/^\+/, ''), ...vars }],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const reply = (await res.json().catch(() => null)) as { type?: string; message?: string } | null;
    if (!res.ok || reply?.type !== 'success') {
      // The provider's reason may name the template; it never contains the OTP or the number.
      this.#logger.warn({ kind, status: res.status, reason: reply?.message }, 'msg91 send failed');
      throw new SmsProviderError(`MSG91 rejected the ${kind} SMS (${res.status}): ${reply?.message ?? 'no reason given'}`);
    }
    return { providerMsgId: reply.message ?? null };
  }
}
