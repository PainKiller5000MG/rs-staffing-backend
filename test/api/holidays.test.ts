// Holidays end to end against the seeded database (npm run seed:reset).
// Holidays live in year 2091 and are removed at the start of each run; every client and site is new, so reruns need no reset.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { db } from '../../src/prisma/db.ts';
import { freshMobile, mobileOf, testApp } from '../helpers.ts';

const { request, login, container } = testApp();
const Y = 2091;
const NIL = '00000000-0000-7000-8000-000000000000';
let admin: string;
let hr: string;
let payroll: string;
let accounts: string;
let auditor: string;
let supA: string;
let employee: string;
const run = randomUUID().slice(0, 6).toUpperCase();
let counter = Date.now() % 1_000_000;
const codeOf = () => `H${run}${++counter}`.slice(0, 20);
const ids: Record<string, string> = {};

const d = (md: string) => `${Y}-${md}`;
const holiday = (over: Record<string, unknown> = {}): Record<string, any> => ({ date: d('03-03'), name: 'Test holiday', level: 'STATE', scopeKey: 'MH', ...over });
const add = (body: Record<string, unknown>, cookie = hr) => request('POST', '/holidays', { cookie, body });
const auditRows = (action: string, entityId: string) => db.orm.audit.AuditLog.where({ action: action as never, entityId: entityId as never }).all();
const calendar = async (siteId: string, year = Y, cookie = hr) => (await request('GET', `/sites/${siteId}/holidays?year=${year}`, { cookie })).body.items.map((h: { date: string }) => h.date) as string[];

async function newClient() {
  const res = await request('POST', '/clients', { cookie: hr, body: { code: codeOf(), name: 'Holiday Test Client', stateCode: 'MH' } });
  expect(res.status).toBe(201);
  return res.body as { id: string; code: string };
}
async function newSite(clientId: string, stateCode = 'MH') {
  const res = await request('POST', '/sites', { cookie: hr, body: { clientId, code: codeOf(), name: 'Holiday Test Site', stateCode, district: 'Pune', pincode: '411001' } });
  expect(res.status).toBe(201);
  return res.body as { id: string; code: string; clientId: string };
}
async function newEmployee(siteId: string, from = `${Y}-01-01`) {
  const n = ++counter;
  const e = await db.orm.app.Employee.create({
    code: `HT${n}`.slice(0, 12), name: `Holiday Tester ${n}`, dob: Temporal.PlainDate.from('1990-01-01'), gender: 'MALE', mobile: freshMobile(), staffType: 'DEPLOYED', designation: 'Helper', status: 'ACTIVE',
  } as never);
  await db.orm.app.Deployment.create({ employeeId: e.id, siteId, designation: 'Helper', skillLevel: 'UNSKILLED', monthlyCtcPaise: 1_300_000n, effectiveFrom: Temporal.PlainDate.from(from) } as never);
  return e.id as string;
}
async function newRun(clientId: string, siteId: string, employeeId: string, status: string, period = [d('10-01'), d('10-31')]) {
  const r = await db.orm.app.PayrollRun.create({ clientId, type: 'REGULAR', periodFrom: Temporal.PlainDate.from(period[0]!), periodTo: Temporal.PlainDate.from(period[1]!), status } as never);
  await db.orm.app.RunLine.create({
    runId: r.id, employeeId, siteId, paidDays: '30.0', lopDays: '0.0', otHours: '0.00', grossPaise: 1500000n, deductionsPaise: 101300n, netPaise: 1398700n, employerCostPaise: 1646400n,
    pfWagesPaise: 750000n, epsWagesPaise: 750000n, edliWagesPaise: 750000n, esiGrossPaise: 1500000n, lineHash: 'a'.repeat(64), snapshot: {}, status: 'OK',
  } as never);
  return r.id as string;
}

beforeAll(async () => {
  const cookies = await Promise.all((['admin', 'hr', 'payroll', 'accounts', 'auditor', 'supA', 'employee'] as const).map((k) => login(mobileOf(k))));
  [admin, hr, payroll, accounts, auditor, supA, employee] = cookies as [string, string, string, string, string, string, string];
  // Leftovers of earlier runs of this file (the unique index only counts live rows).
  const stale = await db.orm.app.Holiday.where((h) => h.year.eq(Y as never)).all();
  const who = (await db.orm.app.User.where({ mobile: mobileOf('admin') as never }).first())!.id;
  const standard = [d('01-26'), d('08-15'), d('10-02')];
  for (const h of stale) if (!h.removedAt && !(h.level === 'NATIONAL' && standard.includes(h.date.toString()))) await db.orm.app.Holiday.where({ id: h.id }).update({ removedAt: Temporal.Now.instant(), removedBy: who } as never);
  ids.clientA = (await newClient()).id;
  ids.clientB = (await newClient()).id;
  ids.siteMH1 = (await newSite(ids.clientA!)).id;
  ids.siteMH2 = (await newSite(ids.clientA!)).id;
  ids.siteRJ = (await newSite(ids.clientA!, 'RJ')).id;
  ids.siteB = (await newSite(ids.clientB!)).id;
});
afterAll(() => db.close());

describe('access', () => {
  test('M14-HOL-01 AC1: no session → 401; employee, supervisor → 403; auditor and accounts read but cannot write', async () => {
    expect((await request('GET', '/holidays')).status).toBe(401);
    for (const cookie of [employee, supA]) expect((await request('GET', '/holidays', { cookie })).status).toBe(403);
    for (const cookie of [auditor, accounts, admin, payroll, hr]) expect((await request('GET', `/holidays?year=${Y}`, { cookie })).status).toBe(200);
    for (const cookie of [employee, supA, auditor, accounts]) {
      expect((await add(holiday(), cookie)).status).toBe(403);
      expect((await request('PATCH', `/holidays/${NIL}`, { cookie, body: { name: 'X' } })).status).toBe(403);
      expect((await request('DELETE', `/holidays/${NIL}`, { cookie })).status).toBe(403);
      expect((await request('POST', '/holidays/impact', { cookie, body: { action: 'REMOVE', holidayId: NIL } })).status).toBe(403);
      expect((await request('POST', '/holidays/import', { cookie, body: { year: Y, rows: [{}] } })).status).toBe(403);
      expect((await request('POST', '/holidays/replacements', { cookie, body: { clientId: NIL, holidayId: NIL, replacementDate: d('01-01') } })).status).toBe(403);
      expect((await request('DELETE', `/holidays/replacements/${NIL}`, { cookie })).status).toBe(403);
    }
    expect((await request('GET', `/sites/${ids.siteMH1}/holidays?year=${Y}`)).status).toBe(401);
    expect((await request('GET', `/sites/${ids.siteMH1}/holidays?year=${Y}`, { cookie: employee })).status).toBe(403);
  });
});

describe('M14-HOL-01 holiday lists by level', () => {
  test('M14-HOL-01 AC1: each level stores date, name, level, key, paid, type and year; the row is audited with before/after', async () => {
    const cases = [
      holiday({ date: d('01-02'), name: '  Trimmed  ', level: 'STATE', scopeKey: 'MH', paid: true, type: 'FIXED' }),
      holiday({ date: d('01-03'), name: 'Client day', level: 'CLIENT', scopeKey: ids.clientA, type: 'OPTIONAL' }),
      holiday({ date: d('01-04'), name: 'Site day', level: 'SITE', scopeKey: ids.siteMH1, paid: false }),
    ];
    for (const body of cases) {
      const res = await add(body);
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ date: body.date, level: body.level, scopeKey: body.scopeKey, year: Y, paid: body.paid ?? true, type: body.type ?? 'FIXED', half: false });
      const [row] = await auditRows('holiday.create', res.body.id);
      expect(row!.before).toBeNull();
      expect(row!.after).toMatchObject({ date: body.date, level: body.level });
    }
    expect((await add(holiday({ date: d('01-05'), name: '  Trimmed  ' }))).body.name).toBe('Trimmed');
  });

  test('M14-HOL-01 AC2: the three national days exist for every year, paid and fixed (seeded, no setup)', async () => {
    for (const year of [2026, 2027, 2040, Y]) {
      const res = await request('GET', `/holidays?year=${year}&level=NATIONAL&limit=100`, { cookie: hr });
      expect(res.body.items.map((h: { date: string }) => h.date).sort()).toEqual([`${year}-01-26`, `${year}-08-15`, `${year}-10-02`]);
      expect(res.body.items.every((h: { paid: boolean; type: string; scopeKey: unknown }) => h.paid && h.type === 'FIXED' && h.scopeKey === null)).toBe(true);
    }
  });

  test('M14-HOL-01 AC2: a national holiday cannot be unpaid, optional, half-day or carry a key (422), and the database says the same', async () => {
    for (const over of [{ paid: false }, { type: 'OPTIONAL' }, { half: true }]) {
      expect(await add(holiday({ level: 'NATIONAL', scopeKey: null, date: d('11-11'), ...over }))).toMatchObject({ status: 422, body: { error: { code: 'VALIDATION_FAILED' } } });
    }
    expect(await add(holiday({ level: 'NATIONAL', scopeKey: 'MH', date: d('11-11') }))).toMatchObject({ status: 422, body: { error: { details: expect.anything() } } });
    const [nat] = (await request('GET', `/holidays?year=${Y}&level=NATIONAL`, { cookie: hr })).body.items;
    for (const patch of [{ paid: false }, { type: 'OPTIONAL' }, { half: true }]) {
      expect(await request('PATCH', `/holidays/${nat.id}`, { cookie: hr, body: patch })).toMatchObject({ status: 422, body: { error: { code: 'NATIONAL_HOLIDAY_FIXED' } } });
    }
    // The CHECK constraint is the backstop when the service is bypassed.
    await expect(db.orm.app.Holiday.create({ level: 'NATIONAL', scopeKey: null, date: Temporal.PlainDate.from(d('11-12')), year: Y, name: 'x', paid: false, optional: false, half: false } as never)).rejects.toThrow();
    await expect(db.orm.app.Holiday.create({ level: 'STATE', scopeKey: null, date: Temporal.PlainDate.from(d('11-12')), year: Y, name: 'x', paid: true, optional: false, half: false } as never)).rejects.toThrow();
    await expect(db.orm.app.Holiday.create({ level: 'STATE', scopeKey: 'MH', date: Temporal.PlainDate.from(d('11-12')), year: Y + 1, name: 'x', paid: true, optional: false, half: false } as never)).rejects.toThrow();
  });

  test('M14-HOL-01 AC3: state lists are entered per state per year and differ in size; an unknown state is refused', async () => {
    for (const date of ['02-01', '02-02', '02-03']) expect((await add(holiday({ date: d(date), scopeKey: 'MH' }))).status).toBe(201);
    expect((await add(holiday({ date: d('02-01'), scopeKey: 'RJ' }))).status).toBe(201);
    const count = async (key: string, year: number) => (await request('GET', `/holidays?year=${year}&level=STATE&key=${key}&limit=100`, { cookie: hr })).body.items.length as number;
    expect(await count('MH', Y)).toBeGreaterThanOrEqual(5);
    expect(await count('RJ', Y)).toBe(1);
    expect(await count('MH', Y + 1)).toBe(0);
    expect(await add(holiday({ scopeKey: 'ZZ', date: d('02-04') }))).toMatchObject({ status: 409, body: { error: { code: 'REFERENCE_MISSING' } } });
  });

  test('M14-HOL-01 AC4: same date and level key → 409 DUPLICATE (state, client, site, national); a different key or level is fine', async () => {
    const a = await add(holiday({ date: d('04-01'), level: 'CLIENT', scopeKey: ids.clientA }));
    expect(a.status).toBe(201);
    expect(await add(holiday({ date: d('04-01'), name: 'Other name', level: 'CLIENT', scopeKey: ids.clientA }))).toMatchObject({ status: 409, body: { error: { code: 'DUPLICATE' } } });
    expect((await add(holiday({ date: d('04-01'), level: 'CLIENT', scopeKey: ids.clientB }))).status).toBe(201);
    expect((await add(holiday({ date: d('04-01'), level: 'SITE', scopeKey: ids.siteMH1 }))).status).toBe(201);
    expect(await add(holiday({ date: d('04-01'), level: 'SITE', scopeKey: ids.siteMH1 }))).toMatchObject({ status: 409 });
    expect(await add(holiday({ level: 'NATIONAL', scopeKey: null, date: d('01-26') }))).toMatchObject({ status: 409, body: { error: { code: 'DUPLICATE' } } });
    // The unique index counts national rows too (null key) — direct insert is refused as well.
    await expect(db.orm.app.Holiday.create({ level: 'NATIONAL', scopeKey: null, date: Temporal.PlainDate.from(d('01-26')), year: Y, name: 'again', paid: true, optional: false, half: false } as never)).rejects.toThrow();
  });

  test('M14-HOL-01 edge: a removed holiday frees its date (re-add works); the old row is kept, marked removed', async () => {
    const first = await add(holiday({ date: d('04-02'), scopeKey: 'MH' }));
    expect((await request('DELETE', `/holidays/${first.body.id}`, { cookie: hr })).status).toBe(200);
    const again = await add(holiday({ date: d('04-02'), scopeKey: 'MH' }));
    expect(again.status).toBe(201);
    expect(again.body.id).not.toBe(first.body.id);
    expect((await db.orm.app.Holiday.first({ id: first.body.id }))!.removedAt).not.toBeNull();
  });

  test('M14-HOL-01 AC1 edge: validation → 422 VALIDATION_FAILED with the field path', async () => {
    const bad = async (over: Record<string, unknown>, path: string) => {
      const res = await add(holiday({ date: d('05-05'), ...over }));
      expect(res.status, JSON.stringify(over)).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(JSON.stringify(res.body.error.details)).toContain(path);
    };
    await bad({ name: '' }, 'name');
    await bad({ name: '   ' }, 'name');
    await bad({ name: 'x'.repeat(121) }, 'name');
    await bad({ date: 'not-a-date' }, 'date');
    await bad({ date: `${Y}-02-30` }, 'date');
    await bad({ level: 'REGION' }, 'level');
    await bad({ scopeKey: 'mh' }, 'scopeKey'); // wrong case
    await bad({ scopeKey: null }, 'scopeKey'); // key required below national
    await bad({ level: 'CLIENT', scopeKey: 'not-a-uuid' }, 'scopeKey');
    await bad({ year: Y + 1 }, 'date'); // wrong year: the date must fall in the chosen year
    await bad({ year: 1999 }, 'year');
    expect((await add(holiday({ date: d('05-05'), year: Y }))).status).toBe(201);
  });

  test('M14-HOL-01 edge: unknown client/site → 409 REFERENCE_MISSING; inactive client and closed site → 422 with a specific code', async () => {
    expect(await add(holiday({ level: 'CLIENT', scopeKey: NIL, date: d('05-06') }))).toMatchObject({ status: 409, body: { error: { code: 'REFERENCE_MISSING' } } });
    expect(await add(holiday({ level: 'SITE', scopeKey: NIL, date: d('05-06') }))).toMatchObject({ status: 409, body: { error: { code: 'REFERENCE_MISSING' } } });
    const c = await newClient();
    const s = await newSite(c.id);
    expect((await request('POST', `/sites/${s.id}/close`, { cookie: admin })).status).toBe(200);
    expect(await add(holiday({ level: 'SITE', scopeKey: s.id, date: d('05-06') }))).toMatchObject({ status: 422, body: { error: { code: 'SITE_CLOSED' } } });
    expect((await request('POST', `/clients/${c.id}/deactivate`, { cookie: admin })).status).toBe(200);
    expect(await add(holiday({ level: 'CLIENT', scopeKey: c.id, date: d('05-06') }))).toMatchObject({ status: 422, body: { error: { code: 'CLIENT_INACTIVE' } } });
  });

  test('M14-HOL-01 edge: list filters combine, order is stable, cursor paging walks every row once, bounds and empty results behave', async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const res: { status: number; body: { items: { id: string }[]; nextCursor: string | null } } = await request('GET', `/holidays?year=${Y}&level=STATE&key=MH&limit=2${cursor ? `&cursor=${cursor}` : ''}`, { cookie: auditor });
      expect(res.status).toBe(200);
      expect(res.body.items.length).toBeLessThanOrEqual(2);
      seen.push(...res.body.items.map((h) => h.id));
      cursor = res.body.nextCursor;
    } while (cursor);
    const all = (await request('GET', `/holidays?year=${Y}&level=STATE&key=MH&limit=100`, { cookie: auditor })).body.items.map((h: { id: string }) => h.id);
    expect(seen).toEqual(all);
    expect(new Set(seen).size).toBe(seen.length);
    expect((await request('GET', `/holidays?year=${Y}&level=SITE&key=${NIL}`, { cookie: hr })).body).toEqual({ items: [], nextCursor: null });
    expect((await request('GET', '/holidays?limit=0', { cookie: hr })).status).toBe(422);
    expect((await request('GET', '/holidays?limit=101', { cookie: hr })).status).toBe(422);
    expect((await request('GET', '/holidays?level=CITY', { cookie: hr })).status).toBe(422);
  });
});

describe('update and remove', () => {
  test('M14-HOL-01 edge: PATCH changes name/paid/type/half and audits before/after; empty or unknown → 422/404; the date never changes', async () => {
    const h = (await add(holiday({ date: d('06-01'), scopeKey: 'MH' }))).body;
    const res = await request('PATCH', `/holidays/${h.id}`, { cookie: payroll, body: { name: 'Renamed', half: true, type: 'OPTIONAL', date: d('06-09') } });
    expect(res).toMatchObject({ status: 200, body: { id: h.id, name: 'Renamed', half: true, type: 'OPTIONAL', date: d('06-01') } });
    const [row] = await auditRows('holiday.update', h.id);
    expect(row!.before).toMatchObject({ name: 'Test holiday', half: false });
    expect(row!.after).toMatchObject({ name: 'Renamed', half: true });
    expect((await request('PATCH', `/holidays/${h.id}`, { cookie: hr, body: {} })).status).toBe(422);
    expect((await request('PATCH', `/holidays/${h.id}`, { cookie: hr, body: { name: '' } })).status).toBe(422);
    expect((await request('PATCH', `/holidays/${NIL}`, { cookie: hr, body: { name: 'X' } })).status).toBe(404);
    expect((await request('PATCH', '/holidays/not-a-uuid', { cookie: hr, body: { name: 'X' } })).status).toBe(422);
  });

  test('M14-HOL-01 edge: DELETE marks the row removed (never a hard delete), audits it, and a second delete or a patch is 404', async () => {
    const h = (await add(holiday({ date: d('06-02'), scopeKey: 'MH' }))).body;
    expect((await request('DELETE', `/holidays/${h.id}`, { cookie: hr })).status).toBe(200);
    const row = await db.orm.app.Holiday.first({ id: h.id });
    expect(row).toMatchObject({ id: h.id });
    expect(row!.removedAt).not.toBeNull();
    expect(row!.removedBy).not.toBeNull();
    const [a] = await auditRows('holiday.remove', h.id);
    expect(a!.after).toMatchObject({ removed: true });
    expect((await request('DELETE', `/holidays/${h.id}`, { cookie: hr })).status).toBe(404);
    expect((await request('PATCH', `/holidays/${h.id}`, { cookie: hr, body: { name: 'X' } })).status).toBe(404);
    const listed = (await request('GET', `/holidays?year=${Y}&level=STATE&key=MH&limit=100`, { cookie: hr })).body.items.map((x: { id: string }) => x.id);
    expect(listed).not.toContain(h.id);
    // The database refuses a half-set removal.
    await expect(db.orm.app.Holiday.where({ id: h.id }).update({ removedBy: null } as never)).rejects.toThrow();
  });
});

describe('M14-HOL-02 client overrides', () => {
  test('M14-HOL-02 AC1: a client adds a day (CLIENT level) and swaps a state holiday for another day (REPLACED); only that client’s sites change', async () => {
    const mayDay = (await add(holiday({ date: d('05-01'), name: 'Maharashtra Day', scopeKey: 'MH' }))).body;
    const res = await request('POST', '/holidays/replacements', { cookie: hr, body: { clientId: ids.clientA, holidayId: mayDay.id, replacementDate: d('05-04') } });
    expect(res).toMatchObject({ status: 201, body: { clientId: ids.clientA, holidayId: mayDay.id, replacementDate: d('05-04'), status: 'REPLACED' } });
    const [row] = await auditRows('holiday_replacement.create', res.body.id);
    expect(row!.after).toMatchObject({ replacementDate: d('05-04') });
    expect(await calendar(ids.siteMH1!)).not.toContain(d('05-01'));
    expect(await calendar(ids.siteMH1!)).toContain(d('05-04'));
    expect(await calendar(ids.siteMH2!)).toContain(d('05-04'));
    expect(await calendar(ids.siteB!)).toContain(d('05-01')); // the other client keeps the state day…
    expect(await calendar(ids.siteB!)).not.toContain(d('05-04')); // …and gets no replacement
    expect((await request('GET', `/holidays/replacements?clientId=${ids.clientA}`, { cookie: auditor })).body.items.map((r: { id: string }) => r.id)).toContain(res.body.id);

    // Undo: the row is kept but marked removed, and the calendar goes back.
    expect((await request('DELETE', `/holidays/replacements/${res.body.id}`, { cookie: hr })).status).toBe(200);
    expect((await db.orm.app.HolidayReplacement.first({ id: res.body.id }))!.removedAt).not.toBeNull();
    expect(await calendar(ids.siteMH1!)).toContain(d('05-01'));
    expect(await calendar(ids.siteMH1!)).not.toContain(d('05-04'));
    expect((await request('DELETE', `/holidays/replacements/${res.body.id}`, { cookie: hr })).status).toBe(404);
  });

  test('M14-HOL-02 AC2: national holidays can’t be removed or replaced by a client; only state days can be swapped', async () => {
    const [nat] = (await request('GET', `/holidays?year=${Y}&level=NATIONAL`, { cookie: hr })).body.items;
    const swap = (holidayId: string, replacementDate = d('08-17'), clientId = ids.clientA) => request('POST', '/holidays/replacements', { cookie: hr, body: { clientId, holidayId, replacementDate } });
    expect(await swap(nat.id)).toMatchObject({ status: 422, body: { error: { code: 'NATIONAL_NOT_REPLACEABLE' } } });
    const clientDay = (await add(holiday({ date: d('07-07'), level: 'CLIENT', scopeKey: ids.clientA }))).body;
    expect(await swap(clientDay.id)).toMatchObject({ status: 422, body: { error: { code: 'NOT_STATE_HOLIDAY' } } });
    // Even around the service, the database refuses a replacement of a non-state holiday.
    await expect(db.orm.app.HolidayReplacement.create({ clientId: ids.clientA, holidayId: nat.id, replacementDate: Temporal.PlainDate.from(d('08-17')) } as never)).rejects.toThrow();
    await expect(db.orm.app.HolidayReplacement.create({ clientId: ids.clientA, holidayId: clientDay.id, replacementDate: Temporal.PlainDate.from(d('07-08')) } as never)).rejects.toThrow();
    expect(await calendar(ids.siteMH1!)).toContain(d('08-15'));
  });

  test('M14-HOL-02 edge: replacement validation — same day, other year, duplicate, unknown holiday/client, inactive client', async () => {
    const h = (await add(holiday({ date: d('09-01'), scopeKey: 'MH' }))).body;
    const swap = (over: Record<string, unknown>) => request('POST', '/holidays/replacements', { cookie: hr, body: { clientId: ids.clientA, holidayId: h.id, replacementDate: d('09-05'), ...over } });
    expect(await swap({ replacementDate: d('09-01') })).toMatchObject({ status: 422, body: { error: { code: 'REPLACEMENT_SAME_DAY' } } });
    expect(await swap({ replacementDate: `${Y + 1}-09-05` })).toMatchObject({ status: 422, body: { error: { code: 'DATE_OUTSIDE_YEAR' } } });
    expect(await swap({ replacementDate: 'soon' })).toMatchObject({ status: 422, body: { error: { code: 'VALIDATION_FAILED' } } });
    expect(await swap({ holidayId: NIL })).toMatchObject({ status: 404 });
    expect(await swap({ clientId: NIL })).toMatchObject({ status: 409, body: { error: { code: 'REFERENCE_MISSING' } } });
    const c = await newClient();
    expect((await request('POST', `/clients/${c.id}/deactivate`, { cookie: admin })).status).toBe(200);
    expect(await swap({ clientId: c.id })).toMatchObject({ status: 422, body: { error: { code: 'CLIENT_INACTIVE' } } });
    const ok = await swap({});
    expect(ok.status).toBe(201);
    expect(await swap({ replacementDate: d('09-06') })).toMatchObject({ status: 409, body: { error: { code: 'DUPLICATE' } } });

    // Removing the state holiday takes its replacements with it (audited).
    expect((await request('DELETE', `/holidays/${h.id}`, { cookie: hr })).status).toBe(200);
    expect((await db.orm.app.HolidayReplacement.first({ id: ok.body.id }))!.removedAt).not.toBeNull();
    expect((await auditRows('holiday_replacement.remove', ok.body.id)).length).toBe(1);
    expect(await calendar(ids.siteMH1!)).not.toContain(d('09-05'));
  });
});

describe('M14-HOL-03 holidays for a site', () => {
  test('M14-HOL-03 AC1: the merged list is national ∪ state ∪ client ∪ site; other states, clients and sites add nothing (H1 shape)', async () => {
    const c = await newClient();
    const pune = await newSite(c.id, 'MH');
    const jaipur = await newSite(c.id, 'RJ');
    const Z = 2092;
    const put = async (body: Record<string, unknown>) => expect((await add(body)).status).toBe(201);
    const stateMay = (await add(holiday({ date: `${Z}-05-01`, name: 'Maharashtra Day', scopeKey: 'MH' }))).body;
    await put(holiday({ date: `${Z}-06-06`, level: 'CLIENT', scopeKey: c.id, name: 'Client day' }));
    await put(holiday({ date: `${Z}-09-19`, level: 'SITE', scopeKey: pune.id, name: 'Site day' }));
    await put(holiday({ date: `${Z}-09-20`, level: 'SITE', scopeKey: jaipur.id, name: 'Jaipur site day' }));
    await put(holiday({ date: `${Z}-10-02`, level: 'STATE', scopeKey: 'MH', name: 'State Gandhi' }));
    expect((await request('POST', '/holidays/replacements', { cookie: hr, body: { clientId: c.id, holidayId: stateMay.id, replacementDate: `${Z}-05-04` } })).status).toBe(201);
    const res = await request('GET', `/sites/${pune.id}/holidays?year=${Z}`, { cookie: auditor });
    expect(res.status).toBe(200);
    expect(res.body.items.map((h: { date: string }) => h.date)).toEqual([`${Z}-01-26`, `${Z}-05-04`, `${Z}-06-06`, `${Z}-08-15`, `${Z}-09-19`, `${Z}-10-02`]);
    expect(res.body.items.find((h: { date: string }) => h.date === `${Z}-10-02`).levels).toEqual(['NATIONAL', 'STATE']); // counted once
    expect(res.body.items.find((h: { date: string }) => h.date === `${Z}-05-04`)).toMatchObject({ replacesDate: `${Z}-05-01` });
    expect(await calendar(jaipur.id, Z)).toEqual([`${Z}-01-26`, `${Z}-06-06`, `${Z}-08-15`, `${Z}-09-20`, `${Z}-10-02`]);
    // cleanup so the file reruns
    for (const h of (await db.orm.app.Holiday.where((x) => x.year.eq(Z as never)).all()).filter((x) => x.level !== 'NATIONAL' && !x.removedAt)) {
      await request('DELETE', `/holidays/${h.id}`, { cookie: admin });
    }
  });

  test('M14-HOL-03 AC1: a site list is HQ and the supervisor’s own sites only (404 outside, like a missing site); year is required; unknown site 404', async () => {
    const bpl = (await db.orm.app.Site.where({ code: 'NTX-BPL' as never }).first())!.id;
    const own = await request('GET', `/sites/${bpl}/holidays?year=2026`, { cookie: supA });
    expect(own.status).toBe(200);
    expect(own.body.items.map((h: { date: string }) => h.date)).toEqual(expect.arrayContaining(['2026-01-26', '2026-08-15', '2026-09-17', '2026-10-02']));
    expect((await request('GET', `/sites/${ids.siteMH1}/holidays?year=2026`, { cookie: supA })).status).toBe(404);
    expect((await request('GET', `/sites/${NIL}/holidays?year=2026`, { cookie: hr })).status).toBe(404);
    expect((await request('GET', `/sites/${bpl}/holidays`, { cookie: supA })).status).toBe(422);
    expect((await request('GET', `/sites/${bpl}/holidays?year=1800`, { cookie: supA })).status).toBe(422);
  });

  test('M14-HOL-03 AC3: a holiday change is visible on the very next read of every affected site (cache cleared after the commit); a refused change leaves the cache and the event alone', async () => {
    const events: string[] = [];
    container.cradle.bus.on('holiday.changed', (e) => void events.push(String(e.payload['action'])));
    const before = await calendar(ids.siteMH1!); // primes the cache
    expect(await calendar(ids.siteMH1!)).toEqual(before);
    const h = (await add(holiday({ date: d('12-12'), level: 'SITE', scopeKey: ids.siteMH1 }))).body;
    expect(await calendar(ids.siteMH1!)).toContain(d('12-12'));
    expect(await calendar(ids.siteMH2!)).not.toContain(d('12-12'));
    const st = (await add(holiday({ date: d('12-13'), scopeKey: 'MH' }))).body;
    expect(await calendar(ids.siteMH2!)).toContain(d('12-13')); // a state change reaches every site of the state
    expect(await calendar(ids.siteRJ!)).not.toContain(d('12-13'));
    await request('PATCH', `/holidays/${st.id}`, { cookie: hr, body: { paid: false } });
    expect(await calendar(ids.siteMH2!)).not.toContain(d('12-13')); // unpaid days are not holidays
    await request('DELETE', `/holidays/${h.id}`, { cookie: hr });
    expect(await calendar(ids.siteMH1!)).not.toContain(d('12-12'));
    expect(events).toEqual(['ADD', 'ADD', 'UPDATE', 'REMOVE']);
    expect((await add(holiday({ date: d('12-13'), scopeKey: 'MH', level: 'STATE', name: 'x', paid: true }))).status).toBe(409); // duplicate (unpaid row still live)
    expect(events).toHaveLength(4);
  });
  // M14-HOL-03 AC1 optional days, AC2 isWorkingDay / addWorkingDays (H2) and the cache hit counts: test/services/holidays.service.test.ts
  // M14-HOL-03 AC1 "optional holidays only for employees who chose them": the choosing is M14-OPT-01 (P1, not built); holidaysFor takes the chosen ids and is tested there and in test/engine/calendar.test.ts.
});

describe('M14-HOL-04 import holidays', () => {
  const row = (over: Record<string, unknown> = {}) => ({ date: d('08-08'), name: 'Imported', level: 'STATE', stateCode: 'MH', paid: true, type: 'FIXED', ...over });
  const imp = (rows: unknown[], preview = false, year = Y, cookie = hr) => request('POST', '/holidays/import', { cookie, body: { year, preview, rows } });

  test('M14-HOL-04 AC1: rows carry date, name, level, state code / client code / site code, paid, type; valid rows are saved, bad rows reported with the row number and field', async () => {
    const c = await db.orm.app.Client.first({ id: ids.clientA as never });
    const s = await db.orm.app.Site.first({ id: ids.siteMH1 as never });
    const res = await imp([
      row({ date: d('08-08') }),
      row({ date: d('08-09'), level: 'CLIENT', stateCode: null, clientCode: c!.code, name: 'Client imp', type: 'OPTIONAL' }),
      row({ date: d('08-10'), level: 'SITE', stateCode: null, siteCode: s!.code, paid: false }),
      row({ date: d('08-11'), stateCode: 'ZZ' }),
      row({ date: d('08-12'), level: 'CLIENT', stateCode: null, clientCode: 'NOPE' }),
      row({ date: d('08-13'), level: 'SITE', stateCode: null, siteCode: 'NOPE' }),
      row({ date: d('08-14'), level: 'SITE', stateCode: null }),
      row({ date: d('08-15'), name: '' }),
      row({ date: d('08-16'), stateCode: 'mh' }),
      row({ date: d('08-17'), level: 'NATIONAL', stateCode: 'MH' }),
    ]);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ preview: false, year: Y, created: 4, rejected: 6 });
    // A state code typed in lower case is normalised (spreadsheets), so row 9 is saved as MH.
    expect(res.body.results.map((r: { status: string }) => r.status)).toEqual(['CREATED', 'CREATED', 'CREATED', 'REJECTED', 'REJECTED', 'REJECTED', 'REJECTED', 'REJECTED', 'CREATED', 'REJECTED']);
    const paths = (i: number) => res.body.results[i].errors.map((e: { path: string }) => e.path);
    expect(paths(3)).toEqual(['stateCode']);
    expect(paths(4)).toEqual(['clientCode']);
    expect(paths(5)).toEqual(['siteCode']);
    expect(paths(6)).toEqual(['siteCode']);
    expect(paths(7)).toEqual(['name']);
    expect(paths(9)).toEqual(['level']);
    expect(res.body.results[0].id).toEqual(expect.any(String));
    expect((await auditRows('holiday.create', res.body.results[1].id)).length).toBe(1);
    const saved = (await request('GET', `/holidays?year=${Y}&level=CLIENT&key=${ids.clientA}&limit=100`, { cookie: hr })).body.items;
    expect(saved.find((h: { date: string }) => h.date === d('08-09'))).toMatchObject({ type: 'OPTIONAL', name: 'Client imp' });
  });

  test('M14-HOL-04 AC2: the preview flags dates outside the chosen year and duplicates (in the file and against saved holidays) and saves nothing', async () => {
    const rows = [
      row({ date: d('09-21') }), // fine
      row({ date: `${Y + 1}-09-22` }), // outside the year
      row({ date: d('08-08') }), // already saved by the test above
      row({ date: d('09-23') }),
      row({ date: d('09-23'), name: 'Same day again' }), // duplicate inside the file
      row({ date: d('09-24'), level: 'NATIONAL', stateCode: null }),
      row({ date: d('10-02'), level: 'NATIONAL', stateCode: null }), // national already seeded
    ];
    const res = await imp(rows, true);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ preview: true, created: 0, rejected: 4 });
    expect(res.body.results.map((r: { status: string }) => r.status)).toEqual(['OK', 'REJECTED', 'REJECTED', 'OK', 'REJECTED', 'OK', 'REJECTED']);
    expect(res.body.results[1].errors[0].message).toMatch(/outside/i);
    expect(res.body.results[2].errors[0].message).toMatch(/duplicate/i);
    expect(res.body.results[4].errors[0].message).toMatch(/duplicate/i);
    expect(res.body.results.every((r: { id: unknown }) => r.id === null)).toBe(true);
    const listed = (await request('GET', `/holidays?year=${Y}&level=STATE&key=MH&limit=100`, { cookie: hr })).body.items.map((h: { date: string }) => h.date);
    expect(listed).not.toContain(d('09-21'));
    expect((await auditRows('holiday.import', NIL)).length).toBe(0);
    // Importing the same file for real gives the same verdicts and saves only the good rows.
    const real = await imp(rows, false);
    expect(real.body).toMatchObject({ preview: false, created: 3, rejected: 4 });
    expect((await imp(rows, false)).body).toMatchObject({ created: 0, rejected: 7 });
  });

  test('M14-HOL-04 edge: an empty file, a non-array, a bad year and more than 2000 rows are 422; a row that is not an object is rejected, not a crash', async () => {
    expect((await imp([])).status).toBe(422);
    expect((await request('POST', '/holidays/import', { cookie: hr, body: { year: Y, rows: 'x' } })).status).toBe(422);
    expect((await imp([row()], false, 1999)).status).toBe(422);
    expect((await imp(Array(2001).fill(row()))).status).toBe(422);
    const res = await imp(['nonsense', null, 5], true);
    expect(res.status).toBe(422); // rows must be objects: the body schema refuses them
  });
});

describe('M14-HOL-05 changes after use', () => {
  test('M14-HOL-05 AC3: the preview counts the sites, employees and approved leave requests a change affects, and computed runs to flag', async () => {
    const c = await newClient();
    const site = await newSite(c.id);
    const other = await newSite(c.id);
    const e1 = await newEmployee(site.id);
    const e2 = await newEmployee(site.id);
    await newEmployee(other.id, `${Y}-12-01`); // starts after the holiday: not affected by a day in October
    const lt = (await db.orm.app.LeaveType.all())[0]!;
    const approver = (await db.orm.app.User.where({ mobile: mobileOf('hr') as never }).first())!.id;
    const applier = (await db.orm.app.User.where({ mobile: mobileOf('admin') as never }).first())!.id;
    const leave = (status: string, from: string, to: string, employeeId = e1) =>
      db.orm.app.LeaveApplication.create({ employeeId, leaveTypeId: lt.id, fromDate: Temporal.PlainDate.from(from), toDate: Temporal.PlainDate.from(to), days: '1.0', status, appliedBy: applier, ...(status === 'APPROVED' ? { approvedBy: approver } : {}) } as never);
    await leave('APPROVED', d('10-18'), d('10-20'));
    await leave('PENDING', d('10-19'), d('10-19'), e2);
    await leave('APPROVED', d('10-25'), d('10-26'), e2);
    await newRun(c.id, site.id, e1, 'COMPUTED');

    const impact = (body: unknown, cookie = hr) => request('POST', '/holidays/impact', { cookie, body });
    const site19 = { action: 'ADD', holiday: holiday({ date: d('10-19'), level: 'SITE', scopeKey: site.id }) };
    expect(await impact(site19)).toMatchObject({ status: 200, body: { dates: [d('10-19')], sites: 1, employees: 2, leaveRequests: 1, computedRuns: 1, lockedRuns: [], blocked: false } });
    expect((await impact({ action: 'ADD', holiday: holiday({ date: d('10-19'), level: 'CLIENT', scopeKey: c.id }) })).body).toMatchObject({ sites: 2, employees: 2, leaveRequests: 1 });
    expect((await impact({ action: 'ADD', holiday: holiday({ date: d('10-27'), level: 'SITE', scopeKey: site.id }) })).body).toMatchObject({ sites: 1, employees: 2, leaveRequests: 0, computedRuns: 1 });
    expect((await impact({ action: 'ADD', holiday: holiday({ date: d('11-27'), level: 'SITE', scopeKey: site.id }) })).body).toMatchObject({ employees: 2, leaveRequests: 0, computedRuns: 0 });
    // The preview saves nothing and needs no audit row.
    expect((await request('GET', `/holidays?year=${Y}&level=SITE&key=${site.id}`, { cookie: hr })).body.items).toEqual([]);
    // Removing counts the same way; a swap counts both days for the client’s sites in the state.
    const real = (await add(holiday({ date: d('10-19'), level: 'SITE', scopeKey: site.id }))).body;
    expect((await impact({ action: 'REMOVE', holidayId: real.id })).body).toMatchObject({ sites: 1, employees: 2, leaveRequests: 1 });
    expect((await impact({ action: 'REMOVE', holidayId: NIL })).status).toBe(404);
    expect((await impact({ action: 'ADD', holiday: holiday({ level: 'CLIENT', scopeKey: NIL }) })).status).toBe(409);
    expect((await impact({ action: 'ADD' })).status).toBe(422);
    expect((await impact({ action: 'WIPE' })).status).toBe(422);
    for (const cookie of [auditor, supA, employee]) expect((await impact(site19, cookie)).status).toBe(403);
  });

  test('M14-HOL-05 AC1: adding, changing or removing a holiday in a month whose payroll is locked is blocked (422 MONTH_LOCKED, “use an adjustment run”); nothing is saved or announced', async () => {
    const c = await newClient();
    const lockedSite = await newSite(c.id);
    const freeSite = await newSite(c.id);
    const e = await newEmployee(lockedSite.id);
    const free = (await add(holiday({ date: d('10-10'), level: 'SITE', scopeKey: lockedSite.id }))).body; // added while the month was still open
    const events: string[] = [];
    container.cradle.bus.on('holiday.changed', (ev) => void events.push(String(ev.payload['holidayId'])));
    const runId = await newRun(c.id, lockedSite.id, e, 'LOCKED');

    const blocked = await add(holiday({ date: d('10-19'), level: 'SITE', scopeKey: lockedSite.id }));
    expect(blocked).toMatchObject({ status: 422, body: { error: { code: 'MONTH_LOCKED', message: expect.stringMatching(/adjustment run/i) } } });
    expect(blocked.body.error.details.lockedRuns[0]).toMatchObject({ id: runId, status: 'LOCKED' });
    expect((await request('GET', `/holidays?year=${Y}&level=SITE&key=${lockedSite.id}&limit=100`, { cookie: hr })).body.items.map((h: { date: string }) => h.date)).toEqual([d('10-10')]);
    expect(await request('DELETE', `/holidays/${free.id}`, { cookie: hr })).toMatchObject({ status: 422, body: { error: { code: 'MONTH_LOCKED' } } });
    expect(await request('PATCH', `/holidays/${free.id}`, { cookie: hr, body: { paid: false } })).toMatchObject({ status: 422, body: { error: { code: 'MONTH_LOCKED' } } });
    expect((await request('PATCH', `/holidays/${free.id}`, { cookie: hr, body: { name: 'Only a new name' } })).status).toBe(200); // pay isn’t touched
    // A client-wide day reaches the locked site too.
    expect(await add(holiday({ date: d('10-20'), level: 'CLIENT', scopeKey: c.id }))).toMatchObject({ status: 422, body: { error: { code: 'MONTH_LOCKED' } } });
    // Other months and other sites are free.
    expect((await add(holiday({ date: d('11-20'), level: 'SITE', scopeKey: lockedSite.id }))).status).toBe(201);
    expect((await add(holiday({ date: d('10-19'), level: 'SITE', scopeKey: freeSite.id }))).status).toBe(201);
    expect((await request('POST', '/holidays/impact', { cookie: hr, body: { action: 'ADD', holiday: holiday({ date: d('10-19'), level: 'SITE', scopeKey: lockedSite.id }) } })).body).toMatchObject({ blocked: true, lockedRuns: [{ id: runId }] });
    // A client swap that touches the locked month is blocked as well.
    const st = (await add(holiday({ date: d('03-14'), scopeKey: 'MH' }))).body;
    expect(await request('POST', '/holidays/replacements', { cookie: hr, body: { clientId: c.id, holidayId: st.id, replacementDate: d('10-21') } })).toMatchObject({ status: 422, body: { error: { code: 'MONTH_LOCKED' } } });
    // A PUBLISHED run locks too; a REOPENED one does not.
    await db.orm.app.PayrollRun.where({ id: runId as never }).update({ status: 'PUBLISHED' } as never);
    expect((await add(holiday({ date: d('10-19'), level: 'SITE', scopeKey: lockedSite.id }))).status).toBe(422);
    await db.orm.app.PayrollRun.where({ id: runId as never }).update({ status: 'REOPENED' } as never);
    expect((await add(holiday({ date: d('10-19'), level: 'SITE', scopeKey: lockedSite.id }))).status).toBe(201);
    expect(events).not.toContain(free.id); // refused changes and a name-only patch announce nothing
  });

  test('M14-HOL-05 AC1: in an import, a row in a locked month is rejected with the lock message and the rest are saved', async () => {
    const c = await newClient();
    const s = await newSite(c.id);
    const e = await newEmployee(s.id);
    await newRun(c.id, s.id, e, 'LOCKED');
    const res = await request('POST', '/holidays/import', { cookie: hr, body: { year: Y, rows: [
      { date: d('10-22'), name: 'Locked month', level: 'SITE', siteCode: (await db.orm.app.Site.first({ id: s.id as never }))!.code },
      { date: d('11-22'), name: 'Open month', level: 'SITE', siteCode: (await db.orm.app.Site.first({ id: s.id as never }))!.code },
    ] } });
    expect(res.body.results.map((r: { status: string }) => r.status)).toEqual(['REJECTED', 'CREATED']);
    expect(res.body.results[0].errors[0].message).toMatch(/adjustment run/i);
  });

  // M14-HOL-05 AC2 n/a: attendance (M5), leave (M6) and payroll runs (M8) are not built. Re-applying H/PH codes to attendance days, rebuilding monthly summaries, flagging computed runs “inputs changed”
  // and restoring approved leave days belong to attendance (M5), leave (M6) and payroll (M8), none built. This module announces every change
  // as the `holiday.changed` event (action, dates, affected site ids) after commit — asserted above — and counts the same sites, employees,
  // leave requests and computed runs in the preview. Recorded in docs/GO-LIVE.md as a launch blocker.
});
