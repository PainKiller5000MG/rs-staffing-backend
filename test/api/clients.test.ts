// Clients end to end against the seeded database (npm run seed:reset).
// Every client these tests create has a unique code/GSTIN, so reruns need no reset.
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { mapError } from '../../src/core/error-handler.ts';
import { gstinCheckChar } from '../../src/lib/tax-ids.ts';
import { db } from '../../src/prisma/db.ts';
import { mobileOf, testApp } from '../helpers.ts';

const { request, login } = testApp();
let admin: string;
let hr: string;
let payroll: string;
let accounts: string;
let auditor: string;
let supA: string;
let employee: string;

let counter = Date.now() % 100_000_000;
const uniq = () => ++counter;
const codeOf = () => `T${uniq()}`;
/** A GSTIN with a correct check character and its matching PAN. */
function taxIds() {
  const pan = `AAPFU${String(uniq() % 10000).padStart(4, '0')}F`;
  const first14 = `27${pan}1Z`;
  return { gstin: first14 + gstinCheckChar(first14), pan };
}
const body = (over: Record<string, unknown> = {}) => ({ code: codeOf(), name: 'Test Client Pvt Ltd', stateCode: 'MP', ...over });
const NIL = '00000000-0000-7000-8000-000000000000';

async function newClient(over: Record<string, unknown> = {}) {
  const res = await request('POST', '/clients', { cookie: hr, body: body(over) });
  expect(res.status).toBe(201);
  return res.body as { id: string; code: string };
}
const auditRows = (action: string, entityId: string) =>
  db.orm.audit.AuditLog.where({ action: action as never, entityId: entityId as never }).all();

beforeAll(async () => {
  admin = await login(mobileOf('admin'));
  hr = await login(mobileOf('hr'));
  payroll = await login(mobileOf('payroll'));
  accounts = await login(mobileOf('accounts'));
  auditor = await login(mobileOf('auditor'));
  supA = await login(mobileOf('supA'));
  employee = await login(mobileOf('employee'));
});
afterAll(() => db.close());

describe('access', () => {
  test('M2-CLI-01 AC1: no session → 401; employees → 403; supervisors cannot write or see contacts and expiry', async () => {
    expect((await request('GET', '/clients')).status).toBe(401);
    expect((await request('GET', '/clients', { cookie: employee })).status).toBe(403);
    expect((await request('POST', '/clients', { cookie: employee, body: body() })).status).toBe(403);
    expect((await request('POST', '/clients', { cookie: supA, body: body() })).status).toBe(403);
    expect((await request('PATCH', `/clients/${NIL}`, { cookie: supA, body: { name: 'X' } })).status).toBe(403);
    expect((await request('POST', '/clients/import', { cookie: supA, body: { rows: [body()] } })).status).toBe(403);
    expect((await request('GET', `/clients/${NIL}/contacts`, { cookie: supA })).status).toBe(403);
    expect((await request('GET', '/clients/expiring', { cookie: supA })).status).toBe(403);
  });

  test('M2-CLI-04 AC1 AC2: a supervisor sees only the clients of their sites, counted over their own sites; any other client → 404', async () => {
    // supA: NTX-BPL, NTX-MDP, VHC-IDR → NTX (2 sites) and VHC (1 of its 2 sites); never CCW.
    const list = await request('GET', '/clients', { cookie: supA });
    expect(list.status).toBe(200);
    const rows = new Map<string, { id: string; siteCount: number }>(list.body.items.map((c: { code: string }) => [c.code, c]));
    expect([...rows.keys()].sort()).toEqual(['NTX', 'VHC']);
    expect(rows.get('NTX')).toMatchObject({ siteCount: 2 });
    expect(rows.get('VHC')).toMatchObject({ siteCount: 1 });

    const all = (await request('GET', '/clients?q=CCW', { cookie: hr })).body.items[0];
    const outside = await request('GET', `/clients/${all.id}`, { cookie: supA });
    const missing = await request('GET', `/clients/${NIL}`, { cookie: supA });
    expect(outside.status).toBe(404);
    expect({ ...outside.body.error, requestId: null }).toEqual({ ...missing.body.error, requestId: null });
    expect((await request('GET', `/clients/${rows.get('NTX')!.id}`, { cookie: supA })).status).toBe(200);
    expect((await request('GET', '/clients?q=CCW', { cookie: supA })).body.items).toEqual([]);
  });

  test('M2-CLI-01 AC1: the auditor and accounts can read but not write', async () => {
    for (const cookie of [auditor, accounts]) {
      expect((await request('GET', '/clients', { cookie })).status).toBe(200);
      expect(await request('POST', '/clients', { cookie, body: body() })).toMatchObject({ status: 403, body: { error: { code: 'FORBIDDEN' } } });
    }
    const c = await newClient();
    expect((await request('PATCH', `/clients/${c.id}`, { cookie: auditor, body: { name: 'X' } })).status).toBe(403);
    expect((await request('POST', `/clients/${c.id}/contacts`, { cookie: auditor, body: { name: 'A', role: 'HR' } })).status).toBe(403);
    expect((await request('POST', '/clients/import', { cookie: auditor, body: { rows: [body()] } })).status).toBe(403);
  });

  test('M2-CLI-01 AC1: unknown id → 404 NOT_FOUND', async () => {
    expect(await request('GET', `/clients/${NIL}`, { cookie: hr })).toMatchObject({ status: 404, body: { error: { code: 'NOT_FOUND' } } });
    expect((await request('PATCH', `/clients/${NIL}`, { cookie: hr, body: { name: 'X' } })).status).toBe(404);
    expect((await request('GET', `/clients/${NIL}/contacts`, { cookie: hr })).status).toBe(404);
  });
});

describe('M2-CLI-01 create client', () => {
  test('M2-CLI-01 AC1 AC2 AC5: required and optional fields are stored; the create is audited with before/after', async () => {
    const { gstin, pan } = taxIds();
    const input = body({
      gstin,
      pan,
      registeredAddress: '1 Mill Road, Pune',
      billingAddress: 'Accounts Dept, Pune',
      contractStart: '2026-04-01',
      contractEnd: '2027-03-31',
      workOrderNumber: 'WO/2026/114',
    });
    const res = await request('POST', '/clients', { cookie: hr, body: input });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ...input, status: 'ACTIVE' });
    expect(res.body.pfEstablishmentId).toEqual(expect.any(String));

    const [row] = await auditRows('client.create', res.body.id);
    expect(row).toBeDefined();
    expect(row!.before).toBeNull();
    expect(row!.after).toMatchObject({ shortCode: input.code, name: input.name, gstin });
    // PAN is masked in the audit trail.
    expect((row!.after as { pan: string }).pan).toMatch(/^AAXXXXX.F$/);
  });

  test('M2-CLI-01 AC1: only name, code and state are required', async () => {
    const res = await request('POST', '/clients', { cookie: payroll, body: body() });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ gstin: null, pan: null, contractStart: null, workOrderNumber: null });
  });

  test('M2-CLI-01 AC1 AC2: missing, blank, over-long and malformed fields → 422 with field paths', async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ name: undefined }, 'name'],
      [{ name: '   ' }, 'name'],
      [{ name: 'x'.repeat(201) }, 'name'],
      [{ code: undefined }, 'code'],
      [{ stateCode: undefined }, 'stateCode'],
      [{ stateCode: 'mp' }, 'stateCode'],
      [{ workOrderNumber: 'w'.repeat(61) }, 'workOrderNumber'],
      [{ contractStart: '2026-13-40' }, 'contractStart'],
      [{ contractStart: '2027-01-01', contractEnd: '2026-01-01' }, 'contractEnd'],
      [{ pan: 'not-a-pan' }, 'pan'],
    ];
    for (const [over, path] of cases) {
      const res = await request('POST', '/clients', { cookie: hr, body: body(over) });
      expect(res.status, JSON.stringify(over)).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain(path);
    }
  });

  test('M2-CLI-01 AC1: unknown state or establishment → 409 REFERENCE_MISSING', async () => {
    expect(await request('POST', '/clients', { cookie: hr, body: body({ stateCode: 'ZZ' }) })).toMatchObject({ status: 409, body: { error: { code: 'REFERENCE_MISSING' } } });
    const res = await request('POST', '/clients', { cookie: hr, body: body({ pfEstablishmentId: NIL }) });
    expect(res).toMatchObject({ status: 409, body: { error: { code: 'REFERENCE_MISSING' } } });
  });

  test('M2-CLI-01 AC3: a bad GSTIN format or check digit → 422; a PAN that disagrees with the GSTIN → 422', async () => {
    const { gstin, pan } = taxIds();
    const wrongCheck = gstin.slice(0, 14) + (gstin[14] === 'A' ? 'B' : 'A');
    for (const [over, path] of [
      [{ gstin: 'short' }, 'gstin'],
      [{ gstin: gstin.toLowerCase() }, 'gstin'],
      [{ gstin: wrongCheck }, 'gstin'],
      [{ gstin, pan: 'AAPFU9999F' }, 'pan'],
    ] as const) {
      const res = await request('POST', '/clients', { cookie: hr, body: body(over) });
      expect(res.status).toBe(422);
      expect(res.body.error.details[0].path).toBe(path);
    }
    expect((await request('POST', '/clients', { cookie: hr, body: body({ gstin, pan }) })).status).toBe(201);
  });

  test('M2-CLI-01 AC3: a GSTIN already on another client → 409 DUPLICATE', async () => {
    const { gstin } = taxIds();
    await newClient({ gstin });
    expect(await request('POST', '/clients', { cookie: hr, body: body({ gstin }) })).toMatchObject({
      status: 409,
      body: { error: { code: 'DUPLICATE', details: { fields: ['gstin'] } } },
    });
  });

  test('M2-CLI-01 AC4: short code must be uppercase, 3–20 characters, untrimmed or lower-case → 422', async () => {
    for (const code of ['AB', 'A'.repeat(21), 'tata-pune', ' TATA-PUNE', 'TATA PUNE', '-ABC']) {
      const res = await request('POST', '/clients', { cookie: hr, body: body({ code }) });
      expect(res.status, code).toBe(422);
      expect(res.body.error.details[0].path).toBe('code');
    }
    expect((await request('POST', '/clients', { cookie: hr, body: body({ code: `T${uniq()}`.padEnd(20, 'X') }) })).status).toBe(201);
  });

  test('M2-CLI-01 AC1 AC4: a duplicate short code → 409 DUPLICATE', async () => {
    const c = await newClient();
    expect(await request('POST', '/clients', { cookie: hr, body: body({ code: c.code }) })).toMatchObject({
      status: 409,
      body: { error: { code: 'DUPLICATE', details: { fields: ['code'] } } },
    });
  });

  test('M2-CLI-01 AC4: the database refuses a lower-case code and a short code even if the API were bypassed', async () => {
    const pf = (await db.orm.app.Establishment.where({ type: 'PF' }).first())!;
    const esi = (await db.orm.app.Establishment.where({ type: 'ESI' }).first())!;
    await expect(
      db.orm.app.Client.create({ code: 'low', name: 'x', stateCode: 'MP', pfEstablishmentId: pf.id, esiEstablishmentId: esi.id } as never),
    ).rejects.toThrow();
  });
});

describe('M2-CLI-03 edit client', () => {
  test('M2-CLI-03 AC1 AC2: edits change only the sent fields, can clear optional ones, and are audited with before/after', async () => {
    const { gstin, pan } = taxIds();
    const c = await newClient({ gstin, pan, workOrderNumber: 'WO-1', billingAddress: 'Old address' });
    const res = await request('PATCH', `/clients/${c.id}`, { cookie: hr, body: { name: 'Renamed Ltd', workOrderNumber: null, stateCode: 'RJ' } });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Renamed Ltd', workOrderNumber: null, stateCode: 'RJ', billingAddress: 'Old address', gstin, code: c.code });

    const [row] = await auditRows('client.update', c.id);
    expect(row!.before).toEqual({ name: 'Test Client Pvt Ltd', workOrderNumber: 'WO-1', stateCode: 'MP' });
    expect(row!.after).toEqual({ name: 'Renamed Ltd', workOrderNumber: null, stateCode: 'RJ' });
  });

  test('M2-CLI-03 AC1: the short code is editable until payroll has run', async () => {
    const c = await newClient();
    const next = codeOf();
    expect(await request('PATCH', `/clients/${c.id}`, { cookie: hr, body: { code: next } })).toMatchObject({ status: 200, body: { code: next } });
    // The audit trail still records the code change.
    const [row] = await auditRows('client.update', c.id);
    expect(row!.after).toMatchObject({ shortCode: next });
  });

  test('M2-CLI-03 AC1: after a payroll run the short code is locked (422 CODE_LOCKED); other fields stay editable', async () => {
    const c = await newClient();
    await db.orm.app.PayrollRun.create({
      clientId: c.id,
      type: 'REGULAR',
      periodFrom: Temporal.PlainDate.from('2026-10-01'),
      periodTo: Temporal.PlainDate.from('2026-10-31'),
      status: 'COMPUTED',
    } as never);
    expect(await request('PATCH', `/clients/${c.id}`, { cookie: hr, body: { code: codeOf() } })).toMatchObject({
      status: 422,
      body: { error: { code: 'CODE_LOCKED' } },
    });
    expect((await request('GET', `/clients/${c.id}`, { cookie: hr })).body.code).toBe(c.code);
    expect((await request('PATCH', `/clients/${c.id}`, { cookie: hr, body: { code: c.code, name: 'Still editable' } })).status).toBe(200);
  });

  test('M2-CLI-01 AC4: the database itself refuses a code change after payroll has run (trigger), even around the service', async () => {
    const c = await newClient();
    const run = {
      clientId: c.id, type: 'REGULAR', periodFrom: Temporal.PlainDate.from('2026-10-01'), periodTo: Temporal.PlainDate.from('2026-10-31'),
    };
    await db.orm.app.PayrollRun.create({ ...run, status: 'DRAFT' } as never);
    // A draft run does not lock it, so the direct update below succeeds and rolls back.
    await db.transaction(async (tx) => {
      await tx.orm.app.Client.where({ id: c.id as never }).update({ code: codeOf() } as never);
      throw new Error('rollback');
    }).catch((e: Error) => expect(e.message).toBe('rollback'));
    await db.orm.app.PayrollRun.create({
      ...run, periodFrom: Temporal.PlainDate.from('2026-11-01'), periodTo: Temporal.PlainDate.from('2026-11-30'), status: 'LOCKED',
    } as never);
    let err: unknown;
    await db.transaction(async (tx) => {
      await tx.orm.app.Client.where({ id: c.id as never }).update({ code: codeOf() } as never);
    }).catch((e: unknown) => (err = e));
    expect(err).toBeDefined();
    expect(mapError(err)).toMatchObject({ status: 422, code: 'CODE_LOCKED' });
    expect((await db.orm.app.Client.first({ id: c.id as never }))!.code).toBe(c.code);
  });

  test('M2-CLI-03 AC1: a draft run does not lock the code', async () => {
    const c = await newClient();
    await db.orm.app.PayrollRun.create({
      clientId: c.id, type: 'REGULAR', periodFrom: Temporal.PlainDate.from('2026-10-01'), periodTo: Temporal.PlainDate.from('2026-10-31'), status: 'DRAFT',
    } as never);
    expect((await request('PATCH', `/clients/${c.id}`, { cookie: hr, body: { code: codeOf() } })).status).toBe(200);
  });

  test('M2-CLI-03 AC1: validation and duplicates on edit → 422 / 409', async () => {
    const a = await newClient({ contractStart: '2026-04-01' });
    const b = await newClient();
    for (const [over, status] of [
      [{}, 422],
      [{ name: '' }, 422],
      [{ code: 'lower' }, 422],
      [{ contractEnd: '2026-01-01' }, 422], // before the stored start
      [{ code: b.code }, 409],
      [{ stateCode: 'ZZ' }, 409],
    ] as const) {
      expect((await request('PATCH', `/clients/${a.id}`, { cookie: hr, body: over })).status, JSON.stringify(over)).toBe(status);
    }
    const { gstin } = taxIds();
    await newClient({ gstin });
    expect(await request('PATCH', `/clients/${a.id}`, { cookie: hr, body: { gstin } })).toMatchObject({ status: 409, body: { error: { code: 'DUPLICATE' } } });
  });
});

describe('M2-CLI-02 contacts', () => {
  test('M2-CLI-02 AC1: several contacts with name, role, email, phone; a bad role, email or blank name → 422', async () => {
    const c = await newClient();
    const post = (b: unknown) => request('POST', `/clients/${c.id}/contacts`, { cookie: hr, body: b });
    expect(await post({ name: 'Asha', role: 'HR', email: 'Asha@Client.test ', phone: '+91 98765 43210' })).toMatchObject({
      status: 201,
      body: { name: 'Asha', role: 'HR', email: 'asha@client.test', isAttendanceSender: false, status: 'ACTIVE' },
    });
    expect((await post({ name: 'Ravi', role: 'ACCOUNTS' })).status).toBe(201);
    expect((await post({ name: 'Site Man', role: 'SITE_INCHARGE' })).status).toBe(201);
    expect((await post({ name: 'Other', role: 'OTHER' })).status).toBe(201);
    for (const bad of [{ name: 'X', role: 'BOSS' }, { name: 'X', role: 'HR', email: 'nope' }, { name: '  ', role: 'HR' }, { role: 'HR' }]) {
      expect((await post(bad)).status).toBe(422);
    }
    const list = await request('GET', `/clients/${c.id}/contacts`, { cookie: auditor });
    expect(list.body.items.map((x: { role: string }) => x.role).sort()).toEqual(['ACCOUNTS', 'HR', 'OTHER', 'SITE_INCHARGE']);
    const [row] = await auditRows('client_contact.create', list.body.items[0].id);
    expect(row).toBeDefined();
  });

  test('M2-CLI-02 AC2: one attendance sender per client — marking another moves the mark; it needs an email', async () => {
    const c = await newClient();
    const post = (b: unknown) => request('POST', `/clients/${c.id}/contacts`, { cookie: hr, body: b });
    const a = (await post({ name: 'Asha', role: 'HR', email: 'a@client.test', isAttendanceSender: true })).body;
    const b = (await post({ name: 'Ravi', role: 'OTHER', email: 'r@client.test' })).body;
    const noMail = (await post({ name: 'No Mail', role: 'OTHER' })).body;
    expect(a.isAttendanceSender).toBe(true);

    expect((await post({ name: 'Sender no mail', role: 'HR', isAttendanceSender: true })).status).toBe(422);
    expect(await request('PATCH', `/clients/${c.id}/contacts/${noMail.id}`, { cookie: hr, body: { isAttendanceSender: true } })).toMatchObject({
      status: 422,
      body: { error: { code: 'SENDER_NEEDS_EMAIL' } },
    });

    expect((await request('PATCH', `/clients/${c.id}/contacts/${b.id}`, { cookie: hr, body: { isAttendanceSender: true } })).status).toBe(200);
    const list = (await request('GET', `/clients/${c.id}/contacts`, { cookie: hr })).body.items;
    expect(list.filter((x: { isAttendanceSender: boolean }) => x.isAttendanceSender).map((x: { id: string }) => x.id)).toEqual([b.id]);

    // Removing the sender keeps the row (never deleted) and ends the mark; another can then be marked.
    const removed = await request('PATCH', `/clients/${c.id}/contacts/${b.id}`, { cookie: hr, body: { status: 'INACTIVE' } });
    expect(removed.body).toMatchObject({ status: 'INACTIVE', isAttendanceSender: false });
    expect((await request('PATCH', `/clients/${c.id}/contacts/${a.id}`, { cookie: hr, body: { isAttendanceSender: true } })).status).toBe(200);
    expect(await auditRows('client_contact.update', a.id)).not.toHaveLength(0);
  });

  test('M2-CLI-02 AC2: the database allows at most one active sender per client', async () => {
    const c = await newClient();
    const mk = (n: string) =>
      db.orm.app.ClientContact.create({ clientId: c.id, name: n, role: 'HR', email: `${n}@x.test`, isAttendanceSender: true } as never);
    await mk('one');
    await expect(mk('two')).rejects.toThrow();
  });

  test('M2-CLI-02 AC1: a contact id from another client → 404', async () => {
    const c1 = await newClient();
    const c2 = await newClient();
    const contact = (await request('POST', `/clients/${c1.id}/contacts`, { cookie: hr, body: { name: 'A', role: 'HR' } })).body;
    expect((await request('PATCH', `/clients/${c2.id}/contacts/${contact.id}`, { cookie: hr, body: { name: 'B' } })).status).toBe(404);
    expect((await request('PATCH', `/clients/${c1.id}/contacts/${NIL}`, { cookie: hr, body: { name: 'B' } })).status).toBe(404);
  });
});

describe('M2-CLI-04 list and search', () => {
  test('M2-CLI-04 AC1 AC2: search by name, code and GSTIN is case-insensitive; rows carry site and deployed-employee counts', async () => {
    const byName = await request('GET', '/clients?q=narmada', { cookie: hr });
    expect(byName.body.items.map((c: { code: string }) => c.code)).toEqual(['NTX']);
    expect((await request('GET', '/clients?q=ntx', { cookie: hr })).body.items.map((c: { code: string }) => c.code)).toEqual(['NTX']);
    expect((await request('GET', '/clients?q=23aabcn1234f1z5', { cookie: hr })).body.items.map((c: { code: string }) => c.code)).toEqual(['NTX']);

    const row = byName.body.items[0];
    expect(row.siteCount).toBe(2);
    expect(row.activeEmployees).toBeGreaterThan(0);
    const ccw = (await request('GET', '/clients?q=CCW', { cookie: auditor })).body.items[0];
    expect(ccw.siteCount).toBe(2);
  });

  test('M2-CLI-04 AC1: a wildcard in the search is taken literally; no match → empty page', async () => {
    expect((await request('GET', '/clients?q=%25', { cookie: hr })).body).toEqual({ items: [], nextCursor: null });
    expect((await request('GET', '/clients?q=zzzz-no-such', { cookie: hr })).body).toEqual({ items: [], nextCursor: null });
  });

  test('M2-CLI-04 AC1: state and status filters combine with the search', async () => {
    const tag = `kannada${uniq()}`;
    const c = await newClient({ stateCode: 'KA', name: `${tag} Filter Co` });
    const q = (qs: string) => request('GET', `/clients?${qs}`, { cookie: hr }).then((r) => r.body.items.map((x: { id: string }) => x.id));
    expect(await q(`stateCode=KA&q=${tag}`)).toEqual([c.id]);
    expect(await q(`stateCode=MP&q=${tag}`)).toEqual([]);
    expect(await q(`status=INACTIVE&q=${tag}`)).toEqual([]);
    expect(await q(`status=ACTIVE&stateCode=KA&q=${tag}`)).toEqual([c.id]);
    expect((await request('GET', '/clients?status=BOGUS', { cookie: hr })).status).toBe(422);
  });

  test('M2-CLI-04 AC3: cursor paging is stable and limit is bounded 1–100', async () => {
    const p1 = await request('GET', '/clients?limit=2', { cookie: hr });
    expect(p1.body.items).toHaveLength(2);
    expect(p1.body.nextCursor).toBe(p1.body.items[1].id);
    const p2 = await request('GET', `/clients?limit=2&cursor=${p1.body.nextCursor}`, { cookie: hr });
    expect(p2.body.items[0].id).not.toBe(p1.body.items[0].id);
    expect(p2.body.items[0].id > p1.body.items[1].id).toBe(true);
    for (const limit of [0, 101, 'x']) expect((await request('GET', `/clients?limit=${limit}`, { cookie: hr })).status).toBe(422);
    // M2-CLI-04 AC3 (Excel export) n/a here: the export is M11-EXP-01 and reads this list.
  });
});

describe('M2-CLI-05 deactivate', () => {
  test('M2-CLI-05 AC1: blocked while the client has active deployments; the error counts them and names the sites', async () => {
    const ntx = (await request('GET', '/clients?q=NTX', { cookie: hr })).body.items[0];
    const res = await request('POST', `/clients/${ntx.id}/deactivate`, { cookie: admin });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ACTIVE_DEPLOYMENTS');
    const { activeDeployments, sites } = res.body.error.details;
    expect(activeDeployments).toBeGreaterThan(0);
    expect(sites.reduce((n: number, s: { deployments: number }) => n + s.deployments, 0)).toBe(activeDeployments);
    expect(sites[0]).toMatchObject({ id: expect.any(String), code: expect.stringMatching(/^NTX-/), href: expect.stringContaining('/sites/') });
    expect((await request('GET', `/clients/${ntx.id}`, { cookie: hr })).body.status).toBe('ACTIVE');
  });

  test('M2-CLI-05 AC1: only an Admin may deactivate or reactivate', async () => {
    const c = await newClient();
    for (const cookie of [hr, payroll, accounts, auditor, supA]) {
      expect((await request('POST', `/clients/${c.id}/deactivate`, { cookie })).status).toBe(403);
    }
    expect((await request('POST', `/clients/${NIL}/deactivate`, { cookie: admin })).status).toBe(404);
  });

  test('M2-CLI-05 AC1 AC3 AC4: deactivating a client with no deployments is audited; its payroll stays readable; it is never deleted', async () => {
    const c = await newClient();
    const run = await db.orm.app.PayrollRun.create({
      clientId: c.id, type: 'REGULAR', periodFrom: Temporal.PlainDate.from('2026-09-01'), periodTo: Temporal.PlainDate.from('2026-09-30'), status: 'LOCKED',
    } as never);

    const res = await request('POST', `/clients/${c.id}/deactivate`, { cookie: admin });
    expect(res).toMatchObject({ status: 200, body: { id: c.id, status: 'INACTIVE' } });
    const [row] = await auditRows('client.deactivate', c.id);
    expect(row!.before).toEqual({ status: 'ACTIVE' });
    expect(row!.after).toEqual({ status: 'INACTIVE' });

    // AC3: still readable (client and its run), still listed under the INACTIVE filter.
    expect((await request('GET', `/clients/${c.id}`, { cookie: auditor })).body.status).toBe('INACTIVE');
    expect(await db.orm.app.PayrollRun.first({ id: run.id as never })).toMatchObject({ clientId: c.id, status: 'LOCKED' });
    expect((await request('GET', `/clients?status=INACTIVE&q=${c.code}`, { cookie: hr })).body.items).toHaveLength(1);

    // AC4: there is no delete.
    for (const method of ['DELETE']) expect([404, 405]).toContain((await request(method, `/clients/${c.id}`, { cookie: admin })).status);

    // Twice is refused; reactivation restores it.
    expect(await request('POST', `/clients/${c.id}/deactivate`, { cookie: admin })).toMatchObject({ status: 422, body: { error: { code: 'ALREADY_INACTIVE' } } });
    expect(await request('POST', `/clients/${c.id}/reactivate`, { cookie: admin })).toMatchObject({ status: 200, body: { status: 'ACTIVE' } });
    expect(await request('POST', `/clients/${c.id}/reactivate`, { cookie: admin })).toMatchObject({ status: 422, body: { error: { code: 'ALREADY_ACTIVE' } } });
  });

  // M2-CLI-05 AC2 is proved in test/services/clients.service.test.ts for the rule (assertActive → CLIENT_INACTIVE).
  // The new-deployment, attendance-import and payroll-run endpoints that must call it are M3/M5/M7;
  // each of those stories carries its own "client inactive → 422 CLIENT_INACTIVE" test.
});

describe('M2-CLI-06 bulk import', () => {
  test('M2-CLI-06 AC2 AC3: valid rows are saved, duplicates and bad rows are reported per row, and the whole thing is audited', async () => {
    const dupCode = (await newClient()).code;
    const { gstin: dupGstin } = taxIds();
    await newClient({ gstin: dupGstin });
    const { gstin: freshGstin } = taxIds();
    const a = codeOf();
    const rows = [
      { code: a, name: 'Import One', stateCode: 'MP', gstin: freshGstin },
      { code: dupCode, name: 'Dup code', stateCode: 'MP' },
      { code: codeOf(), name: 'Dup gstin', stateCode: 'MP', gstin: dupGstin },
      { code: a, name: 'Dup inside file', stateCode: 'MP' },
      { code: codeOf(), name: '', stateCode: 'MP' },
      { code: codeOf(), name: 'Import Two', stateCode: 'RJ' },
    ];
    const res = await request('POST', '/clients/import', { cookie: hr, body: { rows } });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: 2, rejected: 4 });
    expect(res.body.results.map((r: { status: string }) => r.status)).toEqual(['CREATED', 'REJECTED', 'REJECTED', 'REJECTED', 'REJECTED', 'CREATED']);
    expect(res.body.results[1].errors[0]).toEqual({ path: 'code', message: 'Duplicate short code' });
    expect(res.body.results[2].errors[0]).toEqual({ path: 'gstin', message: 'Duplicate GSTIN' });
    expect(res.body.results[4].errors[0].path).toBe('name');

    // The two good rows are really saved and audited as creates.
    const saved = await request('GET', `/clients/${res.body.results[0].id}`, { cookie: hr });
    expect(saved.body).toMatchObject({ code: a, gstin: freshGstin });
    expect(await auditRows('client.create', res.body.results[5].id)).toHaveLength(1);
    expect(await db.orm.audit.AuditLog.where({ action: 'client.import' as never }).first()).not.toBeNull();
  });

  test('M2-CLI-06 AC3: empty or oversize files → 422', async () => {
    expect((await request('POST', '/clients/import', { cookie: hr, body: { rows: [] } })).status).toBe(422);
    expect((await request('POST', '/clients/import', { cookie: hr, body: { rows: Array.from({ length: 1001 }, body) } })).status).toBe(422);
  });

  // M2-CLI-06 AC1 n/a: the downloadable template and the Excel preview are Module 11 (M11-IMP-*).
  // This endpoint is the row-level save that preview feeds into.
});

describe('M2-CLI-07 contract expiry alerts', () => {
  test('M2-CLI-07 AC1: contracts ending within the window are listed with their 7- or 30-day alert level', async () => {
    const day = (n: number) => Temporal.Now.plainDateISO('Asia/Kolkata').add({ days: n }).toString();
    const near = await newClient({ contractEnd: day(7) });
    const mid = await newClient({ contractEnd: day(20) });
    const far = await newClient({ contractEnd: day(90) });
    const past = await newClient({ contractEnd: day(-3) });
    const res = await request('GET', '/clients/expiring', { cookie: hr });
    expect(res.status).toBe(200);
    const byId = new Map(res.body.items.map((i: { id: string }) => [i.id, i]));
    expect(byId.get(near.id)).toMatchObject({ daysLeft: 7, alert: 'D7' });
    expect(byId.get(mid.id)).toMatchObject({ daysLeft: 20, alert: 'D30' });
    expect(byId.has(far.id)).toBe(false);
    expect(byId.has(past.id)).toBe(false);
    const days = res.body.items.map((i: { daysLeft: number }) => i.daysLeft);
    expect(days).toEqual([...days].sort((x, y) => x - y));
    expect((await request('GET', '/clients/expiring?withinDays=0', { cookie: hr })).status).toBe(422);
    expect((await request('GET', '/clients/expiring', { cookie: supA })).status).toBe(403);
    // Delivery of the alert (e-mail/notification at exactly 30 and 7 days) is a scheduled job: see docs/GO-LIVE.md.
  });
});
