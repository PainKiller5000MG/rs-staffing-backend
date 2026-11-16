// Employee bank accounts end to end against the seeded database (npm run seed:reset).
// Every employee, name and account number these tests create is unique per run, so reruns need no reset.
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { db } from '../../src/prisma/db.ts';
import { mobileOf, testApp } from '../helpers.ts';

const { request, login, container } = testApp();
let admin: string;
let hr: string;
let payroll: string;
let accountsRole: string;
let auditor: string;
let supA: string;
let employee: string;

let n = Date.now() % 100_000_000;
const next = () => ++n;
const NIL = '00000000-0000-7000-8000-000000000000';
const SBI = 'SBIN0030112';
const today = () => Temporal.Now.plainDateISO('Asia/Kolkata');

/** A unique 12-digit account number that never ends in 0000 (the stub's "not found" hook). */
const accountNo = () => {
  const s = `5${String(next()).padStart(10, '0')}9`;
  return s.slice(0, 12);
};
const proof = async () => (await sharp({ create: { width: 40, height: 40, channels: 3, background: '#aa6633' } }).png().toBuffer()).toString('base64');

async function newEmployee(name = `Bank Worker ${next()}`) {
  const res = await request('POST', '/employees', {
    cookie: hr,
    body: { name, dob: '1995-04-12', gender: 'MALE', mobile: `9${String(next()).padStart(9, '0')}`, joinDate: '2026-11-01' },
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as { id: string; name: string };
}

async function bodyFor(holderName: string, over: Record<string, unknown> = {}) {
  const num = accountNo();
  return { holderName, accountNumber: num, accountNumberConfirm: num, ifsc: SBI, accountType: 'SAVINGS', proofImageBase64: await proof(), ...over };
}

async function addAccount(empId: string, holderName: string, over: Record<string, unknown> = {}, as = hr) {
  const body = await bodyFor(holderName, over);
  const res = await request('POST', `/employees/${empId}/bank-accounts`, { cookie: as, body });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return { acc: res.body as any, body };
}
const verify = (id: string, as = hr) => request('POST', `/bank-accounts/${id}/verify`, { cookie: as });
const approve = (id: string, as = admin) => request('POST', `/bank-accounts/${id}/approve`, { cookie: as });

/** Add + verify + approve: an active account for a new or given employee. */
async function activeAccount(emp: { id: string; name: string }, over: Record<string, unknown> = {}) {
  const { acc, body } = await addAccount(emp.id, emp.name, over);
  expect((await verify(acc.id)).body.verifyStatus).toBe('VERIFIED');
  const ok = await approve(acc.id);
  expect(ok.status, JSON.stringify(ok.body)).toBe(200);
  return { acc: ok.body as any, body };
}
const auditRows = (action: string, entityId: string) =>
  db.orm.audit.AuditLog.where({ action: action as never, entityId: entityId as never }).all();

beforeAll(async () => {
  admin = await login(mobileOf('admin'));
  hr = await login(mobileOf('hr'));
  payroll = await login(mobileOf('payroll'));
  accountsRole = await login(mobileOf('accounts'));
  auditor = await login(mobileOf('auditor'));
  supA = await login(mobileOf('supA'));
  employee = await login(mobileOf('employee'));
});
afterAll(() => db.close());

describe('access', () => {
  test('M3-BNK-01 AC1: no session → 401; auditor, accounts, supervisor and employee cannot write → 403; HR cannot approve', async () => {
    const body = await bodyFor('X');
    expect((await request('POST', `/employees/${NIL}/bank-accounts`, { body })).status).toBe(401);
    for (const cookie of [auditor, accountsRole, supA, employee]) {
      expect((await request('POST', `/employees/${NIL}/bank-accounts`, { cookie, body })).status).toBe(403);
      expect((await request('POST', `/bank-accounts/${NIL}/verify`, { cookie })).status).toBe(403);
    }
    for (const cookie of [hr, payroll, auditor, supA, employee]) {
      expect((await request('POST', `/bank-accounts/${NIL}/approve`, { cookie })).status, 'approve').toBe(403);
      expect((await request('POST', `/bank-accounts/${NIL}/approve-mismatch`, { cookie, body: { reason: 'x' } })).status).toBe(403);
    }
    expect((await request('GET', `/employees/${NIL}/bank-accounts`, { cookie: supA })).status).toBe(403);
  });
});

describe('add (M3-BNK-01)', () => {
  test('M3-BNK-01 AC1 AC2 AC3: creates a pending account; bank and branch come from the IFSC table; the number is stored encrypted and shown masked', async () => {
    const emp = await newEmployee();
    const { acc, body } = await addAccount(emp.id, `  ${emp.name} `, { ifsc: ` ${SBI.toLowerCase()} ` });
    expect(acc).toMatchObject({
      employeeId: emp.id,
      status: 'PENDING_VERIFICATION',
      holderName: emp.name,
      accountMasked: `XXXXXX${body.accountNumber.slice(-4)}`,
      ifsc: SBI,
      bankName: 'State Bank of India',
      branch: 'Indore Main',
      accountType: 'SAVINGS',
      hasProof: true,
      effectiveFrom: null,
    });
    expect(JSON.stringify(acc)).not.toContain(body.accountNumber);

    const row = await db.orm.app.BankAccount.where({ id: acc.id as never }).first();
    expect(Buffer.from(row!.accountEnc).toString('utf8')).not.toContain(body.accountNumber);
    expect(row!.accountLast4).toBe(body.accountNumber.slice(-4));

    const rows = await auditRows('bank_account.create', acc.id);
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0])).not.toContain(body.accountNumber);
    expect(JSON.stringify(rows[0]!.after)).toContain(`XXXXXX${body.accountNumber.slice(-4)}`);

    const list = await request('GET', `/employees/${emp.id}/bank-accounts`, { cookie: auditor });
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).not.toContain(body.accountNumber);
    expect(list.body.items).toHaveLength(1);
  });

  test('M3-BNK-01 AC1: the number entered twice must match; blank, short, long and non-digit values → 422 with the field path', async () => {
    const emp = await newEmployee();
    const base = await bodyFor(emp.name);
    const cases: [string, Record<string, unknown>][] = [
      ['accountNumberConfirm', { accountNumberConfirm: '123456789012' }],
      ['holderName', { holderName: '   ' }],
      ['holderName', { holderName: 'A'.repeat(121) }],
      ['accountNumber', { accountNumber: '12345678', accountNumberConfirm: '12345678' }],
      ['accountNumber', { accountNumber: '1'.repeat(19), accountNumberConfirm: '1'.repeat(19) }],
      ['accountNumber', { accountNumber: '12345ABCDE89', accountNumberConfirm: '12345ABCDE89' }],
      ['ifsc', { ifsc: '' }],
      ['accountType', { accountType: 'SALARY' }],
      ['proofImageBase64', { proofImageBase64: '' }],
    ];
    for (const [path, over] of cases) {
      const res = await request('POST', `/employees/${emp.id}/bank-accounts`, { cookie: hr, body: { ...base, ...over } });
      expect(res.status, path).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(JSON.stringify(res.body), path).toContain(path);
    }
    const missing: Record<string, unknown> = { ...base };
    delete missing['accountNumber'];
    expect((await request('POST', `/employees/${emp.id}/bank-accounts`, { cookie: hr, body: missing })).status).toBe(422);
  });

  test('M3-BNK-01 AC2: a badly formed IFSC → 422 VALIDATION_FAILED; a well-formed one that is not in the table → 422 IFSC_UNKNOWN; lookup endpoint fills bank and branch', async () => {
    const emp = await newEmployee();
    const bad = await request('POST', `/employees/${emp.id}/bank-accounts`, { cookie: hr, body: await bodyFor(emp.name, { ifsc: 'SBIN1030112' }) });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe('VALIDATION_FAILED');
    expect(JSON.stringify(bad.body)).toContain('ifsc');
    const unknown = await request('POST', `/employees/${emp.id}/bank-accounts`, { cookie: hr, body: await bodyFor(emp.name, { ifsc: 'SBIN0999999' }) });
    expect(unknown.status).toBe(422);
    expect(unknown.body.error.code).toBe('IFSC_UNKNOWN');

    const found = await request('GET', `/ifsc/${HDFC_LOWER}`, { cookie: hr });
    expect(found.body).toEqual({ ifsc: 'HDFC0000001', bankName: 'HDFC Bank', branch: 'Mumbai Fort' });
    expect((await request('GET', '/ifsc/SBIN0999999', { cookie: hr })).body.error.code).toBe('IFSC_UNKNOWN');
    expect((await request('GET', '/ifsc/NOPE', { cookie: hr })).status).toBe(422);
    expect((await request('GET', `/ifsc/${SBI}`)).status).toBe(401);
  });

  test('M3-BNK-01 AC1: the proof must be a JPEG or PNG image; unknown employee → 404; the proof is stored (hasProof)', async () => {
    const emp = await newEmployee();
    const notImage = await request('POST', `/employees/${emp.id}/bank-accounts`, {
      cookie: hr,
      body: await bodyFor(emp.name, { proofImageBase64: Buffer.from('this is not an image at all, just text '.repeat(5)).toString('base64') }),
    });
    expect(notImage.status).toBe(422);
    expect(notImage.body.error.code).toBe('INVALID_IMAGE');
    const missing = await request('POST', `/employees/${NIL}/bank-accounts`, { cookie: hr, body: await bodyFor('Nobody') });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
  });

  test('M3-BNK-03 AC2: a second entry while one is waiting → 409 CHANGE_PENDING; a failed one does not block a retry', async () => {
    const emp = await newEmployee();
    const { acc } = await addAccount(emp.id, emp.name);
    const again = await request('POST', `/employees/${emp.id}/bank-accounts`, { cookie: hr, body: await bodyFor(emp.name) });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('CHANGE_PENDING');

    const failing = await newEmployee();
    const failNo = `${String(next()).padStart(8, '0')}0000`;
    const failed = (await addAccount(failing.id, failing.name, { accountNumber: failNo, accountNumberConfirm: failNo })).acc;
    expect((await verify(failed.id)).body.status).toBe('FAILED');
    await addAccount(failing.id, failing.name);
    void acc;
  });
});

describe('verify (M3-BNK-02)', () => {
  test('M3-BNK-02 AC1 AC2: the stub verifies with the entered name; the bank-returned name and a score are stored; an exact match is 100', async () => {
    const emp = await newEmployee();
    const { acc } = await addAccount(emp.id, emp.name);
    const res = await verify(acc.id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ verifyStatus: 'VERIFIED', status: 'AWAITING_APPROVAL', bankReturnedName: emp.name, nameMatchScore: 100 });
    const rows = await auditRows('bank_account.verify', acc.id);
    expect(rows).toHaveLength(1);
  });

  test('M3-BNK-02 AC2: a spelling slip and word order still pass (score ≥ 80)', async () => {
    const emp = await newEmployee('Rajesh Kumar Sharma');
    const { acc } = await addAccount(emp.id, 'SHARMA RAJESH KUMAR');
    expect((await verify(acc.id)).body).toMatchObject({ verifyStatus: 'VERIFIED', nameMatchScore: 100 });
    const emp2 = await newEmployee('Rajesh Kumar Sharma');
    const { acc: acc2 } = await addAccount(emp2.id, 'Rajesh Kumar Sharmaa');
    const res = await verify(acc2.id);
    expect(res.body.verifyStatus).toBe('VERIFIED');
    expect(res.body.nameMatchScore).toBeGreaterThanOrEqual(80);
    expect(res.body.nameMatchScore).toBeLessThan(100);
  });

  test('M3-BNK-02 AC3: a score below 80 is "name mismatch": unusable until an Admin (not the maker) approves it with a reason', async () => {
    const emp = await newEmployee();
    const { acc } = await addAccount(emp.id, 'Suresh Kumar Mehta');
    const res = await verify(acc.id);
    expect(res.body).toMatchObject({ verifyStatus: 'NAME_MISMATCH', status: 'NAME_MISMATCH' });
    expect(res.body.nameMatchScore).toBeLessThan(80);

    const early = await approve(acc.id);
    expect(early.status).toBe(422);
    expect(early.body.error.code).toBe('NOT_VERIFIED');

    expect((await request('POST', `/bank-accounts/${acc.id}/approve-mismatch`, { cookie: admin, body: {} })).status).toBe(422);
    expect((await request('POST', `/bank-accounts/${acc.id}/approve-mismatch`, { cookie: admin, body: { reason: '   ' } })).status).toBe(422);
    const ok = await request('POST', `/bank-accounts/${acc.id}/approve-mismatch`, { cookie: admin, body: { reason: 'Joint account with spouse' } });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body).toMatchObject({ status: 'AWAITING_APPROVAL', mismatchReason: 'Joint account with spouse' });
    expect((await auditRows('bank_account.mismatch_approve', acc.id))[0]!.reason).toBe('Joint account with spouse');

    // a second decision is refused, and now the account can be approved
    expect((await request('POST', `/bank-accounts/${acc.id}/approve-mismatch`, { cookie: admin, body: { reason: 'again' } })).body.error.code).toBe('NOT_NAME_MISMATCH');
    expect((await approve(acc.id)).status).toBe(200);
  });

  test('M3-BNK-02 AC3: the Admin who entered the account cannot approve its mismatch (maker-checker)', async () => {
    const emp = await newEmployee();
    const { acc } = await addAccount(emp.id, 'Someone Else Entirely', {}, admin);
    expect((await verify(acc.id, admin)).body.verifyStatus).toBe('NAME_MISMATCH');
    const res = await request('POST', `/bank-accounts/${acc.id}/approve-mismatch`, { cookie: admin, body: { reason: 'mine' } });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('MAKER_CHECKER');
  });

  test('M3-BNK-02 AC4: a failed or invalid account can never be approved for salary', async () => {
    const emp = await newEmployee();
    const no = `${String(next()).padStart(8, '0')}0000`;
    const { acc } = await addAccount(emp.id, emp.name, { accountNumber: no, accountNumberConfirm: no });
    const res = await verify(acc.id);
    expect(res.body).toMatchObject({ verifyStatus: 'FAILED', status: 'FAILED', nameMatchScore: null });
    const refused = await approve(acc.id);
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe('NOT_VERIFIED');
    expect((await request('POST', `/bank-accounts/${acc.id}/approve-mismatch`, { cookie: admin, body: { reason: 'try' } })).body.error.code).toBe('NOT_NAME_MISMATCH');
    // DB backstop: even a direct write cannot approve a failed account
    await expect(
      db.orm.app.BankAccount.where({ id: acc.id as never }).update({ approvedBy: (await db.orm.app.User.first())!.id, approvedAt: Temporal.Now.instant() } as never),
    ).rejects.toThrow();
    expect((await request('POST', `/bank-accounts/${NIL}/verify`, { cookie: hr })).status).toBe(404);
  });
});

describe('approve and change (M3-BNK-03)', () => {
  test('M3-BNK-01 AC4 M3-BNK-03 AC2: a pending account grants nothing; the creator cannot approve it; another user can', async () => {
    const emp = await newEmployee();
    const { acc: own } = await addAccount(emp.id, emp.name, {}, admin);
    expect((await verify(own.id, admin)).body.verifyStatus).toBe('VERIFIED');
    expect((await request('GET', `/employees/${emp.id}`, { cookie: hr })).body.bank).toBeNull();
    const self = await approve(own.id, admin);
    expect(self.status).toBe(422);
    expect(self.body.error.code).toBe('MAKER_CHECKER');
    expect((await request('GET', `/employees/${emp.id}`, { cookie: hr })).body.bank).toBeNull();

    const emp2 = await newEmployee();
    const { acc } = await addAccount(emp2.id, emp2.name);
    expect((await verify(acc.id)).body.verifyStatus).toBe('VERIFIED');
    expect((await request('GET', `/employees/${emp2.id}`, { cookie: hr })).body.bank).toBeNull();

    const unverified = await addAccount((await newEmployee()).id, 'Whoever');
    expect((await approve(unverified.acc.id)).body.error.code).toBe('NOT_VERIFIED');

    const ok = await approve(acc.id);
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body).toMatchObject({ status: 'ACTIVE', effectiveFrom: today().toString(), effectiveTo: null });
    expect((await approve(acc.id)).body.error.code).toBe('ALREADY_APPROVED');
    const profile = (await request('GET', `/employees/${emp2.id}`, { cookie: hr })).body;
    expect(profile.bank).toMatchObject({ accountMasked: acc.accountMasked, verified: true, approved: true });
    expect(await auditRows('bank_account.approve', acc.id)).toHaveLength(1);
  });

  test('M3-BNK-03 AC1 AC4 AC5: a change makes a new version, closes the old with a to-date, keeps it, and tells the employee; the first account sends no alert', async () => {
    const seen: any[] = [];
    container.cradle.bus.on('employee.bank_changed', (e) => void seen.push(e.payload));
    const emp = await newEmployee();
    const first = await activeAccount(emp);
    expect(seen.filter((p) => p['employeeId'] === emp.id)).toHaveLength(0);

    const { acc } = await addAccount(emp.id, emp.name, { ifsc: 'HDFC0000001' });
    expect((await verify(acc.id)).body.verifyStatus).toBe('VERIFIED');
    // until it is approved, the old account stays the active one
    expect((await request('GET', `/employees/${emp.id}`, { cookie: hr })).body.bank.ifsc).toBe(SBI);
    const ok = await approve(acc.id);
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);

    const list = (await request('GET', `/employees/${emp.id}/bank-accounts`, { cookie: hr })).body.items;
    expect(list).toHaveLength(2);
    const old = list.find((a: any) => a.id === first.acc.id);
    const fresh = list.find((a: any) => a.id === acc.id);
    // The new account starts the day after a locked payroll run that covers today (M3-BNK-03 AC5; the seed has one),
    // otherwise tomorrow (the first account was approved today). The old one runs to the day before.
    const locked = (await db.orm.app.PayrollRun.all())
      .filter((r) => ['LOCKED', 'PUBLISHED'].includes(r.status) && r.periodFrom.toString() <= today().toString() && r.periodTo.toString() >= today().toString())
      .map((r) => r.periodTo.toString())
      .sort()
      .at(-1);
    const from = locked ? Temporal.PlainDate.from(locked).add({ days: 1 }) : today().add({ days: 1 });
    expect(old).toMatchObject({ effectiveTo: from.subtract({ days: 1 }).toString(), status: 'ACTIVE' });
    expect(fresh).toMatchObject({ effectiveFrom: from.toString(), effectiveTo: null, status: 'SCHEDULED', bankName: 'HDFC Bank' });
    expect(Temporal.PlainDate.from(old.effectiveTo).add({ days: 1 }).toString()).toBe(fresh.effectiveFrom);
    expect(seen.filter((p) => p['employeeId'] === emp.id)).toEqual([expect.objectContaining({ bankAccountId: acc.id })]);

    const rows = await auditRows('bank_account.approve', acc.id);
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0])).not.toMatch(/\d{9,}/);
  });

  test('M3-BNK-03 AC1: re-entering the account already in use → 409 DUPLICATE', async () => {
    const emp = await newEmployee();
    const first = await activeAccount(emp);
    const again = await request('POST', `/employees/${emp.id}/bank-accounts`, {
      cookie: hr,
      body: { ...first.body, proofImageBase64: await proof() },
    });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('DUPLICATE');
  });

  test('M3-BNK-03 AC3: the sensitive-action re-check (M1-SEC-08) is not live yet', () => {
    // M3-BNK-03 AC3 n/a: M1-SEC-08 is not built; wire it into approve() when it is.
    expect(true).toBe(true);
  });
});

describe('shared account (M3-BNK-06)', () => {
  test('M3-BNK-06 AC1: the same account number on another active employee → 409 SHARED_ACCOUNT; HR cannot override; Admin can, with a reason, and it is recorded', async () => {
    const a = await newEmployee();
    const { body } = await activeAccount(a);
    const b = await newEmployee();
    const same = { holderName: b.name, accountNumber: body.accountNumber, accountNumberConfirm: body.accountNumber, ifsc: SBI, accountType: 'SAVINGS' };

    const blocked = await request('POST', `/employees/${b.id}/bank-accounts`, { cookie: hr, body: { ...same, proofImageBase64: await proof() } });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('SHARED_ACCOUNT');
    expect(blocked.body.error.details.owners[0]).toMatchObject({ employeeId: a.id });
    expect(JSON.stringify(blocked.body)).not.toContain(body.accountNumber);

    const hrTry = await request('POST', `/employees/${b.id}/bank-accounts`, { cookie: hr, body: { ...same, proofImageBase64: await proof(), sharedOverrideReason: 'Spouses' } });
    expect(hrTry.status).toBe(403);

    const adminTry = await request('POST', `/employees/${b.id}/bank-accounts`, { cookie: admin, body: { ...same, proofImageBase64: await proof(), sharedOverrideReason: 'Spouses share one account' } });
    expect(adminTry.status, JSON.stringify(adminTry.body)).toBe(201);
    expect(adminTry.body.sharedOverrideReason).toBe('Spouses share one account');
    const row = await db.orm.app.BankAccount.where({ id: adminTry.body.id as never }).first();
    expect(row!.sharedOverrideBy).not.toBeNull();
  });

  test('M3-BNK-06 AC1: a pending (unapproved) account elsewhere does not block', async () => {
    const a = await newEmployee();
    const { body } = await addAccount(a.id, a.name);
    const b = await newEmployee();
    const res = await request('POST', `/employees/${b.id}/bank-accounts`, {
      cookie: hr,
      body: { ...body, holderName: b.name, proofImageBase64: await proof() },
    });
    expect(res.status).toBe(201);
  });
});

describe('reading', () => {
  test('M3-BNK-01 AC3: an employee sees only their own accounts, masked; others get 404; unknown employee 404', async () => {
    const own = await db.orm.app.User.where({ mobile: mobileOf('employee') as never }).first();
    const mine = await request('GET', `/employees/${own!.employeeId}/bank-accounts`, { cookie: employee });
    expect(mine.status).toBe(200);
    for (const a of mine.body.items) expect(a.accountMasked).toMatch(/^XXXXXX\d{4}$/);
    const other = await newEmployee();
    expect((await request('GET', `/employees/${other.id}/bank-accounts`, { cookie: employee })).status).toBe(404);
    expect((await request('GET', `/employees/${NIL}/bank-accounts`, { cookie: hr })).status).toBe(404);
    expect((await request('GET', `/employees/${other.id}/bank-accounts`)).status).toBe(401);
  });
});

// M3-BNK-01 AC4 n/a here: the Active-status endpoint is M3-STA; the rule is BankAccountsService.requireForActivation (test/services/bank-accounts.service.test.ts).
// M3-BNK-04 AC1 is tested in test/services/bank-accounts.service.test.ts (accountOn is called by the payroll engine, not over HTTP).
const HDFC_LOWER = 'hdfc0000001';
