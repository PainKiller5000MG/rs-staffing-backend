// Aadhaar store rules with a fake repository (no database).
import { describe, expect, test } from 'vitest';
import { decrypt, lookupHmac } from '../../src/lib/crypto.ts';
import { verhoeffDigit } from '../../src/lib/verhoeff.ts';
import { AadhaarService, REVEAL_ALERT_THRESHOLD } from '../../src/modules/aadhaar/aadhaar.service.ts';
import type { VaultRecord } from '../../src/modules/aadhaar/aadhaar.repository.ts';

const withCheck = (base: string) => base + verhoeffDigit(base);
const NUMBER = withCheck('23456789012');

function setup(revealCount = 1) {
  const rows: (VaultRecord & { hash: string })[] = [];
  const audits: any[] = [];
  const repo = {
    byHash: async (h: string) => rows.find((r) => r.hash === h) ?? null,
    byRef: async (ref: string) => rows.find((r) => r.ref === ref) ?? null,
    insert: async (d: any) => {
      const row = { ref: `ref-${rows.length + 1}`, aadhaarEnc: d.aadhaarEnc, keyVersion: d.keyVersion, last4: d.last4, employeeId: d.employeeId ?? null, dailyWorkerId: d.dailyWorkerId ?? null, createdAt: 'now', hash: d.lookupHmac };
      rows.push(row);
      return row;
    },
    revealsSince: async () => revealCount,
  };
  const ctx: any = { user: { id: 'u1', role: 'ADMIN' }, executor: { orm: { audit: { AuditLog: { create: async (r: any) => audits.push(r) } } } }, audited: false, requestId: 'r', ip: null };
  return { svc: new AadhaarService({ aadhaarRepository: repo as any, ctx }), rows, audits };
}

describe('store and look up without decrypting', () => {
  test('M12-AAD-02 AC1: a 12-digit number with a good checksum is stored encrypted; the same number again returns the same ref', async () => {
    const { svc, rows } = setup();
    const a = await svc.store(NUMBER, { employeeId: 'e1' });
    expect(a).toMatchObject({ created: true, last4: NUMBER.slice(-4) });
    const b = await svc.store(NUMBER, { employeeId: 'e2' });
    expect(b).toMatchObject({ ref: a.ref, created: false });
    expect(rows).toHaveLength(1);
    expect(Buffer.from(rows[0]!.aadhaarEnc).toString('utf8')).not.toContain(NUMBER);
    expect(decrypt(rows[0]!.aadhaarEnc)).toBe(NUMBER);
  });

  test('M12-AAD-02 AC1: a bad checksum, wrong length or leading 0/1 is refused (422) and nothing is stored', async () => {
    const { svc, rows } = setup();
    const bad = NUMBER.slice(0, 11) + ((Number(NUMBER[11]) + 1) % 10);
    for (const n of [bad, NUMBER.slice(0, 11), '0' + NUMBER.slice(1), '1' + NUMBER.slice(1), 'abcdefghijkl', '']) {
      await expect(svc.store(n, { employeeId: 'e1' })).rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
    }
    expect(rows).toHaveLength(0);
  });

  test('M12-AAD-02 AC2: findByNumber uses only the keyed hash; spaces and dashes are normalised; unknown or invalid → null', async () => {
    const { svc } = setup();
    const { ref } = await svc.store(NUMBER, { employeeId: 'e1' });
    expect(await svc.findByNumber(NUMBER)).toBe(ref);
    expect(await svc.findByNumber(`${NUMBER.slice(0, 4)} ${NUMBER.slice(4, 8)}-${NUMBER.slice(8)}`)).toBe(ref);
    expect(await svc.findByNumber(withCheck('34567890123'))).toBeNull();
    expect(await svc.findByNumber('123')).toBeNull();
  });

  test('M12-AAD-02 AC3: the lookup hash is an HMAC, not a plain SHA-256 of the number', async () => {
    const { createHash } = await import('node:crypto');
    expect(lookupHmac(NUMBER)).not.toBe(createHash('sha256').update(NUMBER).digest('hex'));
    expect(lookupHmac(NUMBER)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('reveal', () => {
  test('M12-AAD-03 AC2 AC3: returns the number once with a 60-second display time; the audit row holds the reason and last4, never the number', async () => {
    const { svc, audits } = setup();
    const { ref } = await svc.store(NUMBER, { employeeId: 'e1' });
    const out = await svc.reveal(ref, { reason: 'PF_KYC' });
    expect(out).toEqual({ number: NUMBER, last4: NUMBER.slice(-4), displaySeconds: 60 });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: 'aadhaar.reveal', reason: 'PF_KYC' });
    expect(JSON.stringify(audits)).not.toContain(NUMBER);
  });

  test('M12-AAD-03 AC1: reason OTHER needs text; an unknown ref is 404', async () => {
    const { svc } = setup();
    const { ref } = await svc.store(NUMBER, { employeeId: 'e1' });
    await expect(svc.reveal(ref, { reason: 'OTHER' })).rejects.toMatchObject({ status: 422 });
    await expect(svc.reveal('nope', { reason: 'VERIFICATION' })).rejects.toMatchObject({ status: 404 });
    const ok = await svc.reveal(ref, { reason: 'OTHER', reasonText: 'Court order' });
    expect(ok.number).toBe(NUMBER);
  });

  test('M12-AAD-03 AC3: the 21st reveal in a day raises an alert row; the 20th does not', async () => {
    const at20 = setup(REVEAL_ALERT_THRESHOLD);
    const a = await at20.svc.store(NUMBER, { employeeId: 'e1' });
    await at20.svc.reveal(a.ref, { reason: 'VERIFICATION' });
    expect(at20.audits.map((r) => r.action)).toEqual(['aadhaar.reveal']);

    const at21 = setup(REVEAL_ALERT_THRESHOLD + 1);
    const b = await at21.svc.store(NUMBER, { employeeId: 'e1' });
    await at21.svc.reveal(b.ref, { reason: 'VERIFICATION' });
    expect(at21.audits.map((r) => r.action)).toEqual(['aadhaar.reveal', 'aadhaar.reveal_alert']);
  });
});
