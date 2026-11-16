// Deployments, redeploys, salary revisions and staff type against the seeded database (npm run seed:reset).
// Every employee and site these tests create is new per run, so reruns need no reset.
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { db } from '../../src/prisma/db.ts';
import { mobileOf, testApp } from '../helpers.ts';

const { request, login } = testApp();
let admin: string;
let hr: string;
let payroll: string;
let auditor: string;
let accountsRole: string;
let supA: string;
let employee: string;
let siteA: string; // NTX-BPL, MP zone A
let siteB: string; // NTX-MDP, MP zone B
let siteRJ: string; // CCW-KOT, Rajasthan, no zone: no minimum wage rule

let n = Date.now() % 100_000_000;
const next = () => ++n;
const NIL = '00000000-0000-7000-8000-000000000000';
// Zone A unskilled is ₹12,150, zone B unskilled ₹11,400, zone A skilled ₹14,700 (seed MIN_WAGES_MP).
const A_UNSKILLED = 1_215_000n;
const B_UNSKILLED = 1_140_000n;
const A_SKILLED = 1_470_000n;

async function newEmployee(joinDate = '2026-11-01') {
  const res = await request('POST', '/employees', {
    cookie: hr,
    body: { name: `Deploy Worker ${next()}`, dob: '1995-04-12', gender: 'MALE', mobile: `9${String(next()).padStart(9, '0')}`, joinDate },
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as { id: string; name: string };
}
const body = (siteId: string, over: Record<string, unknown> = {}) => ({
  siteId,
  designation: 'Helper',
  skillLevel: 'UNSKILLED',
  monthlyCtcPaise: String(A_UNSKILLED),
  effectiveFrom: '2026-11-02',
  ...over,
});
const deploy = (id: string, b: Record<string, unknown>, cookie = hr) => request('POST', `/employees/${id}/deployments`, { cookie, body: b });
const redeploy = (id: string, b: Record<string, unknown>, cookie = hr) => request('POST', `/employees/${id}/redeploy`, { cookie, body: b });
const revise = (id: string, b: Record<string, unknown>, cookie = hr) => request('POST', `/employees/${id}/salary-revisions`, { cookie, body: b });
const history = (id: string, q = '', cookie = hr) => request('GET', `/employees/${id}/deployments${q}`, { cookie });
const auditRows = (action: string, entityId: string) => db.orm.audit.AuditLog.where({ action: action as never, entityId: entityId as never }).all();
const siteId = async (code: string) => (await db.orm.app.Site.where({ code: code as never }).first())!.id as string;

let counter = 0;
async function newClient() {
  const made = await request('POST', '/clients', { cookie: hr, body: { code: `ZD-${next()}`, name: 'Deploy Test Client', stateCode: 'MP' } });
  expect(made.status).toBe(201);
  return made.body.id as string;
}
async function newSite(clientId: string, over: Record<string, unknown> = {}) {
  const made = await request('POST', '/sites', {
    cookie: hr,
    body: { clientId, code: `ZD-${next()}-${++counter}`, name: 'Deploy Site', stateCode: 'MP', district: 'Bhopal', pincode: '462001', minWageZone: 'A', ...over },
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body.id as string;
}

beforeAll(async () => {
  admin = await login(mobileOf('admin'));
  hr = await login(mobileOf('hr'));
  payroll = await login(mobileOf('payroll'));
  auditor = await login(mobileOf('auditor'));
  accountsRole = await login(mobileOf('accounts'));
  supA = await login(mobileOf('supA'));
  employee = await login(mobileOf('employee'));
  siteA = await siteId('NTX-BPL');
  siteB = await siteId('NTX-MDP');
  siteRJ = await siteId('CCW-KOT');
});
afterAll(() => db.close());

describe('access', () => {
  test('M3-DEP-01 AC1: no session → 401; auditor, accounts, supervisor, employee cannot write → 403', async () => {
    expect((await request('POST', `/employees/${NIL}/deployments`, { body: body(siteA) })).status).toBe(401);
    for (const cookie of [auditor, accountsRole, supA, employee]) {
      expect((await deploy(NIL, body(siteA), cookie)).status).toBe(403);
      expect((await redeploy(NIL, body(siteA), cookie)).status).toBe(403);
      expect((await revise(NIL, { effectiveFrom: '2026-12-01', monthlyCtcPaise: '1', reason: 'x' }, cookie)).status).toBe(403);
      expect((await request('PUT', `/employees/${NIL}/staff-type`, { cookie, body: { staffType: 'HQ' } })).status).toBe(403);
    }
  });

  test('M3-DEP-03 AC1: HQ staff and the auditor read the history; supervisor and employee cannot (pay is in it)', async () => {
    const e = await newEmployee();
    for (const cookie of [admin, hr, payroll, auditor]) expect((await history(e.id, '', cookie)).status).toBe(200);
    for (const cookie of [supA, employee]) expect((await history(e.id, '', cookie)).status).toBe(403);
    expect((await request('GET', `/employees/${e.id}/deployments`)).status).toBe(401);
    expect((await history(NIL)).status).toBe(404);
  });
});

describe('deploy (M3-DEP-01)', () => {
  test('M3-DEP-01 AC1: creates the deployment with client, site, designation, skill, CTC and from date; the profile follows; audited', async () => {
    const e = await newEmployee();
    const res = await deploy(e.id, body(siteA, { designation: '  Loader ', monthlyCtcPaise: '1300000' }));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toMatchObject({
      employeeId: e.id,
      siteId: siteA,
      siteCode: 'NTX-BPL',
      clientName: expect.any(String),
      designation: 'Loader',
      skillLevel: 'UNSKILLED',
      monthlyCtcPaise: '1300000',
      kind: 'DEPLOY',
      effectiveFrom: '2026-11-02',
      effectiveTo: null,
      status: 'ACTIVE',
    });
    const emp = await db.orm.app.Employee.where({ id: e.id as never }).first();
    expect(emp).toMatchObject({ designation: 'Loader', skillLevel: 'UNSKILLED' });
    const rows = await auditRows('deployment.create', res.body.id);
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0]!.after)).toContain('1300000');
  });

  test('M3-DEP-01 AC1: the salary template defaults from the client setting (designation first, then the client default) unless one is given', async () => {
    const client = await newClient();
    const site = await newSite(client);
    const templates = await db.orm.app.SalaryTemplate.all();
    const [tA, tB] = [templates.find((t) => t.code === 'MIN_WAGE')!.id, templates.find((t) => t.code === 'CONSOLIDATED')!.id];
    const adminUser = (await db.orm.app.User.where({ mobile: mobileOf('admin') as never }).first())!.id;
    const put = (key: string, value: string) =>
      db.orm.app.PaySetting.create({
        scope: 'CLIENT',
        scopeId: client,
        key,
        value,
        effectiveFrom: Temporal.PlainDate.from('2026-01-01'),
        effectiveTo: null,
        createdBy: null,
        approvedBy: adminUser,
        approvedAt: Temporal.Now.instant(),
      } as never);
    await put('SALARY_TEMPLATE', tA as string);
    await put('SALARY_TEMPLATE:Welder', tB as string);
    const [e1, e2, e3] = [await newEmployee(), await newEmployee(), await newEmployee()];
    expect((await deploy(e1.id, body(site, { designation: 'Helper' }))).body.templateId).toBe(tA);
    expect((await deploy(e2.id, body(site, { designation: 'welder' }))).body.templateId).toBe(tB);
    expect((await deploy(e3.id, body(site, { templateId: tB }))).body.templateId).toBe(tB);
    const bogus = await deploy((await newEmployee()).id, body(site, { templateId: NIL }));
    expect(bogus).toMatchObject({ status: 422, body: { error: { code: 'TEMPLATE_INVALID' } } });
  });

  test('M3-DEP-01 AC1: blank, too long, bad skill, bad money, bad date, missing fields → 422 VALIDATION_FAILED with paths', async () => {
    const e = await newEmployee();
    const cases: [string, Record<string, unknown>][] = [
      ['designation', { designation: '   ' }],
      ['designation', { designation: 'x'.repeat(81) }],
      ['skillLevel', { skillLevel: 'EXPERT' }],
      ['skillLevel', { skillLevel: 'skilled' }],
      ['monthlyCtcPaise', { monthlyCtcPaise: '0' }],
      ['monthlyCtcPaise', { monthlyCtcPaise: '-5' }],
      ['monthlyCtcPaise', { monthlyCtcPaise: '12.5' }],
      ['effectiveFrom', { effectiveFrom: '02-11-2026' }],
      ['siteId', { siteId: 'not-a-uuid' }],
    ];
    for (const [path, over] of cases) {
      const res = await deploy(e.id, body(siteA, over));
      expect(res.status, path).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain(path);
    }
    expect((await deploy(e.id, {})).status).toBe(422);
  });

  test('M3-DEP-01 AC2: unknown site → 404; inactive client or closed site → 422; exited employee → 422; unknown employee → 404', async () => {
    const e = await newEmployee();
    expect((await deploy(e.id, body(NIL))).status).toBe(404);
    expect((await deploy(NIL, body(siteA))).status).toBe(404);
    const deadClient = await newClient();
    const siteOfDead = await newSite(deadClient);
    expect((await request('POST', `/clients/${deadClient}/deactivate`, { cookie: admin })).status).toBe(200);
    expect(await deploy(e.id, body(siteOfDead))).toMatchObject({ status: 422, body: { error: { code: 'CLIENT_INACTIVE' } } });
    const liveClient = await newClient();
    const closed = await newSite(liveClient);
    expect((await request('POST', `/sites/${closed}/close`, { cookie: admin })).status).toBe(200);
    expect(await deploy(e.id, body(closed))).toMatchObject({ status: 422, body: { error: { code: 'SITE_INACTIVE' } } });
    expect((await history(e.id)).body.items).toHaveLength(0);
  });

  test('M3-DEP-01 AC3: a second deployment while one is running → 409 ALREADY_DEPLOYED; after it ends, a later start is fine', async () => {
    const e = await newEmployee();
    expect((await deploy(e.id, body(siteA))).status).toBe(201);
    expect(await deploy(e.id, body(siteB, { effectiveFrom: '2026-12-01' }))).toMatchObject({ status: 409, body: { error: { code: 'ALREADY_DEPLOYED' } } });
    expect(await deploy(e.id, body(siteB, { effectiveFrom: '2026-11-05' }))).toMatchObject({ status: 409, body: { error: { code: 'ALREADY_DEPLOYED' } } });
    expect((await history(e.id)).body.items).toHaveLength(1);
  });

  test('M3-DEP-01 AC4: pay one paisa below the minimum wage for the site zone and skill blocks the save; the exact minimum passes', async () => {
    const [e1, e2, e3, e4] = [await newEmployee(), await newEmployee(), await newEmployee(), await newEmployee()];
    const low = await deploy(e1.id, body(siteA, { monthlyCtcPaise: String(A_UNSKILLED - 1n) }));
    expect(low).toMatchObject({ status: 422, body: { error: { code: 'BELOW_MINIMUM_WAGE', details: { minimumMonthlyPaise: String(A_UNSKILLED), state: 'MP', zone: 'A', skill: 'UNSKILLED' } } } });
    expect((await history(e1.id)).body.items).toHaveLength(0);
    expect((await deploy(e2.id, body(siteA, { monthlyCtcPaise: String(A_UNSKILLED) }))).status).toBe(201);
    // the same pay fails for a skilled worker in zone A but is plenty in zone B unskilled (₹11,400)
    expect((await deploy(e3.id, body(siteA, { skillLevel: 'SKILLED', monthlyCtcPaise: String(A_SKILLED - 1n) }))).body.error.code).toBe('BELOW_MINIMUM_WAGE');
    expect((await deploy(e4.id, body(siteB, { monthlyCtcPaise: String(B_UNSKILLED) }))).status).toBe(201);
  });

  test('M3-DEP-01 AC4: a rate that took effect later is not used for an earlier start; a site with no zone or no rule cannot be checked → 422 MIN_WAGE_NOT_CONFIGURED', async () => {
    const e = await newEmployee();
    // seed: zone A unskilled was ₹11,800 until 31 Mar 2026, ₹12,150 after; joining is 1 Nov so the new rate applies
    expect((await deploy(e.id, body(siteRJ, { monthlyCtcPaise: '99999999' }))).body.error.code).toBe('MIN_WAGE_NOT_CONFIGURED');
    const noZone = await newSite(await newClient(), { minWageZone: undefined });
    expect((await deploy(e.id, body(noZone, { monthlyCtcPaise: '99999999' }))).body.error.code).toBe('MIN_WAGE_NOT_CONFIGURED');
  });

  test('M3-DEP-01 AC1: a start before the joining date → 422 BEFORE_JOINING', async () => {
    const e = await newEmployee('2026-11-10');
    expect(await deploy(e.id, body(siteA, { effectiveFrom: '2026-11-09' }))).toMatchObject({ status: 422, body: { error: { code: 'BEFORE_JOINING' } } });
    expect((await deploy(e.id, body(siteA, { effectiveFrom: '2026-11-10' }))).status).toBe(201);
  });
});

describe('redeploy (M3-DEP-02)', () => {
  test('M3-DEP-02 AC1: ends the running deployment the day before and starts the new one in one step', async () => {
    const e = await newEmployee();
    const first = (await deploy(e.id, body(siteA, { effectiveFrom: '2026-11-02' }))).body;
    const res = await redeploy(e.id, body(siteB, { effectiveFrom: '2026-11-20', designation: 'Senior Helper', monthlyCtcPaise: '1250000' }));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.ended).toMatchObject({ id: first.id, effectiveTo: '2026-11-19' });
    expect(res.body.started).toMatchObject({ siteId: siteB, kind: 'REDEPLOY', effectiveFrom: '2026-11-20', effectiveTo: null, designation: 'Senior Helper' });
    const list = (await history(e.id)).body.items;
    expect(list.map((d: { siteCode: string }) => d.siteCode)).toEqual(['NTX-MDP', 'NTX-BPL']);
    expect(await auditRows('deployment.redeploy', res.body.started.id)).toHaveLength(1);
  });

  test('M3-DEP-02 AC1: a move that fails a rule changes nothing (the old deployment stays open)', async () => {
    const e = await newEmployee();
    await deploy(e.id, body(siteA));
    const bad = await redeploy(e.id, body(siteB, { effectiveFrom: '2026-11-20', monthlyCtcPaise: String(B_UNSKILLED - 1n) }));
    expect(bad.body.error.code).toBe('BELOW_MINIMUM_WAGE');
    const items = (await history(e.id)).body.items;
    expect(items).toHaveLength(1);
    expect(items[0].effectiveTo).toBeNull();
  });

  test('M3-DEP-02 AC1: same site, a date not after the start, no running deployment, inactive target → 422', async () => {
    const e = await newEmployee();
    expect(await redeploy(e.id, body(siteB))).toMatchObject({ status: 422, body: { error: { code: 'NOT_DEPLOYED' } } });
    await deploy(e.id, body(siteA, { effectiveFrom: '2026-11-02' }));
    expect(await redeploy(e.id, body(siteA, { effectiveFrom: '2026-11-20' }))).toMatchObject({ status: 422, body: { error: { code: 'SAME_SITE' } } });
    expect(await redeploy(e.id, body(siteB, { effectiveFrom: '2026-11-02' }))).toMatchObject({ status: 422, body: { error: { code: 'DATE_NOT_AFTER_START' } } });
    const dead = await newSite(await newClient());
    expect((await request('POST', `/sites/${dead}/close`, { cookie: admin })).status).toBe(200);
    expect(await redeploy(e.id, body(dead, { effectiveFrom: '2026-11-20' }))).toMatchObject({ status: 422, body: { error: { code: 'SITE_INACTIVE' } } });
  });

  test('M3-DEP-02 AC2: leave balance, bank and profile are untouched by a move (they belong to the employee)', async () => {
    const e = await newEmployee();
    await deploy(e.id, body(siteA));
    const before = await db.orm.app.LeaveLedger.where({ employeeId: e.id as never }).all();
    const code = (await db.orm.app.Employee.where({ id: e.id as never }).first())!.code;
    expect((await redeploy(e.id, body(siteB, { effectiveFrom: '2026-11-20' }))).status).toBe(201);
    expect(await db.orm.app.LeaveLedger.where({ employeeId: e.id as never }).all()).toHaveLength(before.length);
    expect((await db.orm.app.Employee.where({ id: e.id as never }).first())!.code).toBe(code);
  });

  // M3-DEP-02 AC3 n/a: splitting the month's paid days by deployment is the payroll engine (M8); the dated rows it reads are proven by AC1 here.
  test('M3-DEP-02 AC1: the DB itself refuses overlapping deployments (exclusion constraint)', async () => {
    const e = await newEmployee();
    await deploy(e.id, body(siteA, { effectiveFrom: '2026-11-02' }));
    await expect(
      db.orm.app.Deployment.create({ employeeId: e.id, siteId: siteB, designation: 'x', skillLevel: 'UNSKILLED', monthlyCtcPaise: 1n, kind: 'DEPLOY', effectiveFrom: Temporal.PlainDate.from('2026-12-01'), effectiveTo: null } as never),
    ).rejects.toThrow();
  });
});

describe('history (M3-DEP-03)', () => {
  test('M3-DEP-03 AC1 AC2: newest first with client, site, designation, CTC, from/to; asOf returns the one running that date, none outside', async () => {
    const e = await newEmployee();
    await deploy(e.id, body(siteA, { effectiveFrom: '2026-11-02' }));
    await redeploy(e.id, body(siteB, { effectiveFrom: '2026-11-20' }));
    const all = (await history(e.id)).body;
    expect(all.items.map((d: { effectiveFrom: string }) => d.effectiveFrom)).toEqual(['2026-11-20', '2026-11-02']);
    expect(all.items[1]).toMatchObject({ siteCode: 'NTX-BPL', effectiveTo: '2026-11-19', clientName: expect.any(String), monthlyCtcPaise: String(A_UNSKILLED) });
    const at = async (d: string) => (await history(e.id, `?asOf=${d}`)).body.items as { siteCode: string }[];
    expect((await at('2026-11-19')).map((d) => d.siteCode)).toEqual(['NTX-BPL']);
    expect((await at('2026-11-20')).map((d) => d.siteCode)).toEqual(['NTX-MDP']);
    expect((await at('2030-01-01')).map((d) => d.siteCode)).toEqual(['NTX-MDP']); // open-ended
    expect(await at('2026-11-01')).toEqual([]);
    expect((await history(e.id, '?asOf=2026-13-01')).status).toBe(422);
  });

  test('M3-DEP-03 AC3: a deployment can only be ended, never deleted: the API has no delete or edit route for it', async () => {
    const e = await newEmployee();
    const d = (await deploy(e.id, body(siteA))).body;
    for (const method of ['DELETE', 'PATCH'] as const) {
      expect([404, 405]).toContain((await request(method, `/employees/${e.id}/deployments/${d.id}`, { cookie: admin })).status);
    }
    expect((await history(e.id)).body.items).toHaveLength(1);
  });
});

describe('staff type (M3-DEP-04)', () => {
  test('M3-DEP-04 AC1 AC2: internal staff get cost centre "RS Staffing", no client needed; deployed staff show the client they are deployed to', async () => {
    const e = await newEmployee();
    const internal = await request('PUT', `/employees/${e.id}/staff-type`, { cookie: hr, body: { staffType: 'HQ' } });
    expect(internal.body).toEqual({ id: e.id, staffType: 'HQ', category: 'INTERNAL', payrollCentre: 'RS Staffing' });
    expect((await db.orm.app.Employee.where({ id: e.id as never }).first())!.staffType).toBe('HQ');
    expect(await auditRows('employee.staff_type', e.id)).toHaveLength(1);
    const back = await request('PUT', `/employees/${e.id}/staff-type`, { cookie: payroll, body: { staffType: 'DEPLOYED' } });
    expect(back.body).toMatchObject({ category: 'DEPLOYED', payrollCentre: null });
    await deploy(e.id, body(siteA));
    const deployed = await request('PUT', `/employees/${e.id}/staff-type`, { cookie: hr, body: { staffType: 'DEPLOYED' } });
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(200);
    expect(deployed.body.payrollCentre).toBe((await history(e.id)).body.items[0].clientName);
  });

  test('M3-DEP-04 AC1 AC2: deployed staff need a deployment; internal staff cannot be deployed, and cannot go internal while one is open', async () => {
    const e = await newEmployee();
    await deploy(e.id, body(siteA));
    expect(await request('PUT', `/employees/${e.id}/staff-type`, { cookie: hr, body: { staffType: 'SUPERVISOR' } })).toMatchObject({ status: 422, body: { error: { code: 'OPEN_DEPLOYMENT' } } });
    const i = await newEmployee();
    await request('PUT', `/employees/${i.id}/staff-type`, { cookie: hr, body: { staffType: 'SUPERVISOR' } });
    expect(await deploy(i.id, body(siteA))).toMatchObject({ status: 422, body: { error: { code: 'INTERNAL_NOT_DEPLOYABLE' } } });
    expect(await redeploy(i.id, body(siteA))).toMatchObject({ status: 422, body: { error: { code: 'INTERNAL_NOT_DEPLOYABLE' } } });
    for (const bad of ['', 'INTERNAL', 'hq']) {
      expect((await request('PUT', `/employees/${e.id}/staff-type`, { cookie: hr, body: { staffType: bad } })).body.error.code).toBe('VALIDATION_FAILED');
    }
    expect((await request('PUT', `/employees/${NIL}/staff-type`, { cookie: hr, body: { staffType: 'HQ' } })).status).toBe(404);
  });

  test('M3-DEP-04 AC3: a seeded internal supervisor has no deployment at all; supervisor-to-site links are site scopes, not deployments (M2-SIT-06)', async () => {
    const sup = await db.orm.app.Employee.where({ code: 'SUP-A' as never }).first();
    const emp = sup ?? (await db.orm.app.Employee.where({ staffType: 'SUPERVISOR' as never }).first())!;
    const res = await history(emp.id as string);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ staffType: 'SUPERVISOR', items: [] });
  });
});

describe('salary revision (M3-DEP-05)', () => {
  test('M3-DEP-05 AC1 AC3: a new version from the date closes the old one the day before; both stay in the history; audited', async () => {
    const e = await newEmployee();
    await deploy(e.id, body(siteA, { effectiveFrom: '2026-11-02' }));
    const res = await revise(e.id, { effectiveFrom: '2026-12-01', monthlyCtcPaise: '1400000', reason: 'Annual increment' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toMatchObject({ kind: 'REVISION', reason: 'Annual increment', monthlyCtcPaise: '1400000', effectiveFrom: '2026-12-01', effectiveTo: null, siteId: siteA, designation: 'Helper' });
    const items = (await history(e.id)).body.items;
    expect(items.map((d: { kind: string; effectiveTo: string | null }) => [d.kind, d.effectiveTo])).toEqual([['REVISION', null], ['DEPLOY', '2026-11-30']]);
    expect((await history(e.id, '?asOf=2026-11-30')).body.items[0].monthlyCtcPaise).toBe(String(A_UNSKILLED));
    expect(await auditRows('deployment.revise', res.body.id)).toHaveLength(1);
  });

  test('M3-DEP-05 AC2: a back-dated revision (before today) is accepted so arrears can be computed later', async () => {
    const e = await newEmployee();
    await deploy(e.id, body(siteA, { effectiveFrom: '2026-11-02' }));
    const res = await revise(e.id, { effectiveFrom: '2026-11-05', monthlyCtcPaise: '1500000', reason: 'Back-dated increment' });
    expect(res.status).toBe(201);
    expect((await history(e.id, '?asOf=2026-11-10')).body.items[0].monthlyCtcPaise).toBe('1500000');
  });

  test('M3-DEP-05 AC1: below the minimum wage, a date not after the deployment start, no deployment, bad input → 422', async () => {
    const e = await newEmployee();
    expect(await revise(e.id, { effectiveFrom: '2026-12-01', monthlyCtcPaise: '1500000', reason: 'x' })).toMatchObject({ status: 422, body: { error: { code: 'NOT_DEPLOYED' } } });
    await deploy(e.id, body(siteA, { effectiveFrom: '2026-11-02' }));
    expect((await revise(e.id, { effectiveFrom: '2026-12-01', monthlyCtcPaise: String(A_UNSKILLED - 1n), reason: 'cut' })).body.error.code).toBe('BELOW_MINIMUM_WAGE');
    expect((await revise(e.id, { effectiveFrom: '2026-11-02', monthlyCtcPaise: '1500000', reason: 'same day' })).body.error.code).toBe('DATE_NOT_AFTER_START');
    for (const bad of [{ reason: '   ' }, { reason: 'x'.repeat(201) }, { monthlyCtcPaise: '0' }, { effectiveFrom: 'soon' }]) {
      const res = await revise(e.id, { effectiveFrom: '2026-12-01', monthlyCtcPaise: '1500000', reason: 'ok', ...bad });
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    }
    expect((await history(e.id)).body.items).toHaveLength(1);
    expect((await revise(NIL, { effectiveFrom: '2026-12-01', monthlyCtcPaise: '1500000', reason: 'x' })).status).toBe(404);
  });

  test('M3-DEP-05 AC1: a revision can change the salary template, and a template of another client is refused', async () => {
    const e = await newEmployee();
    await deploy(e.id, body(siteA));
    const t = (await db.orm.app.SalaryTemplate.where({ code: 'CONSOLIDATED' as never }).first())!.id as string;
    const ok = await revise(e.id, { effectiveFrom: '2026-12-01', monthlyCtcPaise: '1500000', reason: 'new structure', templateId: t });
    expect(ok.body.templateId).toBe(t);
    expect((await revise(e.id, { effectiveFrom: '2026-12-15', monthlyCtcPaise: '1500000', reason: 'x', templateId: NIL })).body.error.code).toBe('TEMPLATE_INVALID');
  });
});
