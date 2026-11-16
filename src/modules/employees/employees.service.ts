// Employee profile rules (M3-PRF-01..08). Throws AppErrors; never touches HTTP
// or the ORM directly. Every write calls audit().
import sharp from 'sharp';
import { audit } from '../../core/audit.ts';
import type { Ctx } from '../../core/context.ts';
import type { EventBuffer } from '../../core/events.ts';
import { AppError, NotFoundError } from '../../core/errors.ts';
import type { Identity } from '../../auth/identity.ts';
import { encrypt, KEY_VERSION, last4, lookupHmac } from '../../lib/crypto.ts';
import { parseDate, today } from '../../lib/dates.ts';
import { maskAadhaar, maskBankAccount, maskDob, maskPan } from '../../lib/mask.ts';
import type { FileStorage } from '../../lib/storage.ts';
import type { UsersRepository } from '../users/users.repository.ts';
import * as errors from './employees.errors.ts';
import type { DuplicateMatch } from './employees.errors.ts';
import type { Employee, EmployeeFields, EmployeesRepository, Person } from './employees.repository.ts';
import type { AadhaarBody, CreateEmployeeBody, DuplicateCheckBody, UpdateEmployeeBody } from './employees.schemas.ts';

type Deps = {
  employeesRepository: EmployeesRepository;
  usersRepository: UsersRepository;
  identity: Identity;
  storage: FileStorage;
  ctx: Ctx;
  events: EventBuffer;
};

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const PHOTO_PX = 600;

/** Whole years between two dates. */
function yearsBetween(from: Temporal.PlainDate, to: Temporal.PlainDate): number {
  return to.since(from, { largestUnit: 'years' }).years;
}

/** The profile as the API shows it: DOB, PAN and Aadhaar masked for every role. */
export function profileOf(e: Employee, pan: string | null) {
  return {
    id: e.id,
    code: e.code,
    status: e.status,
    name: e.name,
    dob: maskDob(e.dob),
    age: yearsBetween(parseDate(e.dob), today()),
    gender: e.gender,
    mobile: e.mobile,
    altPhone: e.altPhone,
    email: e.email,
    fatherName: e.fatherName,
    maritalStatus: e.maritalStatus,
    staffType: e.staffType,
    designation: e.designation || null,
    skillLevel: e.skillLevel,
    joinDate: e.joinDate,
    exitDate: e.exitDate,
    language: e.language,
    hasPhoto: e.photoKey != null,
    currentAddress: e.currentAddress,
    permanentAddress: e.permanentAddress,
    pan: pan ? maskPan(pan) : null,
    aadhaar: e.aadhaarLast4 ? maskAadhaar(e.aadhaarLast4) : null,
    createdAt: e.createdAt,
  };
}

/** What goes into audit rows: audit() masks dob and pan by key; the Aadhaar number is never here. */
function auditShape(e: Employee, pan: string | null) {
  const { photoKey: _photoKey, ...rest } = e;
  return { ...rest, hasPhoto: e.photoKey != null, pan };
}

export class EmployeesService {
  readonly #repo: EmployeesRepository;
  readonly #users: UsersRepository;
  readonly #identity: Identity;
  readonly #storage: FileStorage;
  readonly #ctx: Ctx;
  readonly #events: EventBuffer;

  constructor({ employeesRepository, usersRepository, identity, storage, ctx, events }: Deps) {
    this.#repo = employeesRepository;
    this.#users = usersRepository;
    this.#identity = identity;
    this.#storage = storage;
    this.#ctx = ctx;
    this.#events = events;
  }

  // --- M3-PRF-01, 02, 04, 06 ---------------------------------------------------

  async create(body: CreateEmployeeBody) {
    const joinDate = parseDate(body.joinDate);
    this.#checkAge(body.dob, body.joinDate);
    await this.#checkStates([body.currentAddress, body.permanentAddress]);

    const matches = await this.#findDuplicates({ name: body.name, dob: body.dob, mobile: body.mobile, pan: body.pan });
    const blocking = matches.filter((m) => m.blocking);
    if (blocking.length > 0) throw errors.duplicatePerson(blocking);
    // The login identity is unique across every role (M1-OTP-04): an HQ user or supervisor may hold the number.
    if (await this.#users.findByMobile(body.mobile)) throw errors.mobileInUse();

    const fields: EmployeeFields = {
      name: body.name,
      dob: body.dob,
      gender: body.gender,
      mobile: body.mobile,
      email: body.email ?? null,
      altPhone: body.altPhone ?? null,
      fatherName: body.fatherName ?? null,
      maritalStatus: body.maritalStatus ?? null,
      staffType: body.staffType ?? 'DEPLOYED',
      designation: body.designation ?? '',
      skillLevel: body.skillLevel ?? 'UNSKILLED',
      joinDate: joinDate.toString(),
      language: body.language ?? 'en',
      currentAddress: body.currentAddress ?? null,
      permanentAddress: body.permanentAddress ?? null,
    };

    const code = await this.#repo.nextCode();
    const employee = await this.#repo.create({ ...fields, code, createdBy: this.#ctx.user.id });
    await this.#repo.setPan(employee.id, body.pan ?? null, this.#ctx.user.id);

    // M3-PRF-01 AC4 / M1-USR-03: the mobile number is the OTP login.
    const { authUserId, created } = await this.#identity.ensure(body.name, body.mobile);
    try {
      await this.#users.create({
        name: body.name,
        mobile: body.mobile,
        email: body.email ?? null,
        role: 'EMPLOYEE',
        employeeId: employee.id,
        expiresAt: null,
        authUserId,
        createdBy: this.#ctx.user.id,
      });
    } catch (err) {
      if (created) await this.#identity.remove(authUserId).catch(() => {});
      throw err;
    }

    await audit(this.#ctx, 'employee.create', 'employee', null, auditShape(employee, body.pan ?? null), { entityId: employee.id });
    this.#events.emit('employee.created', { employeeId: employee.id, code });
    return { ...profileOf(employee, body.pan ?? null), warnings: matches.filter((m) => !m.blocking) };
  }

  /** M3-PRF-06: hard matches (Aadhaar, PAN, UAN, mobile) and soft ones (name + DOB), with what HR may do instead. */
  async checkDuplicates(body: DuplicateCheckBody) {
    const aadhaarNumber = body.aadhaarNumber;
    return { matches: await this.#findDuplicates({ ...body, aadhaarNumber }) };
  }

  async #findDuplicates(q: { name?: string; dob?: string; mobile?: string; pan?: string; uan?: string; aadhaarNumber?: string }): Promise<DuplicateMatch[]> {
    const out: DuplicateMatch[] = [];
    const seen = new Set<string>();
    const add = (field: DuplicateMatch['field'], kind: DuplicateMatch['kind'], p: Person, blocking: boolean) => {
      const key = `${field}:${kind}:${p.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      const exited = kind === 'EMPLOYEE' && p.status === 'EXITED';
      out.push({
        field,
        kind,
        id: p.id,
        code: p.code,
        name: p.name,
        status: p.status,
        offer: exited ? 'REHIRE' : kind === 'DAILY_WORKER' ? 'CONVERT_DAILY_WORKER' : null,
        link: kind === 'EMPLOYEE' ? `/employees/${p.id}` : `/daily-workers/${p.id}`,
        blocking,
      });
    };

    if (q.aadhaarNumber) {
      const owner = await this.#repo.aadhaarOwner(lookupHmac(q.aadhaarNumber));
      if (owner?.employee) add('aadhaar', 'EMPLOYEE', owner.employee, true);
      if (owner?.dailyWorker) add('aadhaar', 'DAILY_WORKER', owner.dailyWorker, true);
    }
    if (q.pan) for (const p of await this.#repo.byPan(q.pan)) add('pan', 'EMPLOYEE', p, true);
    if (q.uan) for (const p of await this.#repo.byUan(q.uan)) add('uan', 'EMPLOYEE', p, true);
    if (q.mobile) {
      // An exited employee has released the number (M1-OTP-04 AC2): a warning with a rehire offer, not a block.
      for (const p of await this.#repo.byMobile(q.mobile)) add('mobile', 'EMPLOYEE', p, p.status !== 'EXITED');
      for (const p of await this.#repo.dailyWorkersByMobile(q.mobile)) add('mobile', 'DAILY_WORKER', p, true);
    }
    if (q.name && q.dob) {
      for (const p of await this.#repo.byNameAndDob(q.name, q.dob)) {
        if (!out.some((m) => m.kind === 'EMPLOYEE' && m.id === p.id)) add('name_dob', 'EMPLOYEE', p, false);
      }
    }
    return out;
  }

  // --- M3-PRF-07 ------------------------------------------------------------------

  async get(id: string) {
    const e = await this.#mustFind(id);
    const user = this.#ctx.user;

    if (user.role === 'EMPLOYEE' && user.employeeId !== id) throw new NotFoundError('Employee');
    if (user.role === 'SUPERVISOR') {
      // A supervisor sees only workers deployed (today) to their approved sites, and only the reduced view.
      const dep = await this.#repo.currentDeployment(id, today());
      if (!dep || !user.siteIds.includes(dep.siteId)) throw new NotFoundError('Employee');
      return {
        id: e.id,
        code: e.code,
        name: e.name,
        designation: e.designation || null,
        mobile: e.mobile,
        hasPhoto: e.photoKey != null,
        site: { id: dep.siteId, code: dep.siteCode, name: dep.siteName },
      };
    }

    const [stat, deployment, bank, documents, leaveBalances] = await Promise.all([
      this.#repo.statutory(id),
      this.#repo.currentDeployment(id, today()),
      this.#repo.currentBank(id),
      this.#repo.documents(id),
      this.#repo.leaveBalances(id),
    ]);
    return {
      profile: profileOf(e, stat?.pan ?? null),
      currentDeployment: deployment,
      bank: bank && { accountMasked: maskBankAccount(bank.last4), ifsc: bank.ifsc, holderName: bank.holderName, verified: bank.verified, approved: bank.approved },
      statutory: stat && { uan: stat.uan, esiIpNo: stat.esiIpNo, pfExempt: stat.pfExempt, ptExempt: stat.ptExempt },
      documents,
      leaveBalances,
    };
  }

  // --- M3-PRF-08 ------------------------------------------------------------------

  async update(id: string, body: UpdateEmployeeBody) {
    const before = await this.#mustFind(id);
    const beforeStat = await this.#repo.statutory(id);

    this.#checkAge(body.dob ?? before.dob, body.joinDate ?? before.joinDate);
    await this.#checkStates([body.currentAddress, body.permanentAddress]);

    if (body.pan) {
      const clash = (await this.#repo.byPan(body.pan)).filter((p) => p.id !== id);
      if (clash.length > 0) throw errors.duplicatePerson(this.#asMatches('pan', clash));
    }

    const { pan, ...rest } = body;
    const fields: Partial<EmployeeFields> = { ...rest };
    const after = Object.keys(fields).length > 0 ? await this.#repo.update(id, { ...fields, updatedBy: this.#ctx.user.id }) : before;
    if (pan !== undefined) await this.#repo.setPan(id, pan, this.#ctx.user.id);
    const afterPan = pan !== undefined ? pan : (beforeStat?.pan ?? null);

    await audit(this.#ctx, 'employee.update', 'employee', auditShape(before, beforeStat?.pan ?? null), auditShape(after, afterPan), { entityId: id });
    this.#events.emit('employee.updated', { employeeId: id });
    return profileOf(after, afterPan);
  }

  // --- M3-PRF-03 ------------------------------------------------------------------

  async setPhoto(id: string, imageBase64: string) {
    const before = await this.#mustFind(id);
    const raw = this.#decodeImage(imageBase64);
    let jpeg: Buffer;
    try {
      const meta = await sharp(raw).metadata();
      if (meta.format !== 'jpeg' && meta.format !== 'png') throw errors.invalidImage();
      // Orientation is applied, then metadata (EXIF, location) is dropped by the re-encode.
      jpeg = await sharp(raw).rotate().resize({ width: PHOTO_PX, height: PHOTO_PX, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw errors.invalidImage();
    }

    const stored = await this.#storage.put('photos', jpeg, 'jpg');
    try {
      await this.#repo.setPhotoKey(id, stored.key, this.#ctx.user.id);
      await audit(this.#ctx, 'employee.photo', 'employee', { hasPhoto: before.photoKey != null }, { hasPhoto: true }, { entityId: id });
    } catch (err) {
      await this.#storage.delete(stored.key).catch(() => {});
      throw err;
    }
    if (before.photoKey) await this.#storage.delete(before.photoKey).catch(() => {});
    return { hasPhoto: true as const };
  }

  // --- M3-PRF-05 ------------------------------------------------------------------

  async setAadhaar(id: string, body: AadhaarBody) {
    const employee = await this.#mustFind(id);
    const existing = await this.#repo.aadhaarOf(id);

    if (existing) {
      // M3-PRF-08 AC1: a saved Aadhaar is fixed; only an Admin may correct it, with a reason.
      if (this.#ctx.user.role !== 'ADMIN') throw errors.aadhaarLocked();
      if (!body.reason) throw errors.reasonRequired();
    }

    const hmac = lookupHmac(body.aadhaarNumber);
    const owner = await this.#repo.aadhaarOwner(hmac);
    if (owner && owner.recordId !== existing?.id) {
      const matches: DuplicateMatch[] = [];
      for (const [kind, p] of [['EMPLOYEE', owner.employee], ['DAILY_WORKER', owner.dailyWorker]] as const) {
        if (p) matches.push(...this.#asMatches('aadhaar', [p], kind));
      }
      throw errors.duplicatePerson(matches);
    }

    let cardImageKey: string | null | undefined;
    if (body.cardImageBase64) {
      const raw = this.#decodeImage(body.cardImageBase64);
      const format = await sharp(raw).metadata().then((m) => m.format).catch(() => undefined);
      if (format !== 'jpeg' && format !== 'png') throw errors.invalidImage();
      // M3-PRF-05 AC3 (first-8-digit masking) is not done yet: see docs/DECISIONS.md and docs/GO-LIVE.md.
      cardImageKey = (await this.#storage.put('aadhaar', raw, format === 'png' ? 'png' : 'jpg')).key;
    }

    const digits = body.aadhaarNumber;
    const enc = { aadhaarEnc: encrypt(digits), keyVersion: KEY_VERSION, lookupHmac: hmac, last4: last4(digits) };
    if (existing) await this.#repo.replaceAadhaar(existing.id, { ...enc, ...(cardImageKey ? { cardImageKey } : {}) });
    else await this.#repo.saveAadhaar({ ...enc, employeeId: id, cardImageKey: cardImageKey ?? null, createdBy: this.#ctx.user.id });
    await this.#repo.setAadhaarLast4(id, enc.last4, this.#ctx.user.id);

    await audit(
      this.#ctx,
      existing ? 'employee.aadhaar_correct' : 'employee.aadhaar_set',
      'employee',
      { aadhaarNumber: existing ? existing.last4 : null },
      { aadhaarNumber: enc.last4 },
      { entityId: employee.id, ...(body.reason ? { reason: body.reason } : {}) },
    );
    this.#events.emit('employee.aadhaar_saved', { employeeId: id });
    return { aadhaar: maskAadhaar(enc.last4), hasCardImage: cardImageKey != null || (existing?.cardImageKey ?? null) != null };
  }

  // --- helpers --------------------------------------------------------------------

  #asMatches(field: DuplicateMatch['field'], people: Person[], kind: DuplicateMatch['kind'] = 'EMPLOYEE'): DuplicateMatch[] {
    return people.map((p) => ({
      field,
      kind,
      id: p.id,
      code: p.code,
      name: p.name,
      status: p.status,
      offer: kind === 'DAILY_WORKER' ? 'CONVERT_DAILY_WORKER' : p.status === 'EXITED' ? 'REHIRE' : null,
      link: kind === 'EMPLOYEE' ? `/employees/${p.id}` : `/daily-workers/${p.id}`,
      blocking: true,
    }));
  }

  #decodeImage(base64: string): Buffer {
    const raw = Buffer.from(base64, 'base64');
    if (raw.byteLength > MAX_IMAGE_BYTES) throw errors.imageTooLarge();
    if (raw.byteLength === 0) throw errors.invalidImage();
    return raw;
  }

  /** M3-PRF-01 AC5: 18+ on the date of joining. The DB has the same check. */
  #checkAge(dob: string, joinDate: string | null): void {
    const born = parseDate(dob);
    if (Temporal.PlainDate.compare(born, today()) >= 0) throw errors.dobInFuture();
    if (joinDate && yearsBetween(born, parseDate(joinDate)) < 18) throw errors.underage();
  }

  async #checkStates(addresses: ({ stateCode: string } | null | undefined)[]): Promise<void> {
    for (const [i, a] of addresses.entries()) {
      if (a && !(await this.#repo.stateExists(a.stateCode))) throw errors.unknownState(i === 0 ? 'currentAddress.stateCode' : 'permanentAddress.stateCode');
    }
  }

  async #mustFind(id: string): Promise<Employee> {
    const e = await this.#repo.findById(id);
    if (!e) throw new NotFoundError('Employee');
    return e;
  }
}
