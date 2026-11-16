// Queries only, against the vault schema (the rs_vault role in production).
import type { Scalars } from '@prisma/orm-postgres/family-contract/types';
import type { Executor } from '../../core/context.ts';
import type { Models } from '../../prisma/contract.d.ts';

type VaultRow = Scalars<Models.vault_AadhaarRecord>;

export type VaultRecord = {
  ref: string;
  aadhaarEnc: Uint8Array;
  keyVersion: number;
  last4: string;
  employeeId: string | null;
  dailyWorkerId: string | null;
  createdAt: string;
};

export type Subject = { employeeId: string } | { dailyWorkerId: string };

const toRecord = (r: VaultRow): VaultRecord => ({
  ref: r.id,
  aadhaarEnc: r.aadhaarEnc as Uint8Array,
  keyVersion: r.keyVersion,
  last4: r.last4,
  employeeId: r.employeeId,
  dailyWorkerId: r.dailyWorkerId,
  createdAt: String(r.createdAt),
});

export class AadhaarRepository {
  readonly #executor: Executor;

  constructor({ executor }: { executor: Executor }) {
    this.#executor = executor;
  }

  get #vault() {
    return this.#executor.orm.vault.AadhaarRecord;
  }

  async byHash(lookupHmac: string): Promise<VaultRecord | null> {
    const r = await this.#vault.where({ lookupHmac: lookupHmac as VaultRow['lookupHmac'] }).first();
    return r && toRecord(r);
  }

  async byRef(ref: string): Promise<VaultRecord | null> {
    const r = await this.#vault.where({ id: ref as VaultRow['id'] }).first();
    return r && toRecord(r);
  }

  async insert(data: { aadhaarEnc: Uint8Array; keyVersion: number; lookupHmac: string; last4: string; createdBy: string | null } & Subject): Promise<VaultRecord> {
    return toRecord(await this.#vault.create(data as never));
  }

  /** Reveals by this user since `since` (audit rows are the record of every reveal). */
  async revealsSince(actorId: string, since: Temporal.Instant): Promise<number> {
    const r = await this.#executor.orm.audit.AuditLog
      .where({ actorId: actorId as never, action: 'aadhaar.reveal' as never })
      .where((a) => a.at.gte(since as never))
      .aggregate((a) => ({ n: a.count() }));
    return Number(r.n);
  }
}
