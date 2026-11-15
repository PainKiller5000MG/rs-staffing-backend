// Attendance layouts end to end against the seeded database (npm run seed:reset): M2-SET-05.
// Every client these tests use is created fresh, so reruns need no reset.
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { db } from '../../src/prisma/db.ts';
import { mobileOf, testApp } from '../helpers.ts';

const { request, login } = testApp();
let admin: string;
let hr: string;
let auditor: string;
let supA: string;
let employee: string;
let client: string;
let site: string;
let foreignSite: string;
let counter = Date.now() % 100_000_000;
const NIL = '00000000-0000-7000-8000-000000000000';

const definition = (over: Record<string, unknown> = {}) => ({
  sheet: 'Attendance',
  layoutType: 'DAY_COLUMNS',
  headerRow: 3,
  identityColumns: { employeeCode: 'B', name: 'C' },
  dayColumns: { from: 'E', to: 'AI' },
  statusMap: { p: 'P', A: 'A', H: 'HD', OFF: 'WO', PL: 'EL', CL: 'CL' },
  otColumns: ['AK'],
  ...over,
});
const body = (over: Record<string, unknown> = {}) => ({ name: 'Monthly sheet', definition: definition(), headerFingerprint: 'sha256:abc123', ...over });
const create = (cookie: string | undefined, over: Record<string, unknown> = {}, c = client) => request('POST', `/clients/${c}/attendance-layouts`, { cookie, body: body(over) });
const auditRows = (action: string, entityId: string) => db.orm.audit.AuditLog.where({ action: action as never, entityId: entityId as never }).all();
async function newClient() {
  const made = await request('POST', '/clients', { cookie: hr, body: { code: `ZL-${++counter}`, name: 'Layout Test Client', stateCode: 'MP' } });
  expect(made.status).toBe(201);
  return made.body.id as string;
}
async function newSite(clientId: string) {
  const made = await request('POST', '/sites', { cookie: hr, body: { clientId, code: `ZL-${++counter}`, name: 'Layout Site', stateCode: 'MP', district: 'Bhopal', pincode: '462001' } });
  expect(made.status).toBe(201);
  return made.body.id as string;
}

beforeAll(async () => {
  admin = await login(mobileOf('admin'));
  hr = await login(mobileOf('hr'));
  auditor = await login(mobileOf('auditor'));
  supA = await login(mobileOf('supA'));
  employee = await login(mobileOf('employee'));
  client = await newClient();
  site = await newSite(client);
  foreignSite = await newSite(await newClient());
});
afterAll(() => db.close());

describe('M2-SET-05 AC1 AC2: storing a confirmed layout', () => {
  test('M2-SET-05 AC1: a layout keeps sheet, type, header row, identity, day columns, status map, OT columns, fingerprint and who confirmed it', async () => {
    const res = await create(hr);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      version: 1,
      isLatest: true,
      clientId: client,
      siteId: null,
      name: 'Monthly sheet',
      headerFingerprint: 'sha256:abc123',
      definition: {
        sheet: 'Attendance',
        layoutType: 'DAY_COLUMNS',
        headerRow: 3,
        identityColumns: { employeeCode: 'B', name: 'C' },
        dayColumns: { from: 'E', to: 'AI' },
        otColumns: ['AK'],
      },
    });
    expect(res.body.definition.statusMap).toEqual({ P: 'P', A: 'A', H: 'HD', OFF: 'WO', PL: 'EL', CL: 'CL' }); // client codes upper-cased
    const hrUser = (await db.orm.app.User.all()).find((u) => u.mobile === mobileOf('hr'))!;
    expect(res.body.confirmedBy).toBe(hrUser.id);
    expect(res.body.confirmedAt).toEqual(expect.any(String));
    const rows = await auditRows('attendance_layout.create', res.body.id);
    expect(rows).toHaveLength(1);
  });

  test('M2-SET-05 AC1: a date-per-row sheet needs its date and status columns; day/date-column sheets need their range', async () => {
    const rows = await create(hr, { definition: definition({ layoutType: 'DATE_STATUS_ROWS', dayColumns: undefined, dateColumn: 'D', statusColumn: 'E' }) });
    expect(rows.status).toBe(201);
    const noStatus = await create(hr, { definition: definition({ layoutType: 'DATE_STATUS_ROWS', dayColumns: undefined, dateColumn: 'D' }) });
    expect(noStatus.status).toBe(422);
    expect(noStatus.body.error.details.map((d: { path: string }) => d.path)).toContain('definition.statusColumn');
    const noRange = await create(hr, { definition: definition({ dayColumns: undefined }) });
    expect(noRange.body.error.details.map((d: { path: string }) => d.path)).toContain('definition.dayColumns');
  });

  test('M2-SET-05 AC1: missing, blank, over-long or unknown values → 422 VALIDATION_FAILED with a field path', async () => {
    const bad: [Record<string, unknown>, string][] = [
      [{ name: '   ' }, 'name'],
      [{ name: 'x'.repeat(121) }, 'name'],
      [{ headerFingerprint: '' }, 'headerFingerprint'],
      [{ definition: definition({ sheet: '' }) }, 'definition.sheet'],
      [{ definition: definition({ headerRow: 0 }) }, 'definition.headerRow'],
      [{ definition: definition({ layoutType: 'PIVOT' }) }, 'definition.layoutType'],
      [{ definition: definition({ identityColumns: { mobile: 'B' } }) }, 'definition.identityColumns'],
      [{ definition: definition({ statusMap: {} }) }, 'definition.statusMap'],
      [{ definition: definition({ statusMap: { P: 'PRESENT' } }) }, 'definition.statusMap.P'],
      [{ definition: definition({ otColumns: ['A', 'B', 'C', 'D'] }) }, 'definition.otColumns'],
      [{ siteId: 'not-a-uuid' }, 'siteId'],
    ];
    for (const [over, path] of bad) {
      const res = await create(hr, over);
      expect(res.status, path).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain(path);
    }
    expect((await request('POST', `/clients/${client}/attendance-layouts`, { cookie: hr, body: {} })).status).toBe(422);
  });

  test('M2-SET-05 AC1: unknown client → 409 REFERENCE_MISSING; inactive client → 422; site of another client, unknown site → rejected', async () => {
    expect(await create(hr, {}, NIL)).toMatchObject({ status: 409, body: { error: { code: 'REFERENCE_MISSING' } } });
    const dead = await newClient();
    expect((await request('POST', `/clients/${dead}/deactivate`, { cookie: admin })).status).toBe(200);
    expect(await create(hr, {}, dead)).toMatchObject({ status: 422, body: { error: { code: 'CLIENT_INACTIVE' } } });
    expect(await create(hr, { siteId: foreignSite })).toMatchObject({ status: 422, body: { error: { code: 'SITE_NOT_OF_CLIENT' } } });
    expect(await create(hr, { siteId: NIL })).toMatchObject({ status: 409, body: { error: { code: 'REFERENCE_MISSING' } } });
    const closing = await newSite(client);
    expect((await request('POST', `/sites/${closing}/close`, { cookie: admin })).status).toBe(200);
    expect(await create(hr, { siteId: closing })).toMatchObject({ status: 422, body: { error: { code: 'SITE_CLOSED' } } });
  });

  test('M2-SET-05 AC2: access: no session 401; supervisor, employee and auditor cannot write; HQ reads, supervisor and employee cannot', async () => {
    expect((await create(undefined)).status).toBe(401);
    for (const cookie of [supA, employee, auditor]) expect((await create(cookie)).status).toBe(403);
    expect((await request('POST', `/attendance-layouts/${NIL}/versions`, { cookie: auditor, body: body() })).status).toBe(403);
    expect((await request('GET', `/clients/${client}/attendance-layouts`, { cookie: auditor })).status).toBe(200);
    expect((await request('GET', `/clients/${client}/attendance-layouts`, { cookie: employee })).status).toBe(403);
  });
  // M2-SET-05 AC2 n/a (proposal and confirmation screens): the AI standardiser proposes and HR confirms in Module 5 (M5-AI-01, 02, M5-TPL-01); this story only stores what is confirmed
});

describe('M2-SET-05 AC3 AC4: several layouts, versions', () => {
  test('M2-SET-05 AC3: more than one layout per client, including a site\'s own; the list shows the newest version of each and filters by site', async () => {
    const c = await newClient();
    const s = await newSite(c);
    const general = await create(hr, { name: 'General' }, c);
    const own = await create(hr, { name: 'Site sheet', siteId: s }, c);
    expect(own.body.siteId).toBe(s);
    expect(own.body.layoutKey).not.toBe(general.body.layoutKey);
    const list = await request('GET', `/clients/${c}/attendance-layouts`, { cookie: hr });
    expect(list.body.items.map((l: { name: string }) => l.name).sort()).toEqual(['General', 'Site sheet']);
    expect((await request('GET', `/clients/${c}/attendance-layouts?siteId=${s}`, { cookie: hr })).body.items.map((l: { name: string }) => l.name)).toEqual(['Site sheet']);
    const first = await request('GET', `/clients/${c}/attendance-layouts?limit=1`, { cookie: hr });
    expect(first.body.items).toHaveLength(1);
    const second = await request('GET', `/clients/${c}/attendance-layouts?limit=1&cursor=${first.body.nextCursor}`, { cookie: hr });
    expect(second.body).toMatchObject({ items: [{ name: 'Site sheet' }], nextCursor: null });
    expect((await request('GET', `/clients/${c}/attendance-layouts?limit=0`, { cookie: hr })).status).toBe(422);
    expect((await request('GET', `/clients/${NIL}/attendance-layouts`, { cookie: hr })).status).toBe(404);
    const empty = await newClient();
    expect((await request('GET', `/clients/${empty}/attendance-layouts`, { cookie: hr })).body).toEqual({ items: [], nextCursor: null });
  });

  test('M2-SET-05 AC4: editing saves a new version; version 1 stays exactly as it was; the audit row has before and after', async () => {
    const v1 = await create(hr, { name: 'Original' });
    const edit = await request('POST', `/attendance-layouts/${v1.body.layoutKey}/versions`, {
      cookie: hr,
      body: { definition: definition({ headerRow: 5, statusMap: { P: 'P', A: 'A' } }), headerFingerprint: 'sha256:def456' },
    });
    expect(edit.status).toBe(201);
    expect(edit.body).toMatchObject({ version: 2, layoutKey: v1.body.layoutKey, name: 'Original', isLatest: true, headerFingerprint: 'sha256:def456', definition: { headerRow: 5 } });
    expect(edit.body.id).not.toBe(v1.body.id);

    const old = await request('GET', `/attendance-layouts/${v1.body.layoutKey}/versions/1`, { cookie: hr });
    expect(old.body).toMatchObject({ id: v1.body.id, version: 1, isLatest: false, headerFingerprint: 'sha256:abc123', definition: { headerRow: 3 } });
    const all = await request('GET', `/attendance-layouts/${v1.body.layoutKey}/versions`, { cookie: auditor });
    expect(all.body.items.map((l: { version: number }) => l.version)).toEqual([2, 1]);
    expect((await request('GET', `/clients/${client}/attendance-layouts`, { cookie: hr })).body.items.find((l: { layoutKey: string }) => l.layoutKey === v1.body.layoutKey)).toMatchObject({ version: 2 });

    const rows = await auditRows('attendance_layout.version', edit.body.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.before).toMatchObject({ version: 1 });
    expect(rows[0]!.after).toMatchObject({ version: 2 });
    expect((await request('GET', `/attendance-layouts/${v1.body.layoutKey}/versions/3`, { cookie: hr })).status).toBe(404);
    expect((await request('GET', `/attendance-layouts/${NIL}/versions`, { cookie: hr })).status).toBe(404);
    expect((await request('POST', `/attendance-layouts/${NIL}/versions`, { cookie: hr, body: body() })).status).toBe(404);
    expect((await request('POST', `/attendance-layouts/${v1.body.layoutKey}/versions`, { cookie: hr, body: { definition: definition({ headerRow: 0 }), headerFingerprint: 'x' } })).status).toBe(422);
  });

  test('M2-SET-05 AC4: a past import keeps the version it used: the database refuses to change or delete a layout version', async () => {
    const v1 = await create(hr);
    await request('POST', `/attendance-layouts/${v1.body.layoutKey}/versions`, { cookie: hr, body: { definition: definition({ headerRow: 9 }), headerFingerprint: 'sha256:new' } });
    const row = (await db.orm.app.AttendanceLayout.all()).find((l) => l.id === v1.body.id)!;
    await expect(db.orm.app.AttendanceLayout.where({ id: row.id }).update({ name: 'Changed' } as never)).rejects.toThrow();
    await expect(db.orm.app.AttendanceLayout.where({ id: row.id }).delete()).rejects.toThrow();
    const same = await request('GET', `/attendance-layouts/${v1.body.layoutKey}/versions/1`, { cookie: hr });
    expect(same.body).toMatchObject({ name: 'Monthly sheet', definition: { headerRow: 3 } });
  });

  test('M2-SET-05 AC4: a new version can move a layout to a site, or back to the whole client; a site of another client is refused', async () => {
    const c = await newClient();
    const s = await newSite(c);
    const v1 = await create(hr, {}, c);
    const toSite = await request('POST', `/attendance-layouts/${v1.body.layoutKey}/versions`, { cookie: hr, body: { siteId: s, definition: definition(), headerFingerprint: 'sha256:s' } });
    expect(toSite.body.siteId).toBe(s);
    const keep = await request('POST', `/attendance-layouts/${v1.body.layoutKey}/versions`, { cookie: hr, body: { definition: definition(), headerFingerprint: 'sha256:t' } });
    expect(keep.body).toMatchObject({ version: 3, siteId: s });
    const back = await request('POST', `/attendance-layouts/${v1.body.layoutKey}/versions`, { cookie: hr, body: { siteId: null, definition: definition(), headerFingerprint: 'sha256:u' } });
    expect(back.body.siteId).toBeNull();
    expect(await request('POST', `/attendance-layouts/${v1.body.layoutKey}/versions`, { cookie: hr, body: { siteId: foreignSite, definition: definition(), headerFingerprint: 'sha256:v' } })).toMatchObject({
      status: 422,
      body: { error: { code: 'SITE_NOT_OF_CLIENT' } },
    });
  });
});
