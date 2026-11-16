// Bank account rules (M3-BNK-01..04, 06). Throws AppErrors; never touches HTTP.
// Flow: HR enters (pending) → penny-drop verify → Admin approves (a different person) → active.
// A second account for an employee is a change: it closes the old one on approval.
import sharp from 'sharp';
import { audit } from '../../core/audit.ts';
import type { Ctx } from '../../core/context.ts';
import type { EventBuffer } from '../../core/events.ts';
import { makerChecker, NotFoundError } from '../../core/errors.ts';
import type { BankVerifier } from '../../lib/bank-verifier.ts';
import { decrypt, encrypt, last4, lookupHmac } from '../../lib/crypto.ts';
import { today } from '../../lib/dates.ts';
import { maskBankAccount } from '../../lib/mask.ts';
import { NAME_MATCH_THRESHOLD, nameMatchScore } from '../../lib/name-match.ts';
import type { FileStorage } from '../../lib/storage.ts';
import * as errors from './bank-accounts.errors.ts';
import type { BankAccount, BankAccountsRepository } from './bank-accounts.repository.ts';
import type { CreateBankAccountBody, ReasonBody } from './bank-accounts.schemas.ts';

type Deps = {
  bankAccountsRepository: BankAccountsRepository;
  bankVerifier: BankVerifier;
  storage: FileStorage;
  ctx: Ctx;
  events: EventBuffer;
};

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export type BankStatus = 'PENDING_VERIFICATION' | 'NAME_MISMATCH' | 'FAILED' | 'AWAITING_APPROVAL' | 'SCHEDULED' | 'ACTIVE' | 'INACTIVE';

/** True when the account may carry salary once approved: verified, or a name mismatch an Admin accepted. */
export const isUsable = (a: Pick<BankAccount, 'verifyStatus' | 'mismatchApprovedBy'>) =>
  a.verifyStatus === 'VERIFIED' || (a.verifyStatus === 'NAME_MISMATCH' && a.mismatchApprovedBy != null);

export function statusOf(a: BankAccount, onDate: string): BankStatus {
  if (a.approvedBy) {
    if (a.effectiveTo != null && a.effectiveTo < onDate) return 'INACTIVE';
    if (a.effectiveFrom > onDate) return 'SCHEDULED';
    return 'ACTIVE';
  }
  if (a.verifyStatus === 'FAILED') return 'FAILED';
  if (a.verifyStatus === 'PENDING') return 'PENDING_VERIFICATION';
  return isUsable(a) ? 'AWAITING_APPROVAL' : 'NAME_MISMATCH';
}

export function viewOf(a: BankAccount, onDate: string) {
  return {
    id: a.id,
    employeeId: a.employeeId,
    status: statusOf(a, onDate),
    holderName: a.holderName,
    accountMasked: maskBankAccount(a.accountLast4),
    ifsc: a.ifsc,
    bankName: a.bankName,
    branch: a.branch,
    accountType: a.accountType,
    hasProof: a.proofKey != null,
    verifyStatus: a.verifyStatus,
    bankReturnedName: a.bankReturnedName,
    nameMatchScore: a.nameMatchScore,
    mismatchReason: a.mismatchReason,
    sharedOverrideReason: a.sharedOverrideReason,
    effectiveFrom: a.approvedBy ? a.effectiveFrom : null,
    effectiveTo: a.effectiveTo,
    createdAt: a.createdAt,
  };
}

/** What audit rows hold: never the number (accountEnc is dropped by audit(); only the masked last 4 stays). */
function auditShape(a: BankAccount) {
  const { accountEnc: _enc, accountHmac: _hmac, proofKey, ...rest } = a;
  return { ...rest, accountNumber: `XXXXXX${a.accountLast4}`, hasProof: proofKey != null };
}

export class BankAccountsService {
  readonly #repo: BankAccountsRepository;
  readonly #verifier: BankVerifier;
  readonly #storage: FileStorage;
  readonly #ctx: Ctx;
  readonly #events: EventBuffer;

  constructor({ bankAccountsRepository, bankVerifier, storage, ctx, events }: Deps) {
    this.#repo = bankAccountsRepository;
    this.#verifier = bankVerifier;
    this.#storage = storage;
    this.#ctx = ctx;
    this.#events = events;
  }

  // --- M3-BNK-01 ---------------------------------------------------------------

  async lookupIfsc(ifsc: string) {
    const r = await this.#repo.ifsc(ifsc);
    if (!r) throw errors.unknownIfsc();
    return r;
  }

  async create(employeeId: string, body: CreateBankAccountBody) {
    const employee = await this.#repo.employee(employeeId);
    if (!employee) throw new NotFoundError('Employee');
    if (employee.status === 'EXITED') throw errors.employeeExited();

    const ifsc = await this.#repo.ifsc(body.ifsc);
    if (!ifsc) throw errors.unknownIfsc();

    const now = today().toString();
    const existing = await this.#repo.listFor(employeeId);
    if (existing.some((a) => a.approvedBy == null && a.verifyStatus !== 'FAILED')) throw errors.changePending();

    const hmac = lookupHmac(body.accountNumber);
    const current = (await this.#repo.approvedOn(employeeId, now)).find((a) => a.accountHmac === hmac);
    if (current && current.ifsc === ifsc.ifsc) throw errors.sameAccount();

    const override = await this.#sharedCheck(hmac, employeeId, now, body.sharedOverrideReason);
    const proofKey = await this.#storeProof(body.proofImageBase64);

    let created: BankAccount;
    try {
      created = await this.#repo.create({
        employeeId,
        accountEnc: encrypt(body.accountNumber),
        accountLast4: last4(body.accountNumber),
        accountHmac: hmac,
        accountType: body.accountType,
        ifsc: ifsc.ifsc,
        bankName: ifsc.bankName,
        branch: ifsc.branch,
        holderName: body.holderName,
        proofKey,
        effectiveFrom: now,
        createdBy: this.#ctx.user.id,
        sharedOverrideBy: override ? this.#ctx.user.id : null,
        sharedOverrideReason: override ?? null,
      });
    } catch (err) {
      await this.#storage.delete(proofKey).catch(() => {});
      throw err;
    }
    await audit(this.#ctx, 'bank_account.create', 'bank_account', null, auditShape(created), { entityId: created.id });
    return viewOf(created, now);
  }

  /** M3-BNK-06: another active employee already uses this number; only an Admin with a reason overrides. */
  async #sharedCheck(hmac: string, employeeId: string, now: string, overrideReason: string | undefined): Promise<string | null> {
    const owners = await this.#repo.sharedOwners(hmac, employeeId, now);
    if (owners.length === 0) return null;
    if (!overrideReason) throw errors.sharedAccount(owners);
    if (this.#ctx.user.role !== 'ADMIN') throw errors.overrideNeedsAdmin();
    return overrideReason;
  }

  async #storeProof(base64: string): Promise<string> {
    const raw = Buffer.from(base64, 'base64');
    if (raw.byteLength > MAX_IMAGE_BYTES) throw errors.proofTooLarge();
    const format = await sharp(raw).metadata().then((m) => m.format).catch(() => undefined);
    if (format !== 'jpeg' && format !== 'png') throw errors.invalidProof();
    return (await this.#storage.put('bank-proof', raw, format === 'png' ? 'png' : 'jpg')).key;
  }

  async list(employeeId: string) {
    const user = this.#ctx.user;
    if (user.role === 'EMPLOYEE' && user.employeeId !== employeeId) throw new NotFoundError('Employee');
    if (!(await this.#repo.employee(employeeId))) throw new NotFoundError('Employee');
    const now = today().toString();
    return { items: (await this.#repo.listFor(employeeId)).map((a) => viewOf(a, now)) };
  }

  // --- M3-BNK-02 ---------------------------------------------------------------

  async verify(id: string) {
    const before = await this.#mustFind(id);
    if (before.approvedBy || before.mismatchApprovedBy) throw errors.notVerifiable();
    const employee = (await this.#repo.employee(before.employeeId))!;

    const result = await this.#verifier.verify({ accountNumber: decrypt(before.accountEnc), ifsc: before.ifsc, holderName: before.holderName });
    let patch: Parameters<BankAccountsRepository['patch']>[1];
    if (!result.ok) {
      patch = { verifyStatus: 'FAILED', verifiedAt: null, verifyRef: result.ref, bankReturnedName: null, nameMatchScore: null };
    } else {
      const score = nameMatchScore(result.returnedName, employee.name);
      const ok = score >= NAME_MATCH_THRESHOLD;
      patch = {
        verifyStatus: ok ? 'VERIFIED' : 'NAME_MISMATCH',
        verifiedAt: ok ? Temporal.Now.instant() : null,
        verifyRef: result.ref,
        bankReturnedName: result.returnedName,
        nameMatchScore: score,
      };
    }
    const after = await this.#repo.patch(id, patch);
    await audit(this.#ctx, 'bank_account.verify', 'bank_account', auditShape(before), auditShape(after), { entityId: id });
    return viewOf(after, today().toString());
  }

  /** An Admin accepts a name mismatch (joint account, spelling) with a reason. */
  async approveMismatch(id: string, body: ReasonBody) {
    const before = await this.#mustFind(id);
    if (before.approvedBy) throw errors.alreadyApproved();
    if (before.verifyStatus !== 'NAME_MISMATCH' || before.mismatchApprovedBy) throw errors.notMismatch();
    if (before.createdBy === this.#ctx.user.id) throw makerChecker();

    const after = await this.#repo.patch(id, { mismatchApprovedBy: this.#ctx.user.id, mismatchReason: body.reason });
    await audit(this.#ctx, 'bank_account.mismatch_approve', 'bank_account', auditShape(before), auditShape(after), { entityId: id, reason: body.reason });
    return viewOf(after, today().toString());
  }

  // --- M3-BNK-03 ---------------------------------------------------------------

  /** The checker approves: the account becomes the one in use and the previous one is closed. */
  async approve(id: string) {
    const before = await this.#mustFind(id);
    if (before.approvedBy) throw errors.alreadyApproved();
    if (before.createdBy === this.#ctx.user.id) throw makerChecker();
    if (!isUsable(before)) throw errors.notVerified();
    const employee = (await this.#repo.employee(before.employeeId))!;
    if (employee.status === 'EXITED') throw errors.employeeExited();

    const now = today();
    // Someone else may have taken the number since it was entered; an Admin's recorded override still stands.
    if (!before.sharedOverrideBy && before.accountHmac) {
      const owners = await this.#repo.sharedOwners(before.accountHmac, before.employeeId, now.toString());
      if (owners.length > 0) throw errors.sharedAccount(owners);
    }

    const previous = (await this.#repo.approvedOn(before.employeeId, now.toString())).find((a) => a.effectiveTo == null);
    // M3-BNK-03 AC5: a change approved after payroll lock applies from the next run only.
    let from = now;
    if (previous) {
      const lockedEnd = await this.#repo.lockedRunEnd(now.toString());
      if (lockedEnd) from = Temporal.PlainDate.from(lockedEnd).add({ days: 1 });
      const earliest = Temporal.PlainDate.from(previous.effectiveFrom).add({ days: 1 });
      if (Temporal.PlainDate.compare(from, earliest) < 0) from = earliest;
    }

    if (previous) await this.#repo.patch(previous.id, { effectiveTo: from.subtract({ days: 1 }).toString() });
    const after = await this.#repo.patch(id, { approvedBy: this.#ctx.user.id, approvedAt: Temporal.Now.instant(), effectiveFrom: from.toString() });

    await audit(this.#ctx, 'bank_account.approve', 'bank_account', auditShape(before), auditShape(after), { entityId: id });
    // M3-BNK-03 AC4: the employee is told (SMS/notification stub: a listener sends it once one exists).
    if (previous) this.#events.emit('employee.bank_changed', { employeeId: before.employeeId, bankAccountId: id, effectiveFrom: from.toString() });
    return viewOf(after, now.toString());
  }

  // --- M3-BNK-04 ---------------------------------------------------------------

  /** For the payroll engine: exactly one approved, usable account on `date`, or an error. */
  async accountOn(employeeId: string, date: string) {
    const usable = (await this.#repo.approvedOn(employeeId, date)).filter(isUsable);
    if (usable.length === 0) throw errors.noActiveAccount(employeeId, date);
    if (usable.length > 1) throw errors.manyActiveAccounts(employeeId, date);
    const a = usable[0]!;
    return { id: a.id, accountNumber: decrypt(a.accountEnc), ifsc: a.ifsc, holderName: a.holderName, bankName: a.bankName };
  }

  /** M3-BNK-01 AC4: called by the status story before an employee becomes Active. */
  async requireForActivation(employeeId: string): Promise<void> {
    const employee = await this.#repo.employee(employeeId);
    if (!employee) throw new NotFoundError('Employee');
    if (employee.paymentMode !== 'BANK') return;
    const now = today().toString();
    const usable = (await this.#repo.listFor(employeeId)).filter((a) => a.approvedBy != null && isUsable(a) && (a.effectiveTo == null || a.effectiveTo >= now));
    if (usable.length === 0) throw errors.bankAccountRequired();
  }

  async #mustFind(id: string): Promise<BankAccount> {
    const a = await this.#repo.get(id);
    if (!a) throw new NotFoundError('Bank account');
    return a;
  }
}
