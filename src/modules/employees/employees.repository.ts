// Queries only, through the request's executor (its transaction on writes).
// Returns plain objects; no business rules here.
import type { Scalars } from '@prisma/orm-postgres/family-contract/types';
import type { Db, Executor, Tx } from '../../core/context.ts';
import type { Models } from '../../prisma/contract.d.ts';

type Row = Scalars<Models.app_Employee>;
type StatRow = Scalars<Models.app_EmployeeStatutory>;
type VaultRow = Scalars<Models.vault_AadhaarRecord>;
type Gender = Row['gender'];

export type Address = { line: string; stateCode: string; pin: string };

export type Employee = {
  id: string;
  code: string;
  name: string;
  dob: string;
  gender: Gender;
  mobile: string;
  email: string | null;
  altPhone: string | null;
  fatherName: string | null;
  maritalStatus: Row['maritalStatus'];
  staffType: Row['staffType'];
  designation: string;
  skillLevel: Row['skillLevel'];
  status: Row['status'];
  joinDate: string | null;
  exitDate: string | null;
  language: string;
  photoKey: string | null;
  aadhaarLast4: string | null;
  currentAddress: Address | null;
  permanentAddress: Address | null;
  createdAt: string;
};

export type Statutory = {
  pan: string | null;
  uan: string | null;
  esiIpNo: string | null;
  pfExempt: boolean;
  ptExempt: boolean;
};

export type EmployeeFields = {
  name: string;
  dob: string;
  gender: Gender;
  mobile: string;
  email: string | null;
  altPhone: string | null;
  fatherName: string | null;
  maritalStatus: Row['maritalStatus'];
  staffType: Row['staffType'];
  designation: string;
  skillLevel: Row['skillLevel'];
  joinDate: string | null;
  language: string;
  currentAddress: Address | null;
  permanentAddress: Address | null;
};

export type Person = { id: string; code: string; name: string; status: string | null };

const str = (v: { toString(): string } | null | undefined) => (v == null ? null : v.toString());
const toAddress = (line: string | null, stateCode: string | null, pin: string | null): Address | null =>
  line && stateCode && pin ? { line, stateCode, pin } : null;

function toEmployee(r: Row): Employee {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    dob: r.dob.toString(),
    gender: r.gender,
    mobile: r.mobile,
    email: r.email,
    altPhone: r.altPhone,
    fatherName: r.fatherName,
    maritalStatus: r.maritalStatus,
    staffType: r.staffType,
    designation: r.designation,
    skillLevel: r.skillLevel,
    status: r.status,
    joinDate: str(r.joinDate),
    exitDate: str(r.exitDate),
    language: r.language,
    photoKey: r.photoKey,
    aadhaarLast4: r.aadhaarLast4,
    currentAddress: toAddress(r.curAddress, r.curStateCode, r.curPin),
    permanentAddress: toAddress(r.permAddress, r.permStateCode, r.permPin),
    createdAt: r.createdAt.toString(),
  };
}

function toData(f: Partial<EmployeeFields>) {
  const d: Record<string, unknown> = {};
  const copy = ['name', 'gender', 'mobile', 'email', 'altPhone', 'fatherName', 'maritalStatus', 'staffType', 'designation', 'skillLevel', 'language'] as const;
  for (const k of copy) if (f[k] !== undefined) d[k] = f[k];
  if (f.dob !== undefined) d['dob'] = Temporal.PlainDate.from(f.dob);
  if (f.joinDate !== undefined) d['joinDate'] = f.joinDate && Temporal.PlainDate.from(f.joinDate);
  if (f.currentAddress !== undefined) {
    d['curAddress'] = f.currentAddress?.line ?? null;
    d['curStateCode'] = f.currentAddress?.stateCode ?? null;
    d['curPin'] = f.currentAddress?.pin ?? null;
  }
  if (f.permanentAddress !== undefined) {
    d['permAddress'] = f.permanentAddress?.line ?? null;
    d['permStateCode'] = f.permanentAddress?.stateCode ?? null;
    d['permPin'] = f.permanentAddress?.pin ?? null;
  }
  return d;
}

export class EmployeesRepository {
  readonly #executor: Executor;
  readonly #db: Db;

  constructor({ executor, db }: { executor: Executor; db: Db }) {
    this.#executor = executor;
    this.#db = db;
  }

  get #employees() {
    return this.#executor.orm.app.Employee;
  }

  get #statutory() {
    return this.#executor.orm.app.EmployeeStatutory;
  }

  get #vault() {
    return this.#executor.orm.vault.AadhaarRecord;
  }

  /** Next employee code (RS000123), taken atomically; a rolled-back create returns the number to the pool. */
  async nextCode(): Promise<string> {
    const plan = this.#db.raw
      .sql`UPDATE app.code_counters SET next_value = next_value + 1 WHERE name = 'EMPLOYEE' RETURNING prefix || lpad((next_value - 1)::text, width, '0') AS code`
      .returnsRow({ code: 'pg/text@1' })
      .build();
    // Only called from the create route, which always runs in a transaction.
    const rows = await (this.#executor as Tx).query(plan).toArray();
    const code = rows[0]?.code;
    if (!code) throw new Error('code_counters has no EMPLOYEE row');
    return code;
  }

  async findById(id: string): Promise<Employee | null> {
    const row = await this.#employees.where({ id: id as Row['id'] }).first();
    return row && toEmployee(row);
  }

  async create(data: EmployeeFields & { code: string; createdBy: string }): Promise<Employee> {
    const row = await this.#employees.create({
      ...toData(data),
      code: data.code,
      status: 'DRAFT',
      createdBy: data.createdBy,
      updatedBy: data.createdBy,
    } as never);
    return toEmployee(row);
  }

  async update(id: string, patch: Partial<EmployeeFields> & { updatedBy: string }): Promise<Employee> {
    const row = await this.#employees.where({ id: id as Row['id'] }).update({ ...toData(patch), updatedBy: patch.updatedBy } as never);
    if (!row) throw new Error(`employee ${id} vanished during update`);
    return toEmployee(row);
  }

  async setPhotoKey(id: string, photoKey: string, updatedBy: string): Promise<void> {
    await this.#employees.where({ id: id as Row['id'] }).update({ photoKey, updatedBy } as never);
  }

  async setAadhaarLast4(id: string, aadhaarLast4: string, updatedBy: string): Promise<void> {
    await this.#employees.where({ id: id as Row['id'] }).update({ aadhaarLast4, updatedBy } as never);
  }

  // --- statutory (PAN lives here) -------------------------------------------

  async statutory(employeeId: string): Promise<Statutory | null> {
    const r = await this.#statutory.where({ employeeId: employeeId as StatRow['employeeId'] }).first();
    return r && { pan: r.pan, uan: r.uan, esiIpNo: r.esiIpNo, pfExempt: r.pfExempt, ptExempt: r.ptExempt };
  }

  /** Sets (or clears) the PAN, creating the statutory row when the employee has none yet. */
  async setPan(employeeId: string, pan: string | null, updatedBy: string): Promise<void> {
    const existing = await this.#statutory.where({ employeeId: employeeId as StatRow['employeeId'] }).first();
    if (existing) await this.#statutory.where({ employeeId: employeeId as StatRow['employeeId'] }).update({ pan, updatedBy } as never);
    else await this.#statutory.create({ employeeId, pan, updatedBy } as never);
  }

  // --- duplicate checks -------------------------------------------------------

  async byMobile(mobile: string): Promise<Person[]> {
    const rows = await this.#employees.where({ mobile: mobile as Row['mobile'] }).all();
    return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, status: r.status }));
  }

  async byPan(pan: string): Promise<Person[]> {
    return this.#viaStatutory({ pan: pan as StatRow['pan'] });
  }

  async byUan(uan: string): Promise<Person[]> {
    return this.#viaStatutory({ uan: uan as StatRow['uan'] });
  }

  async #viaStatutory(where: Partial<StatRow>): Promise<Person[]> {
    const stats = await this.#statutory.where(where).all();
    if (stats.length === 0) return [];
    const rows = await this.#employees.where((e) => e.id.in(stats.map((s) => s.employeeId) as Row['id'][])).all();
    return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, status: r.status }));
  }

  async byNameAndDob(name: string, dob: string): Promise<Person[]> {
    const rows = await this.#employees
      .where((e) => e.name.ilike(name.replace(/[\\%_]/g, (m) => `\\${m}`)))
      .where({ dob: Temporal.PlainDate.from(dob) as Row['dob'] })
      .all();
    return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, status: r.status }));
  }

  async dailyWorkersByMobile(mobile: string): Promise<Person[]> {
    const rows = await this.#executor.orm.app.DailyWorker.where({ mobile: mobile as never }).all();
    return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, status: null }));
  }

  // --- Aadhaar vault -------------------------------------------------------------

  /** The vault row that owns this lookup hash: an employee, or a daily-wage worker. */
  async aadhaarOwner(lookupHmac: string): Promise<{ employee: Person | null; dailyWorker: Person | null; recordId: string } | null> {
    const rec = await this.#vault.where({ lookupHmac: lookupHmac as VaultRow['lookupHmac'] }).first();
    if (!rec) return null;
    const employee = rec.employeeId ? await this.#employees.where({ id: rec.employeeId as Row['id'] }).first() : null;
    const worker = rec.dailyWorkerId ? await this.#executor.orm.app.DailyWorker.where({ id: rec.dailyWorkerId as never }).first() : null;
    return {
      recordId: rec.id,
      employee: employee && { id: employee.id, code: employee.code, name: employee.name, status: employee.status },
      dailyWorker: worker && { id: worker.id, code: worker.code, name: worker.name, status: null },
    };
  }

  async aadhaarOf(employeeId: string): Promise<{ id: string; last4: string; cardImageKey: string | null } | null> {
    const rec = await this.#vault.where({ employeeId: employeeId as VaultRow['employeeId'] }).first();
    return rec && { id: rec.id, last4: rec.last4, cardImageKey: rec.cardImageKey };
  }

  async saveAadhaar(data: {
    employeeId: string;
    aadhaarEnc: Uint8Array;
    keyVersion: number;
    lookupHmac: string;
    last4: string;
    cardImageKey: string | null;
    createdBy: string;
  }): Promise<void> {
    await this.#vault.create(data as never);
  }

  async replaceAadhaar(
    recordId: string,
    data: { aadhaarEnc: Uint8Array; keyVersion: number; lookupHmac: string; last4: string; cardImageKey?: string | null },
  ): Promise<void> {
    await this.#vault.where({ id: recordId as VaultRow['id'] }).update(data as never);
  }

  // --- the profile page -----------------------------------------------------------

  /** The deployment covering `day`, with its site and client names. */
  async currentDeployment(employeeId: string, day: Temporal.PlainDate) {
    const dep = await this.#executor.orm.app.Deployment
      .where({ employeeId: employeeId as never })
      .where((d) => d.effectiveFrom.lte(day as never))
      .orderBy((d) => d.effectiveFrom.desc())
      .first();
    if (!dep || (dep.effectiveTo && Temporal.PlainDate.compare(dep.effectiveTo as never, day) < 0)) return null;
    const site = await this.#executor.orm.app.Site.where({ id: dep.siteId as never }).first();
    if (!site) return null;
    const client = await this.#executor.orm.app.Client.where({ id: site.clientId as never }).first();
    return {
      siteId: site.id,
      siteCode: site.code,
      siteName: site.name,
      clientName: client?.name ?? '',
      designation: dep.designation,
      effectiveFrom: dep.effectiveFrom.toString(),
    };
  }

  async currentBank(employeeId: string) {
    const rows = await this.#executor.orm.app.BankAccount
      .where({ employeeId: employeeId as never, isPrimary: true })
      .orderBy((b) => b.effectiveFrom.desc())
      .all();
    const b = rows.find((r) => r.effectiveTo == null);
    return b && { last4: b.accountLast4, ifsc: b.ifsc, holderName: b.holderName, verified: b.verifiedAt != null, approved: b.approvedBy != null };
  }

  async documents(employeeId: string) {
    const rows = await this.#executor.orm.app.EmployeeDocument.where({ employeeId: employeeId as never }).orderBy((d) => d.id.asc()).all();
    return rows.map((d) => ({ id: d.id, type: d.type, expiresOn: str(d.expiresOn) }));
  }

  async leaveBalances(employeeId: string) {
    const ledger = await this.#executor.orm.app.LeaveLedger.select('leaveTypeId', 'delta').where({ employeeId: employeeId as never }).all();
    if (ledger.length === 0) return [];
    const types = await this.#executor.orm.app.LeaveType.select('id', 'code').all();
    const sums = new Map<string, number>();
    for (const l of ledger) sums.set(l.leaveTypeId, (sums.get(l.leaveTypeId) ?? 0) + Number(l.delta));
    return types.filter((t) => sums.has(t.id)).map((t) => ({ leaveTypeCode: t.code, days: sums.get(t.id)!.toFixed(1) }));
  }

  /** Does the state code exist? */
  async stateExists(code: string): Promise<boolean> {
    return (await this.#executor.orm.app.State.where({ code: code as never }).first()) != null;
  }
}
