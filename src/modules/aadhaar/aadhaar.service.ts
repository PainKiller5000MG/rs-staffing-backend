// The only code that sees a plain Aadhaar number. It exists in memory for the
// length of a call: never logged, never in an error message, never in audit.
import { audit } from '../../core/audit.ts';
import type { Ctx } from '../../core/context.ts';
import { decrypt, encrypt, KEY_VERSION, last4, lookupHmac } from '../../lib/crypto.ts';
import { isAadhaar } from '../../lib/verhoeff.ts';
import * as errors from './aadhaar.errors.ts';
import type { AadhaarRepository, Subject } from './aadhaar.repository.ts';
import type { RevealBody } from './aadhaar.schemas.ts';

export const REVEAL_DISPLAY_SECONDS = 60;
/** M12-AAD-03 AC3: more than this many reveals by one user in a day raises an alert. */
export const REVEAL_ALERT_THRESHOLD = 20;

/** Spaces and dashes are typed by people; hash and validate the 12 digits. */
export const normalise = (n: string) => n.replace(/[\s-]/g, '');

export class AadhaarService {
  readonly #repo: AadhaarRepository;
  readonly #ctx: Ctx;

  constructor({ aadhaarRepository, ctx }: { aadhaarRepository: AadhaarRepository; ctx: Ctx }) {
    this.#repo = aadhaarRepository;
    this.#ctx = ctx;
  }

  /** M12-AAD-02 AC1: validate, dedupe by keyed hash, return the existing ref or a new one. */
  async store(number: string, subject: Subject, createdBy: string | null = null): Promise<{ ref: string; last4: string; created: boolean }> {
    const digits = normalise(number);
    if (!isAadhaar(digits)) throw errors.invalidAadhaar();
    const existing = await this.#repo.byHash(lookupHmac(digits));
    if (existing) return { ref: existing.ref, last4: existing.last4, created: false };
    const row = await this.#repo.insert({
      aadhaarEnc: encrypt(digits),
      keyVersion: KEY_VERSION,
      lookupHmac: lookupHmac(digits),
      last4: last4(digits),
      createdBy,
      ...subject,
    });
    return { ref: row.ref, last4: row.last4, created: true };
  }

  /** M12-AAD-02 AC2: the ref for a number, or null. Never decrypts. */
  async findByNumber(number: string): Promise<string | null> {
    const digits = normalise(number);
    if (!isAadhaar(digits)) return null;
    return (await this.#repo.byHash(lookupHmac(digits)))?.ref ?? null;
  }

  /** M12-AAD-03: the full number, once, with a reason; the audit row never holds it. */
  async reveal(ref: string, body: RevealBody) {
    if (body.reason === 'OTHER' && !body.reasonText) throw errors.reasonTextRequired();
    const rec = await this.#repo.byRef(ref);
    if (!rec) throw errors.aadhaarNotFound();
    const number = decrypt(rec.aadhaarEnc, rec.keyVersion);
    const reason = body.reason === 'OTHER' ? `OTHER: ${body.reasonText}` : body.reason;
    const person = rec.employeeId ? { employeeId: rec.employeeId } : { dailyWorkerId: rec.dailyWorkerId };
    await audit(this.#ctx, 'aadhaar.reveal', 'aadhaar', null, { ref, last4: rec.last4, ...person }, { entityId: ref, reason });

    // M12-AAD-03 AC3: the alert is an audit row security can watch (M1-AUD-07 dashboards read it).
    const since = Temporal.Now.instant().subtract({ hours: 24 });
    const today = await this.#repo.revealsSince(this.#ctx.user.id, since);
    if (today > REVEAL_ALERT_THRESHOLD) {
      await audit(this.#ctx, 'aadhaar.reveal_alert', 'aadhaar', null, { revealsInLast24h: today }, { entityId: ref, reason: 'More than 20 reveals by one user in a day' });
    }
    return { number, last4: rec.last4, displaySeconds: REVEAL_DISPLAY_SECONDS };
  }
}
