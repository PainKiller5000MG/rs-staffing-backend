// Deployment rules with fakes (no database).
import { describe, expect, test } from 'vitest';
import { coveringOn, DeploymentsService, isInternal, monthlyMinimum, statusOf } from '../../src/modules/deployments/deployments.service.ts';
import type { Deployment } from '../../src/modules/deployments/deployments.repository.ts';

const dep = (over: Partial<Deployment> = {}): Deployment => ({
  id: 'd1',
  employeeId: 'e1',
  siteId: 's1',
  designation: 'Helper',
  skillLevel: 'UNSKILLED',
  templateId: null,
  monthlyCtcPaise: 1_300_000n,
  kind: 'DEPLOY',
  reason: null,
  effectiveFrom: '2026-11-02',
  effectiveTo: null,
  ...over,
});

const site = { id: 's1', code: 'S1', name: 'Site', stateCode: 'MP', zone: 'A', status: 'ACTIVE', clientId: 'c1', clientName: 'Client', clientStatus: 'ACTIVE' };
const site2 = { ...site, id: 's2', code: 'S2' };

function setup(rows: Deployment[], opts: { locked?: string | null; minWage?: { basicPaise: bigint; vdaPaise: bigint; per: 'DAY' | 'MONTH'; zone: string } | null; defaults?: unknown } = {}) {
  const store = [...rows];
  const audits: unknown[] = [];
  const repo = {
    employee: async () => ({ id: 'e1', code: 'RS000001', status: 'ACTIVE', staffType: 'DEPLOYED', joinDate: '2026-11-01' }),
    forEmployee: async () => [...store].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)),
    sites: async (ids: string[]) => new Map(ids.map((i) => [i, i === 's2' ? site2 : site])),
    site: async (id: string) => (id === 's2' ? site2 : site),
    template: async (id: string) => ({ id, status: 'ACTIVE', clientId: null }),
    lockedRunEnd: async () => opts.locked ?? null,
    minWage: async () => (opts.minWage === undefined ? { basicPaise: 1_215_000n, vdaPaise: 0n, per: 'MONTH' as const, zone: 'A' } : opts.minWage),
    create: async (d: Omit<Deployment, 'id'>) => {
      const row = { ...d, id: `n${store.length}` } as Deployment;
      store.push(row);
      return row;
    },
    end: async (id: string, to: string) => {
      const r = store.find((x) => x.id === id)!;
      r.effectiveTo = to;
      return r;
    },
    setEmployeePosition: async () => {},
  };
  const settings = { salaryDefaults: async () => opts.defaults ?? { designations: [], default: null } };
  const ctx = { user: { id: 'u1', role: 'HR' }, maybeUser: { id: 'u1' }, ip: null, audited: false, executor: { orm: { audit: { AuditLog: { create: async (r: unknown) => audits.push(r) } } } } };
  const svc = new DeploymentsService({ deploymentsRepository: repo as never, settingsService: settings as never, ctx: ctx as never });
  return { svc, store, audits };
}
const body = (over: Record<string, unknown> = {}) => ({
  siteId: 's2',
  designation: 'Helper',
  skillLevel: 'UNSKILLED' as const,
  monthlyCtcPaise: 1_300_000n,
  effectiveFrom: '2026-11-20',
  ...over,
});

describe('pure rules', () => {
  test('M3-DEP-01 AC4: a monthly minimum is basic + VDA; a daily one is read as 26 paid days', () => {
    expect(monthlyMinimum({ basicPaise: 1_215_000n, vdaPaise: 0n, per: 'MONTH' })).toBe(1_215_000n);
    expect(monthlyMinimum({ basicPaise: 40_000n, vdaPaise: 5_000n, per: 'DAY' })).toBe(45_000n * 26n);
    expect(monthlyMinimum({ basicPaise: 1_000_000n, vdaPaise: 215_000n, per: 'MONTH' })).toBe(1_215_000n);
  });

  test('M3-DEP-03 AC2: the row covering a date; the end date is inclusive; before the first start there is none', () => {
    const rows = [dep({ effectiveFrom: '2026-01-01', effectiveTo: '2026-03-31' }), dep({ id: 'd2', effectiveFrom: '2026-04-01' })];
    expect(coveringOn(rows, '2026-03-31')!.id).toBe('d1');
    expect(coveringOn(rows, '2026-04-01')!.id).toBe('d2');
    expect(coveringOn(rows, '2025-12-31')).toBeNull();
    expect(coveringOn(rows, '2099-01-01')!.id).toBe('d2');
  });

  test('M3-DEP-03 AC1: status is scheduled before the start, ended after the end', () => {
    const d = dep({ effectiveFrom: '2026-11-10', effectiveTo: '2026-11-20' });
    expect([statusOf(d, '2026-11-09'), statusOf(d, '2026-11-10'), statusOf(d, '2026-11-20'), statusOf(d, '2026-11-21')]).toEqual(['SCHEDULED', 'ACTIVE', 'ACTIVE', 'ENDED']);
  });

  test('M3-DEP-04 AC2: supervisors and HQ are internal; deployed and contract staff are not', () => {
    expect(['SUPERVISOR', 'HQ', 'DEPLOYED', 'CONTRACT'].map(isInternal)).toEqual([true, true, false, false]);
  });
});

describe('redeploy and revise', () => {
  test('M3-DEP-02 AC1: the old row ends the day before the new start (also across a month end)', async () => {
    const { svc, store } = setup([dep()]);
    const res = await svc.redeploy('e1', body({ effectiveFrom: '2026-12-01' }));
    expect(res.ended.effectiveTo).toBe('2026-11-30');
    expect(store.map((r) => [r.effectiveFrom, r.effectiveTo])).toEqual([['2026-11-02', '2026-11-30'], ['2026-12-01', null]]);
  });

  test('M3-DEP-02 AC1: a move starting on or before a locked payroll run is refused and nothing is written', async () => {
    const { svc, store } = setup([dep()], { locked: '2026-11-30' });
    await expect(svc.redeploy('e1', body({ effectiveFrom: '2026-11-20' }))).rejects.toMatchObject({ code: 'PAYROLL_LOCKED' });
    await expect(svc.deploy('e1', body({ effectiveFrom: '2026-11-20' }))).rejects.toMatchObject({ code: 'ALREADY_DEPLOYED' });
    expect(store).toHaveLength(1);
    expect(store[0]!.effectiveTo).toBeNull();
  });

  test('M3-DEP-01 AC4: a rule row for a daily wage gates the monthly pay at 26 days; ±1 paisa', async () => {
    const w = { basicPaise: 46_000n, vdaPaise: 0n, per: 'DAY' as const, zone: 'A' };
    const min = 46_000n * 26n;
    const { svc: low } = setup([dep()], { minWage: w });
    await expect(low.redeploy('e1', body({ monthlyCtcPaise: min - 1n }))).rejects.toMatchObject({ code: 'BELOW_MINIMUM_WAGE' });
    const { svc: ok } = setup([dep()], { minWage: w });
    await expect(ok.redeploy('e1', body({ monthlyCtcPaise: min }))).resolves.toBeDefined();
  });

  test('M3-DEP-05 AC1 AC2: a revision keeps site, designation and skill, carries the template when none is given, and may start in the past', async () => {
    const { svc, store } = setup([dep({ templateId: 't1' })]);
    const res = await svc.revise('e1', { effectiveFrom: '2026-11-05', monthlyCtcPaise: 1_500_000n, reason: 'increment' });
    expect(res).toMatchObject({ kind: 'REVISION', templateId: 't1', siteId: 's1', designation: 'Helper', effectiveFrom: '2026-11-05' });
    expect(store[0]!.effectiveTo).toBe('2026-11-04');
  });

  test('M3-DEP-01 AC1: the template default is the designation row, else the client default, else none', async () => {
    const defaults = { default: { templateId: 'tc' }, designations: [{ designation: 'Welder', templateId: 'tw' }] };
    const pick = async (designation: string) => {
      const { svc, store } = setup([], { defaults });
      await svc.deploy('e1', body({ designation, effectiveFrom: '2026-11-02' }));
      return store[0]!.templateId;
    };
    expect(await pick('Welder')).toBe('tw');
    expect(await pick('welder')).toBe('tw');
    expect(await pick('Helper')).toBe('tc');
    const { svc, store } = setup([]);
    await svc.deploy('e1', body({ effectiveFrom: '2026-11-02' }));
    expect(store[0]!.templateId).toBeNull();
  });
});
