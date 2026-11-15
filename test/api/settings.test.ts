// Pay settings end to end against the seeded database (npm run seed:reset): M2-SET-01..04, 06, 09, 10.
// Every client and site these tests use is created fresh, so reruns need no reset. Company-wide rows
// are only proposed (never approved) so the shared company values stay as seeded.
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { db } from '../../src/prisma/db.ts';
import { mobileOf, testApp } from '../helpers.ts';

const { request, login } = testApp();
let admin: string;
let hr: string;
let payroll: string;
let auditor: string;
let supA: string;
let employee: string;
let client: string;
let otherClient: string;
let site: string;
let globalTemplate: string;
let foreignTemplate: string;

let counter = Date.now() % 100_000_000;
const NIL = '00000000-0000-7000-8000-000000000000';
const month = (offset: number) => Temporal.Now.plainDateISO('Asia/Kolkata').toPlainYearMonth().add({ months: offset }).toPlainDate({ day: 1 }).toString();
const NOW = month(0);
const NEXT = month(1);
const AFTER = month(2);

const propose = (cookie: string | undefined, over: Record<string, unknown>) =>
  request('POST', '/settings', { cookie, body: { scope: 'CLIENT', scopeId: client, effectiveFrom: NOW, ...over } });
/** Proposed by HR, approved by Payroll: the normal two-person path. */
async function setting(over: Record<string, unknown>) {
  const made = await propose(hr, over);
  expect(made.status).toBe(201);
  const done = await request('POST', `/settings/${made.body.id}/approve`, { cookie: payroll });
  expect(done.status).toBe(200);
  return done.body as { id: string; status: string; effectiveFrom: string; effectiveTo: string | null };
}
const clientView = async (id = client, asOf?: string) =>
  Object.fromEntries(
    (((await request('GET', `/clients/${id}/settings${asOf ? `?asOf=${asOf}` : ''}`, { cookie: hr })).body.settings ?? []) as { key: string; value: string | null; source: string }[]).map((s) => [s.key, s]),
  );
const siteView = async (asOf?: string) =>
  Object.fromEntries(
    (((await request('GET', `/sites/${site}/settings${asOf ? `?asOf=${asOf}` : ''}`, { cookie: hr })).body.settings ?? []) as { key: string; value: string | null; source: string }[]).map((s) => [s.key, s]),
  );
const auditRows = (action: string, entityId: string) => db.orm.audit.AuditLog.where({ action: action as never, entityId: entityId as never }).all();
async function newClient() {
  const made = await request('POST', '/clients', { cookie: hr, body: { code: `ZS-${++counter}`, name: 'Settings Test Client', stateCode: 'MP' } });
  expect(made.status).toBe(201);
  return made.body.id as string;
}

beforeAll(async () => {
  admin = await login(mobileOf('admin'));
  hr = await login(mobileOf('hr'));
  payroll = await login(mobileOf('payroll'));
  auditor = await login(mobileOf('auditor'));
  supA = await login(mobileOf('supA'));
  employee = await login(mobileOf('employee'));
  client = await newClient();
  otherClient = await newClient();
  const made = await request('POST', '/sites', { cookie: hr, body: { clientId: client, code: `ZS-${++counter}`, name: 'Settings Site', stateCode: 'MP', district: 'Bhopal', pincode: '462001' } });
  expect(made.status).toBe(201);
  site = made.body.id;
  globalTemplate = (await db.orm.app.SalaryTemplate.all()).find((t) => t.clientId === null && t.status === 'ACTIVE')!.id;
  const foreign = await db.orm.app.SalaryTemplate.create({ code: `ZT-${++counter}`, name: 'Foreign template', clientId: otherClient } as never);
  foreignTemplate = foreign.id;
});
afterAll(() => db.close());

describe('access and validation', () => {
  test('no session → 401; supervisor, employee and auditor cannot write; HQ roles read, supervisor and employee cannot', async () => {
    expect((await propose(undefined, { key: 'OT_BASE', value: 'GROSS' })).status).toBe(401);
    for (const cookie of [supA, employee, auditor]) expect((await propose(cookie, { key: 'OT_BASE', value: 'GROSS' })).status).toBe(403);
    expect((await request('POST', `/settings/${NIL}/approve`, { cookie: auditor })).status).toBe(403);
    expect((await request('GET', `/clients/${client}/settings`, { cookie: auditor })).status).toBe(200);
    for (const cookie of [supA, employee]) expect((await request('GET', `/clients/${client}/settings`, { cookie })).status).toBe(403);
    expect((await request('GET', `/sites/${site}/settings`, { cookie: supA })).status).toBe(403);
  });

  test('M2-SET-10 AC1: bad key, bad value, wrong scope, missing or stray scopeId → 422 VALIDATION_FAILED with a field path', async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ key: 'NOPE', value: '1' }, 'key'],
      [{ key: 'OT_DIVISOR', value: '28' }, 'value'],
      [{ key: 'OT_HOURS_PER_DAY', value: '0' }, 'value'],
      [{ key: 'OT_HOURS_PER_DAY', value: '25' }, 'value'],
      [{ key: 'OT_BASE', value: '   ' }, 'value'],
      [{ key: 'PAY_PERIOD_START_DAY', scope: 'SITE', scopeId: site, value: '26' }, 'scope'],
      [{ key: 'PAY_PERIOD_START_DAY', scope: 'COMPANY', scopeId: null, value: '26' }, 'scope'],
      [{ key: 'OT_BASE', scope: 'COMPANY', value: 'GROSS' }, 'scopeId'],
      [{ key: 'OT_BASE', scopeId: null, value: 'GROSS' }, 'scopeId'],
      [{ key: 'OT_BASE', value: 'GROSS', effectiveFrom: '2026-13-40' }, 'effectiveFrom'],
      [{ key: 'OT_BASE', value: 'GROSS', designation: 'X' }, 'designation'],
    ];
    for (const [over, path] of cases) {
      const res = await propose(hr, over);
      expect(res.status, JSON.stringify(over)).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain(path);
    }
    expect((await request('POST', '/settings', { cookie: hr, body: {} })).status).toBe(422);
  });

  test('unknown client or site → 409 REFERENCE_MISSING; inactive client and closed site → 422', async () => {
    expect(await propose(hr, { scopeId: NIL, key: 'OT_BASE', value: 'GROSS' })).toMatchObject({ status: 409, body: { error: { code: 'REFERENCE_MISSING' } } });
    expect(await propose(hr, { scope: 'SITE', scopeId: NIL, key: 'OT_BASE', value: 'GROSS' })).toMatchObject({ status: 409, body: { error: { code: 'REFERENCE_MISSING' } } });
    expect((await request('GET', `/clients/${NIL}/settings`, { cookie: hr })).status).toBe(404);
    expect((await request('GET', `/sites/${NIL}/settings`, { cookie: hr })).status).toBe(404);

    const dead = await newClient();
    expect((await request('POST', `/clients/${dead}/deactivate`, { cookie: admin })).status).toBe(200);
    expect(await propose(hr, { scopeId: dead, key: 'OT_BASE', value: 'GROSS' })).toMatchObject({ status: 422, body: { error: { code: 'CLIENT_INACTIVE' } } });

    const closing = await request('POST', '/sites', { cookie: hr, body: { clientId: otherClient, code: `ZS-${++counter}`, name: 'Closing', stateCode: 'MP', district: 'Bhopal', pincode: '462001' } });
    expect((await request('POST', `/sites/${closing.body.id}/close`, { cookie: admin })).status).toBe(200);
    expect(await propose(hr, { scope: 'SITE', scopeId: closing.body.id, key: 'OT_BASE', value: 'GROSS' })).toMatchObject({ status: 422, body: { error: { code: 'SITE_CLOSED' } } });
  });

  test('M2-SET-10 AC1: company-wide values are Admin only; the Admin proposal is pending and changes nothing', async () => {
    const body = { scope: 'COMPANY', key: 'OT_HOURS_PER_DAY', value: '9', effectiveFrom: NEXT };
    expect((await request('POST', '/settings', { cookie: hr, body })).status).toBe(403);
    const made = await request('POST', '/settings', { cookie: admin, body });
    expect(made).toMatchObject({ status: 201, body: { scope: 'COMPANY', scopeId: null, status: 'PENDING' } });
    expect((await request('POST', `/settings/${made.body.id}/approve`, { cookie: payroll })).status).toBe(403);
    expect((await clientView())['OT_HOURS_PER_DAY']).toMatchObject({ value: '8', source: 'COMPANY' });
  });
});

describe('M2-SET-10 maker-checker and dated rows', () => {
  test('M2-SET-10 AC4: pending grants nothing; the creator cannot approve; a second person can; a second approval is refused; audit rows carry before/after', async () => {
    const made = await propose(hr, { key: 'OT_DIVISOR', value: '30' });
    expect(made).toMatchObject({ status: 201, body: { key: 'OT_DIVISOR', value: '30', status: 'PENDING', approvedBy: null } });
    expect((await clientView())['OT_DIVISOR']).toMatchObject({ value: '26', source: 'COMPANY' });

    expect(await request('POST', `/settings/${made.body.id}/approve`, { cookie: hr })).toMatchObject({ status: 422, body: { error: { code: 'MAKER_CHECKER' } } });
    expect((await clientView())['OT_DIVISOR']).toMatchObject({ value: '26' });

    const done = await request('POST', `/settings/${made.body.id}/approve`, { cookie: payroll });
    expect(done).toMatchObject({ status: 200, body: { status: 'ACTIVE' } });
    expect(done.body.approvedBy).not.toBe(done.body.createdBy);
    expect((await clientView())['OT_DIVISOR']).toMatchObject({ value: '30', source: 'CLIENT' });
    expect(await request('POST', `/settings/${made.body.id}/approve`, { cookie: payroll })).toMatchObject({ status: 422, body: { error: { code: 'ALREADY_APPROVED' } } });

    const proposed = await auditRows('setting.propose', made.body.id);
    const approved = await auditRows('setting.approve', made.body.id);
    expect(proposed).toHaveLength(1);
    expect(approved).toHaveLength(1);
    expect(proposed[0]!.before).toBeNull();
    expect(approved[0]!.before).toMatchObject({ status: 'PENDING' });
    expect(approved[0]!.after).toMatchObject({ status: 'ACTIVE' }); // only changed fields are kept
    expect(approved[0]!.after).toHaveProperty('approvedBy');
    expect((await request('POST', `/settings/${NIL}/approve`, { cookie: payroll })).status).toBe(404);
  });

  test('M2-SET-10 AC4 M2-SET-01 AC3: a new value starts later, the old one ends the day before; a start on or before the current value → 409 OVERLAP; past months → 422', async () => {
    const first = await setting({ key: 'OT_BASE', value: 'GROSS' });
    const second = await setting({ key: 'OT_BASE', value: 'STATUTORY', effectiveFrom: NEXT });
    const rows = (await request('GET', `/settings?scope=CLIENT&scopeId=${client}&key=OT_BASE`, { cookie: hr })).body.items as { id: string; effectiveTo: string | null; status: string }[];
    const ended = rows.find((r) => r.id === first.id)!;
    expect(ended.effectiveTo).toBe(Temporal.PlainDate.from(NEXT).subtract({ days: 1 }).toString());
    expect(rows.find((r) => r.id === second.id)).toMatchObject({ effectiveTo: null, status: 'SCHEDULED' });

    for (const from of [NEXT, NOW]) expect(await propose(hr, { key: 'OT_BASE', value: 'GROSS', effectiveFrom: from })).toMatchObject({ status: 409, body: { error: { code: 'OVERLAP' } } });
    const past = Temporal.PlainDate.from(NOW).subtract({ days: 1 }).toString();
    expect(await propose(hr, { key: 'OT_HOURS_PER_DAY', value: '10', effectiveFrom: past })).toMatchObject({ status: 422, body: { error: { code: 'EFFECTIVE_DATE_IN_PAST' } } });
  });

  test('M2-SET-10 AC2: the value used is the site\'s own, else the client\'s, else the company\'s, with where it came from', async () => {
    const c = await newClient();
    const s = await request('POST', '/sites', { cookie: hr, body: { clientId: c, code: `ZS-${++counter}`, name: 'Resolve Site', stateCode: 'MP', district: 'Bhopal', pincode: '462001' } });
    const view = async () => Object.fromEntries(((await request('GET', `/sites/${s.body.id}/settings`, { cookie: hr })).body.settings as { key: string; value: string; source: string }[]).map((x) => [x.key, x]));
    expect((await view())['PAID_DAYS_BASIS']).toMatchObject({ value: 'ACTUAL', source: 'COMPANY' });

    const approve = async (over: Record<string, unknown>) => {
      const made = await request('POST', '/settings', { cookie: hr, body: { effectiveFrom: NOW, ...over } });
      expect(made.status).toBe(201);
      expect((await request('POST', `/settings/${made.body.id}/approve`, { cookie: payroll })).status).toBe(200);
    };
    await approve({ scope: 'CLIENT', scopeId: c, key: 'PAID_DAYS_BASIS', value: '26' });
    expect((await view())['PAID_DAYS_BASIS']).toMatchObject({ value: '26', source: 'CLIENT' });
    await approve({ scope: 'SITE', scopeId: s.body.id, key: 'PAID_DAYS_BASIS', value: '30' });
    expect((await view())['PAID_DAYS_BASIS']).toMatchObject({ value: '30', source: 'SITE' });
    expect((await clientView(c))['PAID_DAYS_BASIS']).toMatchObject({ value: '26', source: 'CLIENT' });
    await approve({ scope: 'SITE', scopeId: s.body.id, key: 'OT_BASE', value: 'GROSS' });
    await approve({ scope: 'SITE', scopeId: s.body.id, key: 'OT_DIVISOR', value: '30' });
    await approve({ scope: 'SITE', scopeId: s.body.id, key: 'OT_HOURS_PER_DAY', value: '9' });
    expect(await view()).toMatchObject({ OT_BASE: { value: 'GROSS', source: 'SITE' }, OT_DIVISOR: { value: '30', source: 'SITE' }, OT_HOURS_PER_DAY: { value: '9', source: 'SITE' } });
  });

  test('M2-SET-10 AC3 M2-SET-01 AC1: the pay period is the client\'s only; it falls back to the client record until a dated value replaces it', async () => {
    expect((await clientView())['PAY_PERIOD_START_DAY']).toMatchObject({ value: '1', source: 'CLIENT' });
    await setting({ key: 'PAY_PERIOD_START_DAY', value: '26' });
    expect((await clientView())['PAY_PERIOD_START_DAY']).toMatchObject({ value: '26', source: 'CLIENT' });
    expect((await siteView())['PAY_PERIOD_START_DAY']).toMatchObject({ value: '26' });
    for (const value of ['0', '29', '26.5', 'abc']) expect((await propose(hr, { key: 'PAY_PERIOD_START_DAY', value, effectiveFrom: AFTER })).status).toBe(422);
  });
});

describe('M2-SET-01..03, 06 values', () => {
  test('M2-SET-01 AC2: attendance due day and salary pay day, none until set', async () => {
    expect(await clientView()).toMatchObject({ ATTENDANCE_DUE_DAY: { value: null, source: 'NONE' }, SALARY_PAY_DAY: { value: null, source: 'NONE' } });
    await setting({ key: 'ATTENDANCE_DUE_DAY', value: '3' });
    await setting({ key: 'SALARY_PAY_DAY', value: '7' });
    expect(await clientView()).toMatchObject({ ATTENDANCE_DUE_DAY: { value: '3', source: 'CLIENT' }, SALARY_PAY_DAY: { value: '7', source: 'CLIENT' } });
  });

  test('M2-SET-01 AC3 M2-SET-09 AC1: a change from next month leaves this month as it was; asOf returns each month\'s values', async () => {
    const c = await newClient();
    const set = async (over: Record<string, unknown>) => {
      const made = await request('POST', '/settings', { cookie: hr, body: { scope: 'CLIENT', scopeId: c, key: 'PAY_PERIOD_START_DAY', ...over } });
      expect(made.status).toBe(201);
      expect((await request('POST', `/settings/${made.body.id}/approve`, { cookie: payroll })).status).toBe(200);
    };
    await set({ value: '26', effectiveFrom: NOW });
    await set({ value: '21', effectiveFrom: NEXT });
    const on = async (asOf: string) => (await clientView(c, asOf))['PAY_PERIOD_START_DAY']?.value;
    expect(await on(NOW)).toBe('26');
    expect(await on(Temporal.PlainDate.from(NEXT).subtract({ days: 1 }).toString())).toBe('26');
    expect(await on(NEXT)).toBe('21');
    expect(await on(AFTER)).toBe('21');
    expect((await request('GET', `/clients/${c}/settings?asOf=not-a-date`, { cookie: hr })).status).toBe(422);
    const history = await request('GET', `/settings?scope=CLIENT&scopeId=${c}&key=PAY_PERIOD_START_DAY`, { cookie: auditor });
    expect(history.body.items.map((r: { status: string }) => r.status).sort()).toEqual(['ACTIVE', 'SCHEDULED']);
  });

  test('M2-SET-02 AC1: paid-days basis is actual, 30 or 26 (case and spaces normalised); anything else → 422', async () => {
    for (const value of ['abc', '27', '']) expect((await propose(hr, { key: 'PAID_DAYS_BASIS', value })).status).toBe(422);
    await setting({ key: 'PAID_DAYS_BASIS', value: ' actual ' });
    expect((await clientView())['PAID_DAYS_BASIS']).toMatchObject({ value: 'ACTUAL', source: 'CLIENT' });
    expect((await propose(hr, { key: 'PAID_DAYS_BASIS', value: '26', effectiveFrom: NEXT })).status).toBe(201);
  });
  // M2-SET-02 AC2 n/a: the salary engine reads these values in Module 7 through resolveSettings (tested in test/services/settings.resolve.test.ts)

  test('M2-SET-03 AC1 AC2 AC3: weekly off defaults to Sunday, paid; one or two days or rotational, normalised; a site overrides the client', async () => {
    expect(await clientView()).toMatchObject({ WEEKLY_OFF_DAYS: { value: 'SUN', source: 'DEFAULT' }, WEEKLY_OFF_PAID: { value: 'true' } });
    for (const value of ['MON,TUE,WED', 'FUNDAY', 'SUN,SUN', '', 'SAT SUN']) expect((await propose(hr, { key: 'WEEKLY_OFF_DAYS', value })).status).toBe(422);
    await setting({ key: 'WEEKLY_OFF_DAYS', value: 'sun, sat' });
    await setting({ key: 'WEEKLY_OFF_PAID', value: 'FALSE' });
    expect(await clientView()).toMatchObject({ WEEKLY_OFF_DAYS: { value: 'SAT,SUN', source: 'CLIENT' }, WEEKLY_OFF_PAID: { value: 'false', source: 'CLIENT' } });
    await setting({ scope: 'SITE', scopeId: site, key: 'WEEKLY_OFF_DAYS', value: 'Rotational' });
    expect(await siteView()).toMatchObject({ WEEKLY_OFF_DAYS: { value: 'ROTATIONAL', source: 'SITE' }, WEEKLY_OFF_PAID: { value: 'false', source: 'CLIENT' } });
    expect((await clientView())['WEEKLY_OFF_DAYS']).toMatchObject({ value: 'SAT,SUN' });
  });

  test('M2-SET-06 AC1 AC2: every scheme is on by default; each can be switched off; PF follows the ceiling unless set to full wages', async () => {
    const c = await newClient();
    expect(await clientView(c)).toMatchObject({
      PF_APPLICABLE: { value: 'true' },
      ESI_APPLICABLE: { value: 'true' },
      PT_APPLICABLE: { value: 'true' },
      LWF_APPLICABLE: { value: 'true' },
      BONUS_APPLICABLE: { value: 'true' },
      PF_WAGE_BASIS: { value: 'CEILING', source: 'DEFAULT' },
    });
    for (const key of ['PF_APPLICABLE', 'ESI_APPLICABLE', 'PT_APPLICABLE', 'LWF_APPLICABLE', 'BONUS_APPLICABLE']) {
      expect((await propose(hr, { key, value: 'yes' })).status).toBe(422);
      await setting({ key, value: 'false' });
    }
    await setting({ key: 'PF_WAGE_BASIS', value: 'full' });
    expect(await clientView()).toMatchObject({ PF_APPLICABLE: { value: 'false', source: 'CLIENT' }, BONUS_APPLICABLE: { value: 'false' }, PF_WAGE_BASIS: { value: 'FULL', source: 'CLIENT' } });
    expect((await clientView(c))['PF_APPLICABLE']).toMatchObject({ value: 'true' });
    expect((await propose(hr, { key: 'PF_WAGE_BASIS', value: 'HALF', effectiveFrom: AFTER })).status).toBe(422);
    expect((await propose(hr, { scope: 'SITE', scopeId: site, key: 'PF_APPLICABLE', value: 'false' })).status).toBe(422);
  });
  // M2-SET-06 AC3 n/a: the PF/ESI establishment is chosen on the client (M2-CLI-01) and defaults to RS Staffing's own, see docs/DECISIONS.md
});

describe('M2-SET-04 default salary structure', () => {
  test('M2-SET-04 AC1: a default template for the client and one per designation (designation normalised), from a template that exists', async () => {
    expect((await request('GET', `/clients/${client}/salary-defaults`, { cookie: hr })).body).toMatchObject({ default: null, designations: [] });
    await setting({ key: 'SALARY_TEMPLATE', value: globalTemplate });
    await setting({ key: 'SALARY_TEMPLATE', designation: ' site   supervisor ', value: globalTemplate });
    const res = await request('GET', `/clients/${client}/salary-defaults`, { cookie: auditor });
    expect(res.body).toMatchObject({ default: { templateId: globalTemplate }, designations: [{ designation: 'SITE SUPERVISOR', templateId: globalTemplate }] });
    expect((await request('GET', `/clients/${NIL}/salary-defaults`, { cookie: hr })).status).toBe(404);
    expect((await request('GET', `/clients/${client}/salary-defaults`, { cookie: supA })).status).toBe(403);
  });

  test('M2-SET-04 AC1: unknown template → 409; another client\'s template → 422; not a uuid → 422; site level → 422', async () => {
    expect(await propose(hr, { key: 'SALARY_TEMPLATE', value: NIL, effectiveFrom: AFTER })).toMatchObject({ status: 409, body: { error: { code: 'REFERENCE_MISSING' } } });
    expect(await propose(hr, { key: 'SALARY_TEMPLATE', value: foreignTemplate, effectiveFrom: AFTER })).toMatchObject({ status: 422, body: { error: { code: 'TEMPLATE_NOT_USABLE' } } });
    expect((await propose(hr, { key: 'SALARY_TEMPLATE', value: 'basic', effectiveFrom: AFTER })).status).toBe(422);
    expect((await propose(hr, { scope: 'SITE', scopeId: site, key: 'SALARY_TEMPLATE', value: globalTemplate })).status).toBe(422);
  });
  // M2-SET-04 AC2 n/a: a deployment overrides this per employee in Module 3 (M3 deployments); this story only stores and serves the defaults
});

describe('listing', () => {
  test('M2-SET-09 AC1: history lists every row of a scope with status; filters combine; cursor paging; limit bounds', async () => {
    const all = await request('GET', `/settings?scope=CLIENT&scopeId=${client}`, { cookie: hr });
    expect(all.status).toBe(200);
    expect(all.body.items.length).toBeGreaterThan(5);
    const paged: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await request('GET', `/settings?scope=CLIENT&scopeId=${client}&limit=3${cursor ? `&cursor=${cursor}` : ''}`, { cookie: hr });
      expect(page.body.items.length).toBeLessThanOrEqual(3);
      paged.push(...page.body.items.map((r: { id: string }) => r.id));
      cursor = page.body.nextCursor ?? undefined;
    } while (cursor);
    expect(paged).toEqual(all.body.items.map((r: { id: string }) => r.id));
    expect((await request('GET', `/settings?scope=CLIENT&scopeId=${client}&key=SALARY_TEMPLATE`, { cookie: hr })).body.items.every((r: { key: string }) => r.key === 'SALARY_TEMPLATE')).toBe(true);
    expect((await request('GET', `/settings?scope=CLIENT&scopeId=${client}&key=OT_BASE&status=SCHEDULED`, { cookie: hr })).body.items).toHaveLength(1);
    expect((await request('GET', `/settings?scope=CLIENT&scopeId=${NIL}`, { cookie: hr })).body).toEqual({ items: [], nextCursor: null });
    for (const limit of [0, 101]) expect((await request('GET', `/settings?scope=CLIENT&limit=${limit}`, { cookie: hr })).status).toBe(422);
    expect((await request('GET', '/settings?scope=CLIENT&key=NOPE', { cookie: hr })).status).toBe(422);
    expect((await request('GET', '/settings', { cookie: hr })).status).toBe(422);
  });
});
