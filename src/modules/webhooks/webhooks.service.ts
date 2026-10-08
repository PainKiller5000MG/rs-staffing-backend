// M16-SMS-02: MSG91 delivery reports. The caller is verified by a shared
// secret header (MSG91 sends custom headers set on the webhook) and, if
// configured, an IP allow-list. Idempotent: a status only moves forward, so a
// replayed or late report changes nothing (and writes no audit row).
import { timingSafeEqual } from 'node:crypto';
import { audit } from '../../core/audit.ts';
import type { Config } from '../../core/config.ts';
import type { Ctx } from '../../core/context.ts';
import { UnauthorizedError } from '../../core/errors.ts';
import type { Logger } from '../../core/logger.ts';
import type { DeliveryStatus, WebhooksRepository } from './webhooks.repository.ts';
import type { Msg91DlrBody } from './webhooks.schemas.ts';

export const SECRET_HEADER = 'x-rs-webhook-secret';

/** MSG91 SMS status codes → delivery status. */
const STATUS: Record<string, { status: DeliveryStatus; reason?: string }> = {
  '0': { status: 'SUBMITTED' },
  '1': { status: 'DELIVERED' },
  '2': { status: 'FAILED', reason: 'Failed' },
  '9': { status: 'FAILED', reason: 'NDNC' },
  '16': { status: 'FAILED', reason: 'Rejected' },
  '25': { status: 'FAILED', reason: 'Rejected' },
  '17': { status: 'FAILED', reason: 'Blocked number' },
  '20': { status: 'FAILED', reason: 'Country code blocked' },
};

/** Forward-only: a report never moves a delivery back (e.g. FAILED after DELIVERED). */
const RANK: Record<DeliveryStatus, number> = { QUEUED: 0, NO_MOBILE: 0, SUBMITTED: 1, FAILED: 2, DELIVERED: 3, OPENED: 4 };

const sameSecret = (given: string | undefined, expected: string) => {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

/** MSG91 sends 91XXXXXXXXXX; deliveries store +91XXXXXXXXXX. */
const e164 = (telNum: string) => `+91${telNum.replace(/\D/g, '').slice(-10)}`;

export class WebhooksService {
  readonly #repo: WebhooksRepository;
  readonly #ctx: Ctx;
  readonly #config: Config;
  readonly #logger: Logger;

  constructor({ webhooksRepository, ctx, config, logger }: { webhooksRepository: WebhooksRepository; ctx: Ctx; config: Config; logger: Logger }) {
    this.#repo = webhooksRepository;
    this.#ctx = ctx;
    this.#config = config;
    this.#logger = logger;
  }

  async msg91Dlr(body: Msg91DlrBody) {
    this.#verifyCaller();
    const events = Array.isArray(body) ? body : [body];
    let updated = 0;
    let unmatched = 0;

    for (const event of events) {
      const mapped = STATUS[event.status];
      if (!mapped) {
        this.#logger.warn({ status: event.status }, 'msg91 dlr: unknown status code, ignored');
        continue;
      }
      const delivery = await this.#repo.findDelivery(event.requestId, e164(event.telNum));
      if (!delivery) {
        unmatched++;
        continue;
      }
      if (RANK[mapped.status] <= RANK[delivery.status]) continue; // replay or stale report
      const reason = mapped.status === 'FAILED' ? (event.failureReason ?? mapped.reason ?? null)?.slice(0, 80) ?? null : null;
      await this.#repo.setStatus(delivery.id, mapped.status, reason);
      await audit(this.#ctx, 'delivery.status', 'delivery', delivery, { id: delivery.id, status: mapped.status, reason }, { actorId: null });
      updated++;
    }
    return { received: events.length, updated, unmatched };
  }

  #verifyCaller(): void {
    const secret = this.#config.MSG91_WEBHOOK_SECRET;
    if (!secret || !sameSecret(this.#ctx.header(SECRET_HEADER), secret)) throw new UnauthorizedError('Unknown webhook caller');
    const allow = this.#config.MSG91_WEBHOOK_IPS;
    if (allow.length && !(this.#ctx.ip && allow.includes(this.#ctx.ip))) throw new UnauthorizedError('Unknown webhook caller');
  }
}
