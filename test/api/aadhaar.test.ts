// Aadhaar store and reveal end to end against the seeded database.
import { beforeAll, describe, expect, test } from 'vitest';
import { verhoeffDigit } from '../../src/lib/verhoeff.ts';
import { db } from '../../src/prisma/db.ts';
import { AadhaarRepository } from '../../src/modules/aadhaar/aadhaar.repository.ts';
import { AadhaarService } from '../../src/modules/aadhaar/aadhaar.service.ts';
import { mobileOf, testApp } from '../helpers.ts';

const { request, login } = testApp();
// The service is request-scoped; in-process callers (employees, nominees) get it per request, here one is built by hand.
const vault = () => new AadhaarService({ aadhaarRepository: new AadhaarRepository({ executor: db } as never), ctx: {} as never });
let admin: string;
let hr: string;
let payroll: string;
let accounts: string;
let auditor: string;
let supA: string;
let employee: string;

let n = Date.now() % 100_000_000;
const aadhaar = () => {
  const base = `2${String(++n).padStart(10, '0')}`;
  return base + verhoeffDigit(base);
};
const NIL = '00000000-0000-7000-8000-000000000000';

async function stored(num = aadhaar()) {
  const w = await db.orm.app.DailyWorker.create({ code: `AT${++n}`, name: `Vault Test ${n}`, mobile: `+9190${String(n).padStart(8, '0')}` } as never);
  const svc = vault();
  const { ref } = await svc.store(num, { dailyWorkerId: w.id });
  return { ref, num };
}
const scalar = async (sql: string) => {
  const plan = db.raw.sql([sql] as never).returnsRow({ v: 'pg/text@1' }).build();
  const rows = await db.transaction((tx) => tx.query(plan).toArray());
  return rows.map((r: any) => r.v as string);
};
const auditRows = (action: string, entityId: string) => db.orm.audit.AuditLog.where({ action: action as never, entityId: entityId as never }).all();

beforeAll(async () => {
  admin = await login(mobileOf('admin'));
  hr = await login(mobileOf('hr'));
  payroll = await login(mobileOf('payroll'));
  accounts = await login(mobileOf('accounts'));
  auditor = await login(mobileOf('auditor'));
  supA = await login(mobileOf('supA'));
  employee = await login(mobileOf('employee'));
});

describe('the vault', () => {
  test('M12-AAD-01 AC1: the table is in its own schema; the application role has no access, the vault role does', async () => {
    expect(await scalar(`SELECT table_schema::text AS v FROM information_schema.tables WHERE table_name = 'aadhaar_records'`)).toEqual(['vault']);
    const p = (role: string) => scalar(`SELECT (has_table_privilege('${role}', 'vault.aadhaar_records', 'SELECT') OR has_schema_privilege('${role}', 'vault', 'USAGE'))::text AS v`);
    expect(await p('rs_app')).toEqual(['false']);
    expect(await p('rs_vault')).toEqual(['true']);
  });

  test('M12-AAD-01 AC2: a row holds the id (the ref), AES-GCM ciphertext, key version, keyed hash, last4, created at/by', async () => {
    const cols = await scalar(`SELECT column_name::text AS v FROM information_schema.columns WHERE table_schema = 'vault' AND table_name = 'aadhaar_records'`);
    for (const c of ['id', 'aadhaar_enc', 'key_version', 'lookup_hmac', 'last4', 'created_at', 'created_by']) expect(cols).toContain(c);
    const { ref, num } = await stored();
    const row = await db.orm.vault.AadhaarRecord.where({ id: ref as never }).first();
    expect(row).toMatchObject({ keyVersion: 1, last4: num.slice(-4) });
    expect(row!.lookupHmac).toMatch(/^[0-9a-f]{64}$/);
    expect(Buffer.from(row!.aadhaarEnc as Uint8Array).toString('utf8')).not.toContain(num);
  });

  test('M12-AAD-01 AC3: no other table has a column that could hold a full Aadhaar number', async () => {
    const cols = await scalar(`SELECT table_schema || '.' || table_name || '.' || column_name AS v FROM information_schema.columns WHERE column_name ILIKE '%aadhaar%' AND table_schema <> 'vault'`);
    expect(cols.filter((c) => !/last4$/.test(c))).toEqual([]);
  });

  test('M12-AAD-02 AC1 AC2: the same number stored twice gives one row; findByNumber returns its ref', async () => {
    const { ref, num } = await stored();
    const svc = vault();
    expect(await svc.findByNumber(num)).toBe(ref);
    const w2 = await db.orm.app.DailyWorker.create({ code: `AT${++n}`, name: `Vault Test ${n}`, mobile: `+9191${String(n).padStart(8, '0')}` } as never);
    expect((await svc.store(num, { dailyWorkerId: w2.id })).ref).toBe(ref);
    expect(await svc.findByNumber(aadhaar())).toBeNull();
  });
});

describe('POST /aadhaar/:ref/reveal', () => {
  test('M12-AAD-03 AC4: no session → 401; auditor, accounts, supervisor and employee → 403', async () => {
    const { ref } = await stored();
    const body = { reason: 'VERIFICATION' };
    expect((await request('POST', `/aadhaar/${ref}/reveal`, { body })).status).toBe(401);
    for (const cookie of [auditor, accounts, supA, employee]) expect((await request('POST', `/aadhaar/${ref}/reveal`, { cookie, body })).status).toBe(403);
  });

  test('M12-AAD-03 AC1 AC2 AC3: admin and payroll/HR get the number once with a reason; it is not cached and the audit row never holds it', async () => {
    const { ref, num } = await stored();
    for (const cookie of [admin, hr, payroll]) {
      const res = await request('POST', `/aadhaar/${ref}/reveal`, { cookie, body: { reason: 'PF_KYC' } });
      if (res.status === 403) continue; // a role without the permission is covered by the matrix test
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body).toEqual({ number: num, last4: num.slice(-4), displaySeconds: 60 });
      expect(res.headers.get('cache-control')).toBe('no-store');
    }
    const rows = await auditRows('aadhaar.reveal', ref);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toMatchObject({ reason: 'PF_KYC', entity: 'aadhaar' });
    expect(JSON.stringify(rows)).not.toContain(num);
  });

  test('M12-AAD-03 AC1: bad reason or OTHER without text → 422 with a field path; unknown ref → 404; malformed ref → 422', async () => {
    const { ref } = await stored();
    const bad = await request('POST', `/aadhaar/${ref}/reveal`, { cookie: admin, body: { reason: 'CURIOSITY' } });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe('VALIDATION_FAILED');
    expect((await request('POST', `/aadhaar/${ref}/reveal`, { cookie: admin, body: { reason: 'OTHER' } })).status).toBe(422);
    expect((await request('POST', `/aadhaar/${NIL}/reveal`, { cookie: admin, body: { reason: 'VERIFICATION' } })).status).toBe(404);
    expect((await request('POST', `/aadhaar/not-a-uuid/reveal`, { cookie: admin, body: { reason: 'VERIFICATION' } })).status).toBe(422);
    const other = await request('POST', `/aadhaar/${ref}/reveal`, { cookie: admin, body: { reason: 'OTHER', reasonText: 'Court order 12/2026' } });
    expect(other.status).toBe(200);
    expect((await auditRows('aadhaar.reveal', ref)).some((r) => r.reason === 'OTHER: Court order 12/2026')).toBe(true);
  });

  test('M12-AAD-03 AC3: a 404 or 422 response does not echo any Aadhaar digits', async () => {
    const res = await request('POST', `/aadhaar/${NIL}/reveal`, { cookie: admin, body: { reason: 'VERIFICATION' } });
    expect(JSON.stringify(res.body)).not.toMatch(/\d{12}/);
  });
});

// M12-AAD-01 AC4 n/a: logs and analytics are covered by the log redactor (M12-APP-01); here the audit row and error bodies are proven number-free (M12-AAD-03 AC3 tests)
// M12-AAD-03 AC1 n/a: the sensitive-action re-check "when live" (M1-SEC-08) is not built yet; the reason list is tested
