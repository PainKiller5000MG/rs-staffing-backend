// Queries only, through the request's executor (its transaction on writes).
import type { Scalars } from '@prisma/orm-postgres/family-contract/types';
import type { Executor } from '../../core/context.ts';
import type { Models } from '../../prisma/contract.d.ts';

type Row = Scalars<Models.app_BankAccount>;
type EmpRow = Scalars<Models.app_Employee>;

export type BankAccount = {
  id: string;
  employeeId: string;
  accountEnc: Uint8Array;
  accountLast4: string;
  accountHmac: string | null;
  accountType: Row['accountType'];
  ifsc: string;
  bankName: string | null;
  branch: string | null;
  holderName: string;
  proofKey: string | null;
  verifyStatus: Row['verifyStatus'];
  verifiedAt: string | null;
  verifyRef: string | null;
  bankReturnedName: string | null;
  nameMatchScore: number | null;
  mismatchApprovedBy: string | null;
  mismatchReason: string | null;
  sharedOverrideBy: string | null;
  sharedOverrideReason: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
  createdBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
};

export type BankEmployee = { id: string; code: string; name: string; status: EmpRow['status']; paymentMode: EmpRow['paymentMode'] };

const str = (v: { toString(): string } | null | undefined) => (v == null ? null : v.toString());

function toAccount(r: Row): BankAccount {
  return {
    id: r.id,
    employeeId: r.employeeId,
    accountEnc: r.accountEnc,
    accountLast4: r.accountLast4,
    accountHmac: r.accountHmac,
    accountType: r.accountType,
    ifsc: r.ifsc,
    bankName: r.bankName,
    branch: r.branch,
    holderName: r.holderName,
    proofKey: r.proofKey,
    verifyStatus: r.verifyStatus,
    verifiedAt: str(r.verifiedAt),
    verifyRef: r.verifyRef,
    bankReturnedName: r.bankReturnedName,
    nameMatchScore: r.nameMatchScore,
    mismatchApprovedBy: r.mismatchApprovedBy,
    mismatchReason: r.mismatchReason,
    sharedOverrideBy: r.sharedOverrideBy,
    sharedOverrideReason: r.sharedOverrideReason,
    effectiveFrom: r.effectiveFrom.toString(),
    effectiveTo: str(r.effectiveTo),
    createdAt: r.createdAt.toString(),
    createdBy: r.createdBy,
    approvedBy: r.approvedBy,
    approvedAt: str(r.approvedAt),
  };
}

export type NewAccount = {
  employeeId: string;
  accountEnc: Uint8Array;
  accountLast4: string;
  accountHmac: string;
  accountType: Row['accountType'];
  ifsc: string;
  bankName: string;
  branch: string;
  holderName: string;
  proofKey: string;
  effectiveFrom: string;
  createdBy: string;
  sharedOverrideBy: string | null;
  sharedOverrideReason: string | null;
};

export type AccountPatch = Partial<{
  verifyStatus: Row['verifyStatus'];
  verifiedAt: Temporal.Instant | null;
  verifyRef: string | null;
  bankReturnedName: string | null;
  nameMatchScore: number | null;
  mismatchApprovedBy: string;
  mismatchReason: string;
  approvedBy: string;
  approvedAt: Temporal.Instant;
  effectiveFrom: string;
  effectiveTo: string;
}>;

export class BankAccountsRepository {
  readonly #executor: Executor;

  constructor({ executor }: { executor: Executor }) {
    this.#executor = executor;
  }

  get #accounts() {
    return this.#executor.orm.app.BankAccount;
  }

  async ifsc(code: string) {
    const r = await this.#executor.orm.app.IfscCode.where({ ifsc: code as never }).first();
    return r && { ifsc: r.ifsc.trim(), bankName: r.bankName, branch: r.branch };
  }

  async employee(id: string): Promise<BankEmployee | null> {
    const r = await this.#executor.orm.app.Employee.where({ id: id as EmpRow['id'] }).first();
    return r && { id: r.id, code: r.code, name: r.name, status: r.status, paymentMode: r.paymentMode };
  }

  async employeesByIds(ids: string[]): Promise<Map<string, BankEmployee>> {
    const out = new Map<string, BankEmployee>();
    for (const id of new Set(ids)) {
      const e = await this.employee(id);
      if (e) out.set(id, e);
    }
    return out;
  }

  async get(id: string): Promise<BankAccount | null> {
    const r = await this.#accounts.where({ id: id as Row['id'] }).first();
    return r && toAccount(r);
  }

  async listFor(employeeId: string): Promise<BankAccount[]> {
    const rows = await this.#accounts.where({ employeeId: employeeId as Row['employeeId'] }).orderBy((b) => b.createdAt.desc()).all();
    return rows.map(toAccount);
  }

  async create(data: NewAccount): Promise<BankAccount> {
    const row = await this.#accounts.create({
      ...data,
      effectiveFrom: Temporal.PlainDate.from(data.effectiveFrom),
      isPrimary: true,
    } as never);
    return toAccount(row);
  }

  async patch(id: string, p: AccountPatch): Promise<BankAccount> {
    const data: Record<string, unknown> = { ...p };
    if (p.effectiveFrom) data['effectiveFrom'] = Temporal.PlainDate.from(p.effectiveFrom);
    if (p.effectiveTo) data['effectiveTo'] = Temporal.PlainDate.from(p.effectiveTo);
    const row = await this.#accounts.where({ id: id as Row['id'] }).update(data as never);
    if (!row) throw new Error(`bank account ${id} vanished during update`);
    return toAccount(row);
  }

  /** Accounts approved for use whose dates cover `date`. */
  async approvedOn(employeeId: string, date: string): Promise<BankAccount[]> {
    const rows = await this.#accounts.where({ employeeId: employeeId as Row['employeeId'], isPrimary: true }).all();
    return rows
      .map(toAccount)
      .filter((a) => a.approvedBy != null && a.effectiveFrom <= date && (a.effectiveTo == null || a.effectiveTo >= date));
  }

  /** Other employees (not exited) whose approved, still-open account has this number (M3-BNK-06). */
  async sharedOwners(hmac: string, exceptEmployeeId: string, today: string): Promise<{ employeeId: string; code: string; name: string }[]> {
    const rows = await this.#accounts.where({ accountHmac: hmac as never }).all();
    const owners = new Map<string, { employeeId: string; code: string; name: string }>();
    for (const a of rows.map(toAccount)) {
      if (a.employeeId === exceptEmployeeId || a.approvedBy == null) continue;
      if (a.effectiveTo != null && a.effectiveTo < today) continue;
      const e = await this.employee(a.employeeId);
      if (e && e.status !== 'EXITED') owners.set(e.id, { employeeId: e.id, code: e.code, name: e.name });
    }
    return [...owners.values()];
  }

  /** End date of a locked or published payroll run that covers `date`, or null. */
  async lockedRunEnd(date: string): Promise<string | null> {
    const runs = await this.#executor.orm.app.PayrollRun.where((r) => r.status.in(['LOCKED', 'PUBLISHED'] as never)).all();
    const d = Temporal.PlainDate.from(date);
    let end: Temporal.PlainDate | null = null;
    for (const r of runs) {
      const from = Temporal.PlainDate.from(r.periodFrom.toString());
      const to = Temporal.PlainDate.from(r.periodTo.toString());
      if (Temporal.PlainDate.compare(from, d) <= 0 && Temporal.PlainDate.compare(to, d) >= 0 && (!end || Temporal.PlainDate.compare(to, end) > 0)) end = to;
    }
    return end?.toString() ?? null;
  }
}
