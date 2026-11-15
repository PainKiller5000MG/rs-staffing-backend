// Sites end to end against the seeded database (npm run seed:reset): M2-SIT-01..08.
// Every site these tests create has a unique code, so reruns need no reset.
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { db } from '../../src/prisma/db.ts';
import { mobileOf, testApp } from '../helpers.ts';

const { request, login } = testApp();
let admin: string;
let hr: string;
let payroll: string;
let auditor: string;
let supA: string;
let supB: string;
let employee: string;
let clientCode: string;
const ids = { clientNtx: '', clientVhc: '', supA: '', supB: '', s1: '', s2: '', hr: '', empRs1: '' };
const sup: Record<'s1' | 's2', { cookie: string; employeeCode: string; employeeId: string }> = {} as never;

let counter = Date.now() % 100_000_000;
const codeOf = () => `ZT-${++counter}`;
const NIL = '00000000-0000-7000-8000-000000000000';
const body = (over: Record<string, unknown> = {}) => ({
  clientId: ids.clientNtx,
  code: codeOf(),
  name: 'Test Site',
  stateCode: 'MP',
  district: 'Bhopal',
  pincode: '462001',
  ...over,
});
async function newSite(over: Record<string, unknown> = {}, by = hr) {
  const res = await request('POST', '/sites', { cookie: by, body: body(over) });
  expect(res.status).toBe(201);
  return res.body as { id: string; code: string; clientId: string };
}
const auditRows = (action: string, entityId: string) => db.orm.audit.AuditLog.where({ action: action as never, entityId: entityId as never }).all();
const today = () => Temporal.Now.plainDateISO('Asia/Kolkata').toString();

beforeAll(async () => {
  admin = await login(mobileOf('admin'));
  hr = await login(mobileOf('hr'));
  payroll = await login(mobileOf('payroll'));
  auditor = await login(mobileOf('auditor'));
  supA = await login(mobileOf('supA'));
  supB = await login(mobileOf('supB'));
  employee = await login(mobileOf('employee'));
  // Clients of their own, so the sites these tests create never change the seeded clients' site counts.
  for (const key of ['clientNtx', 'clientVhc'] as const) {
    const code = `ZK-${++counter}`;
    const made = await request('POST', '/clients', { cookie: hr, body: { code, name: `Site Test Client ${key}`, stateCode: 'MP' } });
    expect(made.status).toBe(201);
    ids[key] = made.body.id;
    if (key === 'clientNtx') clientCode = code;
  }
  const users = await db.orm.app.User.all();
  ids.supA = users.find((u) => u.mobile === mobileOf('supA'))!.id;
  ids.supB = users.find((u) => u.mobile === mobileOf('supB'))!.id;
  ids.hr = users.find((u) => u.mobile === mobileOf('hr'))!.id;
  for (const key of ['s1', 's2'] as const) {
    const mobile = `+9170${String(++counter).padStart(8, '0').slice(-8)}`;
    const employeeCode = `ZS${counter}`;
    const e = await db.orm.app.Employee.create({
      code: employeeCode, name: `Test Supervisor ${key}`, dob: Temporal.PlainDate.from('1985-01-01'), gender: 'MALE', mobile, staffType: 'SUPERVISOR', designation: 'Field Supervisor', status: 'ACTIVE',
    } as never);
    const made = await request('POST', '/users', { cookie: admin, body: { name: `Test Supervisor ${key}`, mobile, role: 'SUPERVISOR', employeeId: e.id } });
    expect(made.status).toBe(201);
    ids[key] = made.body.id;
    sup[key] = { cookie: await login(mobile), employeeCode, employeeId: e.id };
  }
  ids.empRs1 = (await db.orm.app.Employee.where({ code: 'RS000001' as never }).first())!.id;
});
afterAll(async () => {
  for (const key of ['s1', 's2'] as const) {
    await db.orm.app.User.where({ id: ids[key] as never }).update({ status: 'DISABLED' } as never);
  }
  await db.close();
});

describe('M2-SIT-01 create', () => {
  test('M2-SIT-01 AC1: no session → 401; employee, supervisor and auditor cannot create → 403', async () => {
    expect((await request('POST', '/sites', { body: body() })).status).toBe(401);
    for (const cookie of [employee, supA, auditor]) {
      expect((await request('POST', '/sites', { cookie, body: body() })).status).toBe(403);
    }
    expect((await request('PATCH', `/sites/${NIL}`, { cookie: auditor, body: { name: 'X' } })).status).toBe(403);
    expect((await request('POST', '/sites/import', { cookie: supA, body: { rows: [body()] } })).status).toBe(403);
  });

  test('M2-SIT-01 AC1 AC4: HQ creates a site under a client; many sites per client, each belongs to one', async () => {
    const a = await newSite();
    const b = await newSite();
    expect(a.clientId).toBe(ids.clientNtx);
    const res = await request('GET', `/sites?clientId=${ids.clientNtx}&limit=100`, { cookie: hr });
    const codes = res.body.items.map((s: { code: string }) => s.code);
    expect(codes).toEqual(expect.arrayContaining([a.code, b.code]));
    expect(res.body.items.every((s: { clientId: string }) => s.clientId === ids.clientNtx)).toBe(true);
    for (const cookie of [payroll, admin]) expect((await request('POST', '/sites', { cookie, body: body() })).status).toBe(201);
  });

  test('M2-SIT-01 AC1: every required field is checked (422 with the field path); input is trimmed', async () => {
    for (const field of ['clientId', 'code', 'name', 'stateCode', 'district', 'pincode']) {
      const b = body();
      delete (b as Record<string, unknown>)[field];
      const res = await request('POST', '/sites', { cookie: hr, body: b });
      expect(res.status, field).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(JSON.stringify(res.body.error.details)).toContain(field);
    }
    for (const bad of [{ pincode: '46200' }, { pincode: '062001' }, { pincode: 'abcdef' }, { code: 'ab' }, { code: 'lower-case' }, { name: '   ' }, { stateCode: 'mp' }, { district: 'x'.repeat(81) }]) {
      expect((await request('POST', '/sites', { cookie: hr, body: body(bad) })).status, JSON.stringify(bad)).toBe(422);
    }
    const trimmed = await request('POST', '/sites', { cookie: hr, body: body({ name: '  Padded Name  ', district: ' Bhopal ' }) });
    expect(trimmed.body).toMatchObject({ name: 'Padded Name', district: 'Bhopal' });
  });

  test('M2-SIT-01 AC1: a duplicate site code → 409 DUPLICATE; unknown client → 409 REFERENCE_MISSING; inactive client → 422', async () => {
    const a = await newSite();
    expect(await request('POST', '/sites', { cookie: hr, body: body({ code: a.code }) })).toMatchObject({ status: 409, body: { error: { code: 'DUPLICATE' } } });
    expect(await request('POST', '/sites', { cookie: hr, body: body({ clientId: NIL }) })).toMatchObject({ status: 409, body: { error: { code: 'REFERENCE_MISSING' } } });
    const c = await request('POST', '/clients', { cookie: hr, body: { code: `ZC-${++counter}`, name: 'Gone Ltd', stateCode: 'MP' } });
    expect((await request('POST', `/clients/${c.body.id}/deactivate`, { cookie: admin })).status).toBe(200);
    expect(await request('POST', '/sites', { cookie: hr, body: body({ clientId: c.body.id }) })).toMatchObject({ status: 422, body: { error: { code: 'CLIENT_INACTIVE' } } });
  });

  test('M2-SIT-01 AC2: address, coordinates, in-charge and shift timings are optional and stored; lat and lng come as a pair', async () => {
    const plain = await request('POST', '/sites', { cookie: hr, body: body() });
    expect(plain.body).toMatchObject({ address: null, lat: null, lng: null, inchargeName: null, shiftStart: null });
    const full = await request('POST', '/sites', {
      cookie: hr,
      body: body({ address: 'Plot 4, Govindpura', lat: 23.2599, lng: 77.4126, inchargeName: 'R. Singh', inchargePhone: '+91 98260 11111', shiftStart: '06:00', shiftEnd: '14:00' }),
    });
    expect(full.body).toMatchObject({ address: 'Plot 4, Govindpura', lat: 23.2599, lng: 77.4126, inchargeName: 'R. Singh', shiftStart: '06:00', shiftEnd: '14:00' });
    expect((await request('POST', '/sites', { cookie: hr, body: body({ lat: 23.2 }) })).status).toBe(422);
    expect((await request('POST', '/sites', { cookie: hr, body: body({ lat: 91, lng: 77 }) })).status).toBe(422);
    expect((await request('POST', '/sites', { cookie: hr, body: body({ shiftStart: '25:00' }) })).status).toBe(422);
  });

  test('M2-SIT-01 AC3: the state comes from the fixed list; an unknown state is refused and nothing is saved', async () => {
    expect(await request('POST', '/sites', { cookie: hr, body: body({ stateCode: 'ZZ' }) })).toMatchObject({ status: 409, body: { error: { code: 'REFERENCE_MISSING' } } });
    const states = await db.orm.app.State.all();
    expect(states.length).toBeGreaterThan(5);
    const ok = await request('POST', '/sites', { cookie: hr, body: body({ stateCode: 'RJ' }) });
    expect(ok.body.stateCode).toBe('RJ');
  });

  test('M2-SIT-01 AC1: creating writes an audit row with after-values, in the same transaction', async () => {
    const s = await newSite({ address: 'Somewhere' });
    const [row] = await auditRows('site.create', s.id);
    expect(row!.before).toBeNull();
    expect(row!.after).toMatchObject({ siteCode: s.code, district: 'Bhopal', pincode: '462001' });
  });
});

describe('M2-SIT-02 minimum-wage zone and sphere', () => {
  test('M2-SIT-02 AC1: zone and sphere are stored on create and edit; the sphere is CENTRAL or STATE only', async () => {
    const s = await newSite({ minWageZone: 'Zone II', sphere: 'STATE' });
    expect((await request('GET', `/sites/${s.id}`, { cookie: hr })).body).toMatchObject({ minWageZone: 'Zone II', sphere: 'STATE', minWageReady: true });
    const edited = await request('PATCH', `/sites/${s.id}`, { cookie: hr, body: { minWageZone: 'A', sphere: 'CENTRAL' } });
    expect(edited.body).toMatchObject({ minWageZone: 'A', sphere: 'CENTRAL' });
    expect((await request('PATCH', `/sites/${s.id}`, { cookie: hr, body: { sphere: 'LOCAL' } })).status).toBe(422);
    expect((await request('POST', '/sites', { cookie: hr, body: body({ minWageZone: 'x'.repeat(21) }) })).status).toBe(422);
  });

  test('M2-SIT-02 AC2: a site without zone or sphere is flagged minWageReady=false so the payroll run can raise its exception', async () => {
    const s = await newSite();
    expect((await request('GET', `/sites/${s.id}`, { cookie: hr })).body).toMatchObject({ minWageZone: null, sphere: null, minWageReady: false });
    const zoneOnly = await request('PATCH', `/sites/${s.id}`, { cookie: hr, body: { minWageZone: 'B' } });
    expect(zoneOnly.body.minWageReady).toBe(false);
    // M2-SIT-02 AC2 (the payroll-run exception itself) lives in M7: the run reads this flag.
  });
});

describe('M2-SIT-03 edit', () => {
  test('M2-SIT-03 AC2: other fields are editable, null clears an optional field, and the before/after is audited', async () => {
    const s = await newSite({ address: 'Old Road', inchargeName: 'Old Name' });
    const res = await request('PATCH', `/sites/${s.id}`, { cookie: hr, body: { name: 'Renamed Site', address: null, district: 'Raisen', pincode: '462046', inchargeName: 'New Name' } });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Renamed Site', address: null, district: 'Raisen', pincode: '462046', inchargeName: 'New Name', code: s.code });
    const [row] = await auditRows('site.update', s.id);
    expect(row!.before).toMatchObject({ name: 'Test Site', address: 'Old Road', district: 'Bhopal' });
    expect(row!.after).toMatchObject({ name: 'Renamed Site', address: null, district: 'Raisen' });
  });

  test('M2-SIT-03 AC2: bad input → 422 with a path; empty body → 422; code and client cannot be changed; unknown site → 404', async () => {
    const s = await newSite();
    expect((await request('PATCH', `/sites/${s.id}`, { cookie: hr, body: {} })).status).toBe(422);
    expect((await request('PATCH', `/sites/${s.id}`, { cookie: hr, body: { pincode: '1' } })).body.error.details).toBeTruthy();
    expect((await request('PATCH', `/sites/${s.id}`, { cookie: hr, body: { code: 'NEW-CODE' } })).status).toBe(422);
    expect((await request('PATCH', `/sites/${s.id}`, { cookie: hr, body: { clientId: ids.clientVhc } })).status).toBe(422);
    expect((await request('PATCH', `/sites/${s.id}`, { cookie: hr, body: { lat: 23.1 } })).status).toBe(422);
    expect((await request('PATCH', `/sites/${NIL}`, { cookie: hr, body: { name: 'X' } })).status).toBe(404);
    expect((await request('PATCH', `/sites/${s.id}`, { cookie: hr, body: { stateCode: 'ZZ' } })).status).toBe(409);
  });

  test('M2-SIT-03 AC1: the state is editable until payroll has run for the site, then 422 STATE_LOCKED; other fields stay editable', async () => {
    // A client of its own, so the run's unique (client, type, period) never clashes with an earlier test run.
    const c = await request('POST', '/clients', { cookie: hr, body: { code: `ZR-${++counter}`, name: 'Run Ltd', stateCode: 'MP' } });
    const s = await newSite({ clientId: c.body.id });
    expect(await request('PATCH', `/sites/${s.id}`, { cookie: hr, body: { stateCode: 'RJ' } })).toMatchObject({ status: 200, body: { stateCode: 'RJ' } });

    const run = await db.orm.app.PayrollRun.create({
      clientId: s.clientId, type: 'REGULAR', periodFrom: Temporal.PlainDate.from('2026-10-01'), periodTo: Temporal.PlainDate.from('2026-10-31'), status: 'DRAFT',
    } as never);
    const line = { runId: run.id, employeeId: ids.empRs1, siteId: s.id, paidDays: '26', lopDays: '0', otHours: '0', grossPaise: 100n, deductionsPaise: 0n, netPaise: 100n, employerCostPaise: 100n, pfWagesPaise: 0n, epsWagesPaise: 0n, edliWagesPaise: 0n, esiGrossPaise: 0n, lineHash: 'a'.repeat(64), snapshot: {} };
    await db.orm.app.RunLine.create(line as never);
    // A DRAFT run does not lock the state.
    expect((await request('PATCH', `/sites/${s.id}`, { cookie: hr, body: { stateCode: 'MP' } })).status).toBe(200);
    await db.orm.app.PayrollRun.where({ id: run.id as never }).update({ status: 'COMPUTED' } as never);
    expect(await request('PATCH', `/sites/${s.id}`, { cookie: hr, body: { stateCode: 'RJ' } })).toMatchObject({ status: 422, body: { error: { code: 'STATE_LOCKED' } } });
    expect((await request('PATCH', `/sites/${s.id}`, { cookie: hr, body: { stateCode: 'MP', name: 'Same state ok' } })).status).toBe(200);
    expect((await request('PATCH', `/sites/${s.id}`, { cookie: hr, body: { district: 'Sehore' } })).status).toBe(200);
  });
});

describe('M2-SIT-04 list and search', () => {
  test('M2-SIT-04 AC1: filters by client, state, status and search by name or code (case-insensitive), combined', async () => {
    const tag = `Zq${++counter}`;
    const a = await newSite({ name: `${tag} Plant`, stateCode: 'MP' });
    const b = await newSite({ name: `${tag} Depot`, stateCode: 'RJ', clientId: ids.clientVhc });
    const q = (qs: string) => request('GET', `/sites?${qs}`, { cookie: payroll }).then((r) => r.body.items.map((s: { id: string }) => s.id));
    expect((await q(`q=${tag.toLowerCase()}`)).sort()).toEqual([a.id, b.id].sort());
    expect(await q(`q=${a.code.toLowerCase()}`)).toEqual([a.id]);
    expect(await q(`q=${tag}&clientId=${ids.clientVhc}`)).toEqual([b.id]);
    expect(await q(`q=${tag}&stateCode=MP`)).toEqual([a.id]);
    expect(await q(`q=${tag}&status=INACTIVE`)).toEqual([]);
    expect(await q(`q=${tag}&clientId=${ids.clientVhc}&stateCode=MP`)).toEqual([]);
    expect(await q('q=%25')).toEqual([]);
    expect((await request('GET', '/sites?limit=0', { cookie: hr })).status).toBe(422);
    expect((await request('GET', '/sites?limit=101', { cookie: hr })).status).toBe(422);
  });

  test('M2-SIT-04 AC1: filter by supervisor lists the sites that person currently covers', async () => {
    const res = await request('GET', `/sites?supervisorId=${ids.supA}&limit=100`, { cookie: hr });
    expect(res.body.items.map((s: { code: string }) => s.code).sort()).toEqual(['NTX-BPL', 'NTX-MDP', 'VHC-IDR']);
    expect((await request('GET', `/sites?supervisorId=${NIL}`, { cookie: hr })).body.items).toEqual([]);
  });

  test('M2-SIT-04 AC2: each row shows active headcount and the current primary supervisor', async () => {
    const res = await request('GET', '/sites?q=NTX-BPL', { cookie: hr });
    const row = res.body.items[0];
    expect(row.primarySupervisor).toMatchObject({ userId: ids.supA, name: 'Suresh Patel' });
    const deployed = await db.orm.app.Deployment.where({ siteId: row.id as never }).all();
    const open = new Set(deployed.filter((d) => !d.effectiveTo || d.effectiveTo.toString() >= today()).map((d) => d.employeeId));
    expect(row.activeHeadcount).toBe(open.size);
    expect(row.activeHeadcount).toBeGreaterThan(0);
    const fresh = await newSite();
    expect((await request('GET', `/sites?q=${fresh.code}`, { cookie: hr })).body.items[0]).toMatchObject({ activeHeadcount: 0, primarySupervisor: null });
  });

  test('M2-SIT-04 AC1: cursor paging walks every site once in a stable order; an empty result is an empty page', async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const res: { body: { items: { id: string }[]; nextCursor: string | null } } = await request('GET', `/sites?limit=3${cursor ? `&cursor=${cursor}` : ''}`, { cookie: hr });
      expect(res.body.items.length).toBeLessThanOrEqual(3);
      seen.push(...res.body.items.map((s) => s.id));
      cursor = res.body.nextCursor;
    } while (cursor);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.length).toBe((await db.orm.app.Site.all()).length);
    expect((await request('GET', '/sites?q=nothing-matches-this-zzzz', { cookie: hr })).body).toEqual({ items: [], nextCursor: null });
  });

  test('M2-SIT-04 AC1: a supervisor lists only their own sites, even with filters for others', async () => {
    const own = await request('GET', '/sites?limit=100', { cookie: supA });
    expect(own.body.items.map((s: { code: string }) => s.code).sort()).toEqual(['NTX-BPL', 'NTX-MDP', 'VHC-IDR']);
    const other = await request('GET', `/sites?supervisorId=${ids.supB}`, { cookie: supA });
    expect(other.body.items).toEqual([]);
    expect((await request('GET', '/sites', { cookie: employee })).status).toBe(403);
  });

  // M2-SIT-04 AC3 n/a: the Excel export is M11-EXP-01 and reads this list.
});

describe('M2-SIT-05 close', () => {
  test('M2-SIT-05 AC1: blocked while deployments are active, and the error lists them', async () => {
    const site = (await db.orm.app.Site.where({ code: 'NTX-MDP' as never }).first())!;
    const res = await request('POST', `/sites/${site.id}/close`, { cookie: admin });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ACTIVE_DEPLOYMENTS');
    expect(res.body.error.details.activeDeployments).toBeGreaterThan(0);
    expect(res.body.error.details.deployments[0]).toMatchObject({ employeeId: expect.any(String), employeeCode: expect.stringMatching(/^RS/), employeeName: expect.any(String) });
    expect((await db.orm.app.Site.first({ id: site.id }))!.status).toBe('ACTIVE');
  });

  test('M2-SIT-05 AC1 AC2 AC3: only an Admin closes; a free site closes, its assignments end today, and the history stays readable', async () => {
    const s = await newSite();
    for (const cookie of [hr, payroll, supA, auditor]) expect((await request('POST', `/sites/${s.id}/close`, { cookie })).status).toBe(403);
    const primary = await request('POST', `/sites/${s.id}/supervisors`, { cookie: hr, body: { userId: ids.s1, role: 'PRIMARY' } });
    expect((await request('POST', `/site-scopes/${primary.body.id}/approve`, { cookie: admin })).status).toBe(200);
    const backup = await request('POST', `/sites/${s.id}/supervisors`, { cookie: hr, body: { userId: ids.s2, role: 'BACKUP', effectiveFrom: '2099-01-01' } });

    const res = await request('POST', `/sites/${s.id}/close`, { cookie: admin });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('INACTIVE');
    const list = (await request('GET', `/sites/${s.id}/supervisors`, { cookie: hr })).body.items;
    const p = list.find((x: { id: string }) => x.id === primary.body.id);
    const b = list.find((x: { id: string }) => x.id === backup.body.id);
    expect(p).toMatchObject({ effectiveTo: today(), status: 'ENDED' });
    expect(b).toMatchObject({ effectiveTo: '2099-01-01', status: 'ENDED' });
    // Readable afterwards, gone from the supervisor's own list, and no longer editable or assignable.
    expect((await request('GET', `/sites/${s.id}`, { cookie: hr })).body).toMatchObject({ status: 'INACTIVE', code: s.code });
    expect((await request('GET', '/me/sites', { cookie: sup.s1.cookie })).body.items.map((x: { siteId: string }) => x.siteId)).not.toContain(s.id);
    expect(await request('PATCH', `/sites/${s.id}`, { cookie: hr, body: { name: 'X' } })).toMatchObject({ status: 422, body: { error: { code: 'SITE_CLOSED' } } });
    expect(await request('POST', `/sites/${s.id}/supervisors`, { cookie: hr, body: { userId: ids.s1, role: 'BACKUP' } })).toMatchObject({ status: 422, body: { error: { code: 'SITE_CLOSED' } } });
    expect(await request('POST', `/sites/${s.id}/close`, { cookie: admin })).toMatchObject({ status: 422, body: { error: { code: 'ALREADY_CLOSED' } } });
    expect((await request('POST', `/sites/${NIL}/close`, { cookie: admin })).status).toBe(404);
    const [row] = await auditRows('site.close', s.id);
    expect(row!.before).toMatchObject({ status: 'ACTIVE' });
    expect(row!.after).toMatchObject({ status: 'INACTIVE' });
  });
});

describe('M2-SIT-06 assign supervisors', () => {
  test('M2-SIT-06 AC1: only an active internal employee with supervisor access can be assigned', async () => {
    const s = await newSite();
    const assign = (userId: string) => request('POST', `/sites/${s.id}/supervisors`, { cookie: hr, body: { userId, role: 'BACKUP' } });
    const users = await db.orm.app.User.all();
    const adminUser = users.find((u) => u.mobile === mobileOf('admin'))!;
    expect(await assign(adminUser.id)).toMatchObject({ status: 422, body: { error: { code: 'NOT_ASSIGNABLE_SUPERVISOR' } } });
    expect((await assign(NIL)).status).toBe(404);
    expect((await request('POST', `/sites/${s.id}/supervisors`, { cookie: hr, body: { userId: 'nope', role: 'BACKUP' } })).status).toBe(422);
    expect((await request('POST', `/sites/${s.id}/supervisors`, { cookie: hr, body: { userId: ids.s1, role: 'LEAD' } })).status).toBe(422);
    expect((await assign(ids.s1)).status).toBe(201);
    for (const cookie of [supA, auditor, employee]) {
      expect((await request('POST', `/sites/${s.id}/supervisors`, { cookie, body: { userId: ids.s1, role: 'BACKUP' } })).status).toBe(403);
    }
    // A suspended supervisor account or an exited employee is refused too.
    await db.orm.app.User.where({ id: ids.s2 as never }).update({ status: 'DISABLED' } as never);
    try {
      expect(await assign(ids.s2)).toMatchObject({ status: 422, body: { error: { code: 'NOT_ASSIGNABLE_SUPERVISOR' } } });
    } finally {
      await db.orm.app.User.where({ id: ids.s2 as never }).update({ status: 'ACTIVE' } as never);
    }
    const emp = (await db.orm.app.User.first({ id: ids.s2 as never }))!.employeeId!;
    await db.orm.app.Employee.where({ id: emp as never }).update({ status: 'EXITED' } as never);
    try {
      expect(await assign(ids.s2)).toMatchObject({ status: 422, body: { error: { code: 'NOT_ASSIGNABLE_SUPERVISOR' } } });
    } finally {
      await db.orm.app.Employee.where({ id: emp as never }).update({ status: 'ACTIVE' } as never);
    }
  });

  test('M2-SIT-06 AC2 AC3: an assignment is pending until a second person approves it; one primary at a time, any number of backups', async () => {
    const s = await newSite();
    const assign = (userId: string, role: string, extra = {}) => request('POST', `/sites/${s.id}/supervisors`, { cookie: hr, body: { userId, role, ...extra } });
    const p1 = await assign(ids.s1, 'PRIMARY');
    expect(p1).toMatchObject({ status: 201, body: { role: 'PRIMARY', status: 'PENDING', effectiveFrom: today() } });
    // Pending grants nothing: no primary on the list, no access for the supervisor.
    expect((await request('GET', `/sites?q=${s.code}`, { cookie: hr })).body.items[0].primarySupervisor).toBeNull();
    expect((await request('GET', `/sites/${s.id}`, { cookie: sup.s1.cookie })).status).toBe(404);
    // The creator cannot approve their own assignment.
    expect(await request('POST', `/site-scopes/${p1.body.id}/approve`, { cookie: hr })).toMatchObject({ status: 422, body: { error: { code: 'MAKER_CHECKER' } } });
    expect((await request('POST', `/site-scopes/${p1.body.id}/approve`, { cookie: admin })).status).toBe(200);
    expect((await request('GET', `/sites?q=${s.code}`, { cookie: hr })).body.items[0].primarySupervisor).toMatchObject({ userId: ids.s1 });
    expect((await request('GET', `/sites/${s.id}`, { cookie: sup.s1.cookie })).status).toBe(200);

    const b = await assign(ids.s2, 'BACKUP');
    expect((await request('POST', `/site-scopes/${b.body.id}/approve`, { cookie: admin })).status).toBe(200);
    const list = (await request('GET', `/sites/${s.id}/supervisors`, { cookie: hr })).body.items;
    expect(list.map((x: { role: string; status: string }) => `${x.role}:${x.status}`).sort()).toEqual(['BACKUP:ACTIVE', 'PRIMARY:ACTIVE']);
    expect((await request('GET', `/sites/${s.id}/supervisors`, { cookie: supA })).status).toBe(403);
    // The same person cannot hold two overlapping assignments on one site: refused when the second is approved.
    const twice = await assign(ids.s1, 'BACKUP');
    expect(await request('POST', `/site-scopes/${twice.body.id}/approve`, { cookie: admin })).toMatchObject({ status: 409, body: { error: { code: 'OVERLAP' } } });
  });

  test('M2-SIT-06 AC3: approving a new primary ends the old one the day before the new one starts', async () => {
    const s = await newSite();
    const mk = async (userId: string, from: string) => {
      const a = await request('POST', `/sites/${s.id}/supervisors`, { cookie: hr, body: { userId, role: 'PRIMARY', effectiveFrom: from } });
      expect(a.status).toBe(201);
      return a.body as { id: string };
    };
    const old = await mk(ids.s1, '2026-01-01');
    expect((await request('POST', `/site-scopes/${old.id}/approve`, { cookie: admin })).status).toBe(200);
    const next = await mk(ids.s2, '2026-12-01');
    // Pending: the old primary is untouched.
    expect((await request('GET', `/sites/${s.id}/supervisors`, { cookie: hr })).body.items.find((x: { id: string }) => x.id === old.id)).toMatchObject({ effectiveTo: null, status: 'ACTIVE' });
    expect((await request('POST', `/site-scopes/${next.id}/approve`, { cookie: admin })).status).toBe(200);
    const list = (await request('GET', `/sites/${s.id}/supervisors`, { cookie: hr })).body.items;
    expect(list.find((x: { id: string }) => x.id === old.id)).toMatchObject({ effectiveTo: '2026-11-30', status: 'ACTIVE' });
    expect(list.find((x: { id: string }) => x.id === next.id)).toMatchObject({ effectiveFrom: '2026-12-01', effectiveTo: null, status: 'ACTIVE' });
    const [handover] = await auditRows('user_site_scope.handover', old.id);
    expect(handover!.after).toMatchObject({ effectiveTo: '2026-11-30' });
    // The database itself refuses two approved primaries that overlap.
    await expect(db.orm.app.UserSiteScope.where({ id: old.id as never }).update({ effectiveTo: null } as never)).rejects.toThrow();
  });

  test('M2-SIT-06 AC3: a new primary starting on or before the current primary is refused (409 PRIMARY_OVERLAP); end date before start → 422', async () => {
    const s = await newSite();
    const a = await request('POST', `/sites/${s.id}/supervisors`, { cookie: hr, body: { userId: ids.s1, role: 'PRIMARY', effectiveFrom: '2026-06-01' } });
    await request('POST', `/site-scopes/${a.body.id}/approve`, { cookie: admin });
    const b = await request('POST', `/sites/${s.id}/supervisors`, { cookie: hr, body: { userId: ids.s2, role: 'PRIMARY', effectiveFrom: '2026-06-01' } });
    expect(await request('POST', `/site-scopes/${b.body.id}/approve`, { cookie: admin })).toMatchObject({ status: 409, body: { error: { code: 'PRIMARY_OVERLAP' } } });
    expect((await request('POST', `/sites/${s.id}/supervisors`, { cookie: hr, body: { userId: ids.s2, role: 'BACKUP', effectiveFrom: '2026-06-02', effectiveTo: '2026-06-01' } })).status).toBe(422);
  });

  test('M2-SIT-06 AC4: a supervisor can hold many sites across clients, and the assignment is audited', async () => {
    const x = await newSite({ clientId: ids.clientNtx });
    const y = await newSite({ clientId: ids.clientVhc });
    for (const s of [x, y]) {
      const a = await request('POST', `/sites/${s.id}/supervisors`, { cookie: hr, body: { userId: ids.s1, role: 'BACKUP' } });
      expect(a.status).toBe(201);
      expect((await request('POST', `/site-scopes/${a.body.id}/approve`, { cookie: admin })).status).toBe(200);
      const [row] = await auditRows('site_supervisor.assign', a.body.id);
      expect(row!.after).toMatchObject({ userId: ids.s1, isPrimary: false });
    }
    const mine = (await request('GET', '/me/sites', { cookie: sup.s1.cookie })).body.items;
    expect(mine.map((m: { clientId: string }) => m.clientId)).toEqual(expect.arrayContaining([ids.clientNtx, ids.clientVhc]));
    expect(mine.map((m: { siteId: string }) => m.siteId)).toEqual(expect.arrayContaining([x.id, y.id]));
  });
});

describe('M2-SIT-07 supervisor site list', () => {
  test('M2-SIT-07 AC1: GET /me/sites returns only active assignments with client name, address and shift timings', async () => {
    const res = await request('GET', '/me/sites', { cookie: supB });
    expect(res.status).toBe(200);
    const codes = res.body.items.map((s: { code: string }) => s.code);
    // supB's pending scope on NTX-BPL grants nothing.
    expect(codes).toEqual(expect.arrayContaining(['VHC-UJN', 'CCW-GWL', 'CCW-KOT']));
    expect(codes).not.toContain('NTX-BPL');
    expect(res.body.items.find((s: { code: string }) => s.code === 'VHC-UJN')).toMatchObject({
      clientName: 'Vindhya Hospital & Care', address: 'Freeganj, Ujjain', district: 'Ujjain', shiftStart: null, shiftEnd: null, role: 'PRIMARY',
    });
  });

  test('M2-SIT-07 AC1: shift timings show up; expired and future assignments are left out; HQ and employees get 403, no session 401', async () => {
    const s = await newSite({ shiftStart: '06:00', shiftEnd: '14:00', address: 'Gate 2' });
    const mk = async (extra: Record<string, unknown>, userId = ids.s1) => {
      const a = await request('POST', `/sites/${s.id}/supervisors`, { cookie: hr, body: { userId, role: 'BACKUP', ...extra } });
      await request('POST', `/site-scopes/${a.body.id}/approve`, { cookie: admin });
      return a;
    };
    await mk({ effectiveFrom: '2020-01-01', effectiveTo: '2020-12-31' });
    expect((await request('GET', '/me/sites', { cookie: sup.s1.cookie })).body.items.map((x: { siteId: string }) => x.siteId)).not.toContain(s.id);
    await mk({ effectiveFrom: '2099-01-01' });
    expect((await request('GET', '/me/sites', { cookie: sup.s1.cookie })).body.items.map((x: { siteId: string }) => x.siteId)).not.toContain(s.id);
    const live = await request('POST', `/sites/${s.id}/supervisors`, { cookie: hr, body: { userId: ids.s2, role: 'BACKUP' } });
    await request('POST', `/site-scopes/${live.body.id}/approve`, { cookie: admin });
    expect((await request('GET', '/me/sites', { cookie: sup.s2.cookie })).body.items.find((x: { siteId: string }) => x.siteId === s.id)).toMatchObject({
      shiftStart: '06:00', shiftEnd: '14:00', address: 'Gate 2', role: 'BACKUP',
    });
    expect((await request('GET', '/me/sites', { cookie: hr })).status).toBe(403);
    expect((await request('GET', '/me/sites', { cookie: employee })).status).toBe(403);
    expect((await request('GET', '/me/sites')).status).toBe(401);
  });
});

describe('M2-SIT-08 bulk import', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    clientCode, code: codeOf(), name: 'Imported Site', stateCode: 'MP', district: 'Sehore', pincode: '466001', minWageZone: 'A', address: 'Main Road', lat: 23.2, lng: 77.1, ...over,
  });

  test('M2-SIT-08 AC1: valid rows are created with the template columns, a named primary supervisor gets a pending assignment, and it is audited', async () => {
    const r = row({ primarySupervisorEmployeeCode: sup.s1.employeeCode });
    const res = await request('POST', '/sites/import', { cookie: hr, body: { rows: [r, row()] } });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: 2, rejected: 0 });
    const site = (await request('GET', `/sites?q=${r.code}`, { cookie: hr })).body.items[0];
    expect(site).toMatchObject({ clientId: ids.clientNtx, district: 'Sehore', minWageZone: 'A', lat: 23.2 });
    const assignments = (await request('GET', `/sites/${site.id}/supervisors`, { cookie: hr })).body.items;
    expect(assignments).toEqual([expect.objectContaining({ userId: ids.s1, role: 'PRIMARY', status: 'PENDING' })]);
    expect((await auditRows('site.create', site.id)).length).toBe(1);
    const imports = await db.orm.audit.AuditLog.where({ action: 'site.import' as never }).all();
    expect(imports.some((i) => JSON.stringify(i.after) === JSON.stringify({ rows: 2, created: 2, rejected: 0 }))).toBe(true);
  });

  test('M2-SIT-08 AC2: row-level errors reject only that row; good rows around it are still saved; nothing is half-saved', async () => {
    const dup = row();
    const rows = [
      row(),
      row({ clientCode: 'NOPE' }),
      row({ pincode: '12' }),
      row({ stateCode: 'ZZ' }),
      row({ primarySupervisorEmployeeCode: 'RS000001' }), // an employee with no supervisor login
      row({ primarySupervisorEmployeeCode: 'RS999999' }),
      dup,
      { ...dup },
      row({ lat: 23, lng: null }),
      row(),
    ];
    const res = await request('POST', '/sites/import', { cookie: hr, body: { rows } });
    expect(res.status).toBe(200);
    expect(res.body.results.filter((r: { status: string }) => r.status === 'CREATED').map((r: { row: number }) => r.row)).toEqual([1, 7, 10]);
    expect(res.body.created).toBe(3);
    expect(res.body.rejected).toBe(7);
    const by = (n: number) => res.body.results[n - 1];
    expect(by(1)).toMatchObject({ status: 'CREATED', errors: [] });
    expect(by(2).errors[0]).toMatchObject({ path: 'clientCode' });
    expect(by(3).errors[0]).toMatchObject({ path: 'pincode' });
    expect(by(4).errors[0]).toMatchObject({ path: 'stateCode' });
    expect(by(5).errors[0]).toMatchObject({ path: 'primarySupervisorEmployeeCode' });
    expect(by(6).errors[0]).toMatchObject({ path: 'primarySupervisorEmployeeCode' });
    expect(by(7).status).toBe('CREATED');
    expect(by(8)).toMatchObject({ status: 'REJECTED', errors: [{ path: 'code', message: 'Duplicate site code' }] });
    expect(by(9).status).toBe('REJECTED');
    expect(by(10).status).toBe('CREATED');
    expect(await db.orm.app.Site.where({ code: rows[1]!.code as never }).first()).toBeNull();
    expect((await request('POST', '/sites/import', { cookie: hr, body: { rows: [] } })).status).toBe(422);
    // Re-importing the same file creates nothing new.
    const again = await request('POST', '/sites/import', { cookie: hr, body: { rows: [dup] } });
    expect(again.body).toMatchObject({ created: 0, rejected: 1 });
  });

  test('M2-SIT-08 AC2: a client that is not active rejects its rows', async () => {
    const c = await request('POST', '/clients', { cookie: hr, body: { code: `ZI-${++counter}`, name: 'Closed Ltd', stateCode: 'MP' } });
    await request('POST', `/clients/${c.body.id}/deactivate`, { cookie: admin });
    const res = await request('POST', '/sites/import', { cookie: hr, body: { rows: [row({ clientCode: c.body.code })] } });
    expect(res.body.results[0].errors[0]).toMatchObject({ path: 'clientCode' });
  });

  // M2-SIT-08 AC2 n/a (partly): the downloadable Excel template and the on-screen preview are Module 11 (M11-IMP-*);
  // this endpoint is the row-by-row validation and save they call.
});
