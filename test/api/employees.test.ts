// Employee profiles end to end against the seeded database (npm run seed:reset).
// Every value these tests create (mobile, PAN, Aadhaar, name) is unique per run, so reruns need no reset.
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { encrypt, KEY_VERSION, last4, lookupHmac } from '../../src/lib/crypto.ts';
import { verhoeffDigit } from '../../src/lib/verhoeff.ts';
import { db } from '../../src/prisma/db.ts';
import { mobileOf, testApp } from '../helpers.ts';

const { request, login, container } = testApp();
let admin: string;
let hr: string;
let payroll: string;
let accounts: string;
let auditor: string;
let supA: string;
let supB: string;
let employee: string;

let n = Date.now() % 100_000_000;
const next = () => ++n;
const mobile = () => `9${String(next()).padStart(9, '0')}`;
const letters = (len: number, v: number) => Array.from({ length: len }, (_, i) => String.fromCharCode(65 + (Math.floor(v / 26 ** i) % 26))).join('');
/** A PAN in AAAPA9999A shape, unique per call. */
const pan = () => {
  const v = next();
  return `${letters(3, Math.floor(v / 10000) % 17576)}P${letters(1, v % 26)}${String(v % 10000).padStart(4, '0')}${letters(1, v % 7)}`;
};
const aadhaar = () => {
  const base = `2${String(next()).padStart(10, '0')}`;
  return base + verhoeffDigit(base);
};
const NIL = '00000000-0000-7000-8000-000000000000';

const newBody = (over: Record<string, unknown> = {}) => ({
  name: `Test Worker ${next()}`,
  dob: '1995-04-12',
  gender: 'MALE',
  mobile: mobile(),
  joinDate: '2026-11-01',
  ...over,
});

async function newEmployee(over: Record<string, unknown> = {}, as = hr) {
  const res = await request('POST', '/employees', { cookie: as, body: newBody(over) });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as { id: string; code: string; mobile: string; name: string; warnings: any[] };
}
const auditRows = (action: string, entityId: string) =>
  db.orm.audit.AuditLog.where({ action: action as never, entityId: entityId as never }).all();
const png = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: '#3366aa' } }).png().toBuffer();

beforeAll(async () => {
  admin = await login(mobileOf('admin'));
  hr = await login(mobileOf('hr'));
  payroll = await login(mobileOf('payroll'));
  accounts = await login(mobileOf('accounts'));
  auditor = await login(mobileOf('auditor'));
  supA = await login(mobileOf('supA'));
  supB = await login(mobileOf('supB'));
  employee = await login(mobileOf('employee'));
});
afterAll(() => db.close());

describe('access', () => {
  test('M3-PRF-01 AC1: no session → 401; auditor, accounts, supervisor and employee cannot write → 403', async () => {
    expect((await request('POST', '/employees', { body: newBody() })).status).toBe(401);
    for (const cookie of [auditor, accounts, supA, employee]) {
      expect((await request('POST', '/employees', { cookie, body: newBody() })).status).toBe(403);
      expect((await request('POST', '/employees/duplicate-check', { cookie, body: { mobile: '9000000001' } })).status).toBe(403);
      expect((await request('PATCH', `/employees/${NIL}`, { cookie, body: { name: 'X' } })).status).toBe(403);
      expect((await request('PUT', `/employees/${NIL}/photo`, { cookie, body: { imageBase64: 'A'.repeat(200) } })).status).toBe(403);
      expect((await request('PUT', `/employees/${NIL}/aadhaar`, { cookie, body: { aadhaarNumber: aadhaar() } })).status).toBe(403);
    }
    expect((await request('GET', `/employees/${NIL}`)).status).toBe(401);
  });
});

describe('create', () => {
  test('M3-PRF-01 AC1 AC3: creates a Draft profile from the five required fields; each missing field → 422 with its path', async () => {
    const res = await request('POST', '/employees', { cookie: hr, body: newBody({ name: `  Asha  Kumari${next()} ` }) });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: expect.stringMatching(/^Asha {2}Kumari\d+$/), status: 'DRAFT', gender: 'MALE', joinDate: '2026-11-01', warnings: [] });
    for (const field of ['name', 'dob', 'gender', 'mobile', 'joinDate']) {
      const body: Record<string, unknown> = newBody();
      delete body[field];
      const bad = await request('POST', '/employees', { cookie: payroll, body });
      expect(bad.status, field).toBe(422);
      expect(bad.body.error.code).toBe('VALIDATION_FAILED');
      expect(JSON.stringify(bad.body)).toContain(field);
    }
  });

  test('M3-PRF-01 AC1: blank name, bad gender, bad mobile, too-long name and a bad date are 422', async () => {
    for (const over of [{ name: '   ' }, { name: 'x'.repeat(121) }, { gender: 'male' }, { mobile: '12345' }, { mobile: '5123456789' }, { dob: '12-04-1995' }, { joinDate: 'soon' }]) {
      expect((await request('POST', '/employees', { cookie: hr, body: newBody(over) })).status, JSON.stringify(over)).toBe(422);
    }
  });

  test('M3-PRF-01 AC2: codes look like RS000123, are unique and rise by one; the code cannot be changed, even in the database', async () => {
    const a = await newEmployee();
    const b = await newEmployee();
    expect(a.code).toMatch(/^RS\d{6}$/);
    expect(Number(b.code.slice(2))).toBe(Number(a.code.slice(2)) + 1);
    await expect(db.orm.app.Employee.where({ id: a.id as never }).update({ code: 'RS999999' } as never)).rejects.toThrow();
    const row = await db.orm.app.Employee.where({ id: a.id as never }).first();
    expect(row?.code).toBe(a.code);
  });

  test('M3-PRF-01 AC4: the mobile number becomes an EMPLOYEE login that can sign in; the audit row exists', async () => {
    const e = await newEmployee();
    const user = await db.orm.app.User.where({ mobile: `+91${e.mobile.slice(-10)}` as never }).first();
    expect(user).toMatchObject({ role: 'EMPLOYEE', status: 'ACTIVE', employeeId: e.id });
    const cookie = await login(user!.mobile);
    expect((await request('GET', '/me', { cookie })).body).toMatchObject({ role: 'EMPLOYEE', employeeId: e.id });
    expect(await auditRows('employee.create', e.id)).toHaveLength(1);
  });

  test('M3-PRF-01 AC4: the mobile is normalised, and a number already used by another person or any login → 409 DUPLICATE_PERSON / DUPLICATE', async () => {
    const m = mobile();
    const first = await newEmployee({ mobile: `+91 ${m.slice(0, 5)}-${m.slice(5)}` });
    expect(first.mobile).toBe(`+91${m}`);
    const dup = await request('POST', '/employees', { cookie: hr, body: newBody({ mobile: `0${m}` }) });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE_PERSON');
    expect(dup.body.error.details.matches[0]).toMatchObject({ field: 'mobile', id: first.id, link: `/employees/${first.id}`, blocking: true });
    // An HQ login's number is not free either (M1-OTP-04).
    const hq = await request('POST', '/employees', { cookie: hr, body: newBody({ mobile: mobileOf('accounts') }) });
    expect(hq.status).toBe(409);
    expect(hq.body.error.code).toBe('DUPLICATE');
  });

  test('M3-PRF-01 AC5: under 18 on the joining day → 422 UNDERAGE; the 18th birthday itself is fine; the database refuses it too', async () => {
    const early = await request('POST', '/employees', { cookie: hr, body: newBody({ dob: '2000-06-15', joinDate: '2018-06-14' }) });
    expect(early.status).toBe(422);
    expect(early.body.error.code).toBe('UNDERAGE');
    expect((await request('POST', '/employees', { cookie: hr, body: newBody({ dob: '2000-06-15', joinDate: '2018-06-15' }) })).status).toBe(201);
    const future = await request('POST', '/employees', { cookie: hr, body: newBody({ dob: '2999-01-01' }) });
    expect(future.status).toBe(422);
    const e = await newEmployee();
    await expect(db.orm.app.Employee.where({ id: e.id as never }).update({ dob: Temporal.PlainDate.from('2020-01-01') } as never)).rejects.toThrow();
  });

  test('M3-PRF-02 AC1 AC2: personal details and both addresses are saved; state uses the fixed state list; PIN is 6 digits', async () => {
    const email = `asha${next()}@example.com`;
    const e = await newEmployee({
      fatherName: 'Ram Kumar',
      maritalStatus: 'MARRIED',
      email,
      altPhone: '9811111111',
      currentAddress: { line: '12 Gandhi Nagar', stateCode: 'MP', pin: '462023' },
      permanentAddress: { line: 'Village Rampur', stateCode: 'UP', pin: '226001' },
    });
    const view = await request('GET', `/employees/${e.id}`, { cookie: hr });
    expect(view.body.profile).toMatchObject({
      fatherName: 'Ram Kumar',
      maritalStatus: 'MARRIED',
      email,
      altPhone: '+919811111111',
      currentAddress: { line: '12 Gandhi Nagar', stateCode: 'MP', pin: '462023' },
      permanentAddress: { stateCode: 'UP', pin: '226001' },
    });
    const unknown = await request('POST', '/employees', { cookie: hr, body: newBody({ currentAddress: { line: 'x', stateCode: 'ZZ', pin: '462023' } }) });
    expect(unknown.status).toBe(409);
    expect(unknown.body.error).toMatchObject({ code: 'REFERENCE_MISSING', details: { fields: ['currentAddress.stateCode'] } });
    for (const pin of ['46202', '0462023', 'abcdef']) {
      const bad = await request('POST', '/employees', { cookie: hr, body: newBody({ permanentAddress: { line: 'x', stateCode: 'MP', pin } }) });
      expect(bad.status, pin).toBe(422);
    }
    for (const over of [{ email: 'not-an-email' }, { maritalStatus: 'COMPLICATED' }, { fatherName: 'x'.repeat(121) }, { altPhone: '123' }]) {
      expect((await request('POST', '/employees', { cookie: hr, body: newBody(over) })).status, JSON.stringify(over)).toBe(422);
    }
  });
});

describe('photo', () => {
  test('M3-PRF-03 AC1: a PNG is resized to 600 px, stored as JPEG and replaced cleanly by the next upload', async () => {
    const e = await newEmployee();
    const up = await request('PUT', `/employees/${e.id}/photo`, { cookie: hr, body: { imageBase64: (await png(1200, 900)).toString('base64') } });
    expect(up.status).toBe(200);
    expect(up.body).toEqual({ hasPhoto: true });
    const key = (await db.orm.app.Employee.where({ id: e.id as never }).first())!.photoKey!;
    const meta = await sharp(Buffer.from(await container.cradle.storage.get(key))).metadata();
    expect(meta).toMatchObject({ format: 'jpeg', width: 600, height: 450 });
    // a small picture is not enlarged
    await request('PUT', `/employees/${e.id}/photo`, { cookie: hr, body: { imageBase64: (await png(300, 400)).toString('base64') } });
    const key2 = (await db.orm.app.Employee.where({ id: e.id as never }).first())!.photoKey!;
    expect(key2).not.toBe(key);
    expect(await sharp(Buffer.from(await container.cradle.storage.get(key2))).metadata()).toMatchObject({ width: 300, height: 400 });
    await expect(container.cradle.storage.get(key)).rejects.toThrow();
    expect((await request('GET', `/employees/${e.id}`, { cookie: hr })).body.profile.hasPhoto).toBe(true);
    expect((await auditRows('employee.photo', e.id)).length).toBe(2);
  });

  test('M3-PRF-03 AC1: over 2 MB → 422 IMAGE_TOO_LARGE; a GIF or garbage → 422 IMAGE_INVALID; unknown employee → 404', async () => {
    const e = await newEmployee();
    const big = Buffer.alloc(2 * 1024 * 1024 + 1, 1).toString('base64');
    const tooBig = await request('PUT', `/employees/${e.id}/photo`, { cookie: hr, body: { imageBase64: big } });
    expect(tooBig.status).toBe(422);
    expect(tooBig.body.error.code).toBe('IMAGE_TOO_LARGE');
    const gif = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#fff' } }).gif().toBuffer();
    for (const data of [gif, Buffer.from('this is not an image at all, just some text '.repeat(5))]) {
      const bad = await request('PUT', `/employees/${e.id}/photo`, { cookie: hr, body: { imageBase64: data.toString('base64').padEnd(200, 'A') } });
      expect(bad.status).toBe(422);
      expect(bad.body.error.code).toBe('IMAGE_INVALID');
    }
    expect((await request('PUT', `/employees/${NIL}/photo`, { cookie: hr, body: { imageBase64: (await png(50, 50)).toString('base64').padEnd(200, 'A') } })).status).toBe(404);
    expect((await db.orm.app.Employee.where({ id: e.id as never }).first())?.photoKey).toBeNull();
  });
  // M3-PRF-03 AC2 n/a: the ID card is M3-SAF-03 and the payslip header is Module 8; neither exists yet.
});

describe('PAN', () => {
  test('M3-PRF-04 AC1 AC2: PAN is checked, upper-cased, unique, and masked in the view and the audit', async () => {
    const p = pan();
    const e = await newEmployee({ pan: p.toLowerCase() });
    const view = (await request('GET', `/employees/${e.id}`, { cookie: hr })).body;
    expect(view.profile.pan).toBe(`${p.slice(0, 2)}XXXXX${p.slice(-2)}`);
    expect(JSON.stringify(view)).not.toContain(p);
    expect((await db.orm.app.EmployeeStatutory.where({ employeeId: e.id as never }).first())?.pan).toBe(p);

    const dup = await request('POST', '/employees', { cookie: hr, body: newBody({ pan: p }) });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toMatchObject({ code: 'DUPLICATE_PERSON', details: { matches: [{ field: 'pan', id: e.id }] } });

    for (const bad of ['ABCDE1234', 'ABCDE12345', '1BCDE1234F', 'ABCXE1234F', 'ABCDE1234FF']) {
      expect((await request('POST', '/employees', { cookie: hr, body: newBody({ pan: bad }) })).status, bad).toBe(422);
    }
    const audited = JSON.stringify(await auditRows('employee.create', e.id));
    expect(audited).not.toContain(p);
    expect(audited).toContain(`${p.slice(0, 2)}XXXXX${p.slice(-2)}`);
  });

  test('M3-PRF-04 AC1: a PAN can be changed or cleared on edit, but not to another person’s; the database also refuses a duplicate', async () => {
    const a = await newEmployee({ pan: pan() });
    const b = await newEmployee({ pan: pan() });
    const aPan = (await db.orm.app.EmployeeStatutory.where({ employeeId: a.id as never }).first())!.pan!;
    const clash = await request('PATCH', `/employees/${b.id}`, { cookie: hr, body: { pan: aPan } });
    expect(clash.status).toBe(409);
    await expect(db.orm.app.EmployeeStatutory.where({ employeeId: b.id as never }).update({ pan: aPan } as never)).rejects.toThrow();
    const fresh = pan();
    expect((await request('PATCH', `/employees/${b.id}`, { cookie: hr, body: { pan: fresh } })).body.pan).toBe(`${fresh.slice(0, 2)}XXXXX${fresh.slice(-2)}`);
    expect((await request('PATCH', `/employees/${b.id}`, { cookie: hr, body: { pan: null } })).body.pan).toBeNull();
    await expect(db.orm.app.EmployeeStatutory.where({ employeeId: b.id as never }).update({ pan: 'abcde1234f' } as never)).rejects.toThrow();
  });
});

describe('Aadhaar', () => {
  test('M3-PRF-05 AC1 AC2: the number is checksum-checked, stored only encrypted in the vault, and the profile keeps the last 4', async () => {
    const e = await newEmployee();
    const num = aadhaar();
    const bad = await request('PUT', `/employees/${e.id}/aadhaar`, { cookie: hr, body: { aadhaarNumber: num.slice(0, 11) + ((Number(num[11]) + 1) % 10) } });
    expect(bad.status).toBe(422);
    expect(JSON.stringify(bad.body)).toContain('aadhaarNumber');
    for (const short of ['12345', '123456789012', `0${num.slice(1)}`, `${num.slice(0, 11)}x`]) {
      expect((await request('PUT', `/employees/${e.id}/aadhaar`, { cookie: hr, body: { aadhaarNumber: short } })).status, short).toBe(422);
    }

    const spaced = `${num.slice(0, 4)} ${num.slice(4, 8)} ${num.slice(8)}`;
    const ok = await request('PUT', `/employees/${e.id}/aadhaar`, { cookie: hr, body: { aadhaarNumber: spaced } });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ aadhaar: `XXXX XXXX ${num.slice(-4)}`, hasCardImage: false });
    expect((await request('GET', `/employees/${e.id}`, { cookie: hr })).body.profile.aadhaar).toBe(`XXXX XXXX ${num.slice(-4)}`);

    const row = await db.orm.app.Employee.where({ id: e.id as never }).first();
    expect(row?.aadhaarLast4).toBe(num.slice(-4));
    const vault = await db.orm.vault.AadhaarRecord.where({ employeeId: e.id as never }).first();
    expect(vault).toMatchObject({ last4: num.slice(-4), lookupHmac: lookupHmac(num) });
    expect(Buffer.from(vault!.aadhaarEnc as Uint8Array).toString('utf8')).not.toContain(num);
    expect(JSON.stringify(await auditRows('employee.aadhaar_set', e.id))).not.toContain(num);
    expect(JSON.stringify(row)).not.toContain(num);
  });

  test('M3-PRF-05 AC4: an Aadhaar already on another employee or a daily-wage worker → 409 DUPLICATE_PERSON with a link / convert offer', async () => {
    const a = await newEmployee();
    const b = await newEmployee();
    const num = aadhaar();
    expect((await request('PUT', `/employees/${a.id}/aadhaar`, { cookie: hr, body: { aadhaarNumber: num } })).status).toBe(200);
    const dup = await request('PUT', `/employees/${b.id}/aadhaar`, { cookie: payroll, body: { aadhaarNumber: num } });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toMatchObject({ code: 'DUPLICATE_PERSON', details: { matches: [{ field: 'aadhaar', kind: 'EMPLOYEE', id: a.id, link: `/employees/${a.id}` }] } });

    const worker = await newDailyWorker();
    const dw = await request('PUT', `/employees/${b.id}/aadhaar`, { cookie: hr, body: { aadhaarNumber: worker.aadhaar } });
    expect(dw.status).toBe(409);
    expect(dw.body.error.details.matches[0]).toMatchObject({ kind: 'DAILY_WORKER', id: worker.id, offer: 'CONVERT_DAILY_WORKER' });
    expect((await db.orm.app.Employee.where({ id: b.id as never }).first())?.aadhaarLast4).toBeNull();
  });

  test('M3-PRF-05 AC2: the card image is stored in the encrypted store and its key is kept in the vault, not on the profile', async () => {
    const e = await newEmployee();
    const res = await request('PUT', `/employees/${e.id}/aadhaar`, { cookie: hr, body: { aadhaarNumber: aadhaar(), cardImageBase64: (await png(400, 250)).toString('base64') } });
    expect(res.body.hasCardImage).toBe(true);
    const vault = await db.orm.vault.AadhaarRecord.where({ employeeId: e.id as never }).first();
    expect(vault?.cardImageKey).toMatch(/^aadhaar\//);
    expect((await container.cradle.storage.get(vault!.cardImageKey!)).byteLength).toBeGreaterThan(0);
    const bad = await request('PUT', `/employees/${(await newEmployee()).id}/aadhaar`, { cookie: hr, body: { aadhaarNumber: aadhaar(), cardImageBase64: Buffer.from('not an image '.repeat(20)).toString('base64') } });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe('IMAGE_INVALID');
  });
  // M3-PRF-05 AC3 n/a: masking the first 8 digits on the card image needs OCR/redaction; the image is stored as-is
  // (user decision, 2026-11-16) and masking is a launch blocker in docs/GO-LIVE.md.

  test('M3-PRF-08 AC1: a saved Aadhaar is fixed for HR; an Admin may correct it with a reason, which is audited without the number', async () => {
    const e = await newEmployee();
    const first = aadhaar();
    await request('PUT', `/employees/${e.id}/aadhaar`, { cookie: hr, body: { aadhaarNumber: first } });

    const second = aadhaar();
    const hrTry = await request('PUT', `/employees/${e.id}/aadhaar`, { cookie: hr, body: { aadhaarNumber: second, reason: 'typo' } });
    expect(hrTry.status).toBe(403);
    expect(hrTry.body.error.code).toBe('AADHAAR_LOCKED');
    const noReason = await request('PUT', `/employees/${e.id}/aadhaar`, { cookie: admin, body: { aadhaarNumber: second } });
    expect(noReason.status).toBe(422);
    expect(JSON.stringify(noReason.body)).toContain('reason');

    const fixed = await request('PUT', `/employees/${e.id}/aadhaar`, { cookie: admin, body: { aadhaarNumber: second, reason: 'Card re-checked: digits were swapped' } });
    expect(fixed.status).toBe(200);
    expect(fixed.body.aadhaar).toBe(`XXXX XXXX ${second.slice(-4)}`);
    const vault = await db.orm.vault.AadhaarRecord.where({ employeeId: e.id as never }).first();
    expect(vault?.lookupHmac).toBe(lookupHmac(second));
    expect(last4(second)).toBe(vault?.last4);
    const rows = await auditRows('employee.aadhaar_correct', e.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reason: 'Card re-checked: digits were swapped' });
    expect(JSON.stringify(rows)).not.toContain(first);
    expect(JSON.stringify(rows)).not.toContain(second);
    // saving the same number again is not a clash with itself
    expect((await request('PUT', `/employees/${e.id}/aadhaar`, { cookie: admin, body: { aadhaarNumber: second, reason: 'again' } })).status).toBe(200);
  });
});

async function newDailyWorker() {
  const num = aadhaar();
  const w = await db.orm.app.DailyWorker.create({ code: `DT${next()}`, name: `Daily Worker ${next()}`, mobile: `+91${mobile()}` } as never);
  await db.orm.vault.AadhaarRecord.create({ dailyWorkerId: w.id, aadhaarEnc: encrypt(num), keyVersion: KEY_VERSION, lookupHmac: lookupHmac(num), last4: last4(num) } as never);
  return { id: w.id, mobile: w.mobile!, aadhaar: num };
}

describe('duplicate person check', () => {
  test('M3-PRF-06 AC1: PAN and mobile are hard blocks on create and on the check endpoint, with a link to the existing profile', async () => {
    const p = pan();
    const e = await newEmployee({ pan: p });
    const check = await request('POST', '/employees/duplicate-check', { cookie: hr, body: { pan: p, mobile: e.mobile } });
    expect(check.status).toBe(200);
    expect(check.body.matches.map((m: any) => [m.field, m.id, m.blocking, m.link])).toEqual([
      ['pan', e.id, true, `/employees/${e.id}`],
      ['mobile', e.id, true, `/employees/${e.id}`],
    ]);
    expect((await request('POST', '/employees/duplicate-check', { cookie: hr, body: { mobile: mobile() } })).body.matches).toEqual([]);
    expect((await request('POST', '/employees/duplicate-check', { cookie: hr, body: {} })).status).toBe(422);
    const num = aadhaar();
    await request('PUT', `/employees/${e.id}/aadhaar`, { cookie: hr, body: { aadhaarNumber: num } });
    const byAadhaar = await request('POST', '/employees/duplicate-check', { cookie: hr, body: { aadhaarNumber: num } });
    expect(byAadhaar.body.matches).toMatchObject([{ field: 'aadhaar', id: e.id, blocking: true }]);
    // UAN
    await db.orm.app.EmployeeStatutory.where({ employeeId: e.id as never }).update({ uan: String(100000000000 + (n % 800000000000)) } as never);
    const uan = (await db.orm.app.EmployeeStatutory.where({ employeeId: e.id as never }).first())!.uan!;
    expect((await request('POST', '/employees/duplicate-check', { cookie: hr, body: { uan } })).body.matches).toMatchObject([{ field: 'uan', id: e.id, blocking: true }]);
  });

  test('M3-PRF-06 AC2: the same name and date of birth is a warning only: the profile is still created', async () => {
    const name = `Warn Twin ${next()}`;
    const first = await newEmployee({ name, dob: '1990-01-20' });
    const second = await request('POST', '/employees', { cookie: hr, body: newBody({ name: name.toUpperCase(), dob: '1990-01-20' }) });
    expect(second.status).toBe(201);
    expect(second.body.warnings).toMatchObject([{ field: 'name_dob', id: first.id, blocking: false }]);
    expect(second.body.id).not.toBe(first.id);
    const other = await request('POST', '/employees', { cookie: hr, body: newBody({ name, dob: '1990-01-21' }) });
    expect(other.body.warnings).toEqual([]);
  });

  test('M3-PRF-06 AC3: an exited match is offered REHIRE; an exited person’s PAN still blocks a new profile, but their released mobile does not', async () => {
    const p = pan();
    const e = await newEmployee({ pan: p });
    await db.orm.app.Employee.where({ id: e.id as never }).update({ status: 'EXITED', exitDate: Temporal.PlainDate.from('2026-11-10') } as never);
    const byPan = await request('POST', '/employees', { cookie: hr, body: newBody({ pan: p }) });
    expect(byPan.status).toBe(409);
    expect(byPan.body.error.details.matches[0]).toMatchObject({ id: e.id, status: 'EXITED', offer: 'REHIRE' });
    const byMobile = await request('POST', '/employees/duplicate-check', { cookie: hr, body: { mobile: e.mobile } });
    expect(byMobile.body.matches).toMatchObject([{ id: e.id, offer: 'REHIRE', blocking: false }]);
  });

  test('M3-PRF-06 AC4: a daily-wage worker with the same mobile blocks a new profile and is offered CONVERT_DAILY_WORKER', async () => {
    const w = await newDailyWorker();
    const res = await request('POST', '/employees', { cookie: hr, body: newBody({ mobile: w.mobile }) });
    expect(res.status).toBe(409);
    expect(res.body.error.details.matches[0]).toMatchObject({ kind: 'DAILY_WORKER', id: w.id, offer: 'CONVERT_DAILY_WORKER', blocking: true });
  });
});

describe('view', () => {
  test('M3-PRF-07 AC1 AC2: HQ gets profile, deployment, masked bank, statutory, documents and leave balances; nothing sensitive in the clear', async () => {
    const seeded = (await db.orm.app.Employee.where({ code: 'RS000001' as never }).first())!;
    const res = await request('GET', `/employees/${seeded.id}`, { cookie: hr });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['bank', 'currentDeployment', 'documents', 'leaveBalances', 'profile', 'statutory']);
    expect(res.body.profile).toMatchObject({ code: 'RS000001', name: 'Ramesh Yadav' });
    expect(res.body.profile.dob).toMatch(/^\d{4}-XX-XX$/);
    expect(res.body.currentDeployment).toMatchObject({ siteCode: expect.any(String), clientName: expect.any(String) });
    expect(res.body.bank.accountMasked).toMatch(/^XXXXXX\d{4}$/);
    expect(res.body.leaveBalances.length).toBeGreaterThan(0);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(seeded.dob.toString());
    expect(text).not.toContain('accountEnc');
    // Every HQ role reads the same masked page; AUDITOR and ACCOUNTS included.
    for (const cookie of [admin, payroll, accounts, auditor]) {
      expect((await request('GET', `/employees/${seeded.id}`, { cookie })).status).toBe(200);
    }
    expect((await request('GET', `/employees/${NIL}`, { cookie: hr })).status).toBe(404);
    expect((await request('GET', '/employees/not-a-uuid', { cookie: hr })).status).toBe(422);
  });

  test('M3-PRF-07 AC1: an employee sees their own page, and 404 for anyone else’s', async () => {
    const own = (await db.orm.app.Employee.where({ code: 'RS000001' as never }).first())!;
    expect((await request('GET', `/employees/${own.id}`, { cookie: employee })).status).toBe(200);
    const other = (await db.orm.app.Employee.where({ code: 'RS000002' as never }).first())!;
    expect((await request('GET', `/employees/${other.id}`, { cookie: employee })).status).toBe(404);
  });

  test('M3-PRF-07 AC3: a supervisor gets a reduced view of workers on their site, and 404 for others', async () => {
    const mine = (await request('GET', '/me', { cookie: supA })).body.siteIds as string[];
    const theirs = (await request('GET', '/me', { cookie: supB })).body.siteIds as string[];
    expect(mine.length).toBeGreaterThan(0);
    const workerOn = async (siteIds: string[], not: string[] = []) => {
      const deps = await db.orm.app.Deployment.where((d) => d.siteId.in(siteIds as never[])).all();
      return deps.find((d) => d.effectiveTo == null && !not.includes(d.siteId));
    };
    const inScope = (await workerOn(mine))!;
    const res = await request('GET', `/employees/${inScope.employeeId}`, { cookie: supA });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['code', 'designation', 'hasPhoto', 'id', 'mobile', 'name', 'site']);
    expect(res.body.site.id).toBe(inScope.siteId);
    const outOfScope = (await workerOn(theirs, mine))!;
    expect((await request('GET', `/employees/${outOfScope.employeeId}`, { cookie: supA })).status).toBe(404);
    // a Draft with no deployment is not visible to a supervisor either
    const draft = await newEmployee();
    expect((await request('GET', `/employees/${draft.id}`, { cookie: supA })).status).toBe(404);
  });
});

describe('edit', () => {
  test('M3-PRF-08 AC1: the code, mobile and Aadhaar cannot be edited → 422; an empty edit is refused', async () => {
    const e = await newEmployee();
    for (const field of [{ code: 'RS000999' }, { mobile: mobile() }, { aadhaarNumber: aadhaar() }, { aadhaar: aadhaar() }, { status: 'ACTIVE' }]) {
      const res = await request('PATCH', `/employees/${e.id}`, { cookie: hr, body: field });
      expect(res.status, JSON.stringify(field)).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    }
    expect((await request('PATCH', `/employees/${e.id}`, { cookie: hr, body: {} })).status).toBe(422);
    expect((await request('PATCH', `/employees/${NIL}`, { cookie: hr, body: { name: 'X' } })).status).toBe(404);
  });

  test('M3-PRF-08 AC2: an edit changes only what was sent and writes one audit row with before/after, DOB masked', async () => {
    const e = await newEmployee({ dob: '1991-07-09', designation: 'Helper' });
    const res = await request('PATCH', `/employees/${e.id}`, { cookie: payroll, body: { name: ' Corrected Name ', dob: '1992-08-10', designation: 'Fitter', maritalStatus: 'SINGLE' } });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Corrected Name', designation: 'Fitter', maritalStatus: 'SINGLE', dob: '1992-XX-XX', mobile: `+91${e.mobile.slice(-10)}`, code: e.code });
    const rows = await auditRows('employee.update', e.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.before).toMatchObject({ name: e.name, dob: '1991-XX-XX', designation: 'Helper' });
    expect(rows[0]?.after).toMatchObject({ name: 'Corrected Name', dob: '1992-XX-XX', designation: 'Fitter' });
    expect(Object.keys(rows[0]!.after as object)).not.toContain('mobile');
    expect(JSON.stringify(rows)).not.toContain('1992-08-10');
    expect((await request('PATCH', `/employees/${e.id}`, { cookie: hr, body: { currentAddress: { line: 'New lane', stateCode: 'ZZ', pin: '462023' } } })).status).toBe(409);
    expect((await request('PATCH', `/employees/${e.id}`, { cookie: hr, body: { email: null, fatherName: null } })).status).toBe(200);
  });

  test('M3-PRF-08 AC1: a date of birth or joining date that makes the person under 18 is refused on edit too', async () => {
    const e = await newEmployee({ dob: '1995-04-12', joinDate: '2026-11-01' });
    const dob = await request('PATCH', `/employees/${e.id}`, { cookie: hr, body: { dob: '2015-01-01' } });
    expect(dob.status).toBe(422);
    expect(dob.body.error.code).toBe('UNDERAGE');
    expect((await request('PATCH', `/employees/${e.id}`, { cookie: hr, body: { joinDate: '2010-01-01' } })).body.error.code).toBe('UNDERAGE');
  });
});
