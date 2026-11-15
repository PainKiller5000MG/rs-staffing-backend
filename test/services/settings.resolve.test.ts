// The pure parts of settings: key validation and site → client → company resolution (M2-SET-02, 03, 06, 10).
import { describe, expect, test } from 'vitest';
import { KEYS } from '../../src/modules/settings/settings.keys.ts';
import { resolveSettings, type SettingRow } from '../../src/modules/settings/settings.resolve.ts';

const C = 'client-1';
const S = 'site-1';
const row = (over: Partial<SettingRow>): SettingRow => ({ scope: 'COMPANY', scopeId: null, key: 'PAID_DAYS_BASIS', value: 'ACTUAL', effectiveFrom: '2026-04-01', effectiveTo: null, approved: true, ...over });
const one = (rows: SettingRow[], asOf = '2026-11-16', reach: { clientId?: string; siteId?: string } = { clientId: C, siteId: S }) =>
  resolveSettings(rows, asOf, reach).find((r) => r.key === 'PAID_DAYS_BASIS')!;

describe('values', () => {
  test('M2-SET-02 AC1: paid-days basis takes ACTUAL, 30 or 26 only', () => {
    expect(['actual', ' 30 ', '26'].map(KEYS.PAID_DAYS_BASIS.parse)).toEqual(['ACTUAL', '30', '26']);
    expect(['27', 'fixed', '', '030'].map(KEYS.PAID_DAYS_BASIS.parse)).toEqual([null, null, null, null]);
  });

  test('M2-SET-03 AC1: weekly off is one or two distinct days in week order, or ROTATIONAL', () => {
    const p = KEYS.WEEKLY_OFF_DAYS.parse;
    expect([p('sun'), p('SUN,SAT'), p(' fri , mon '), p('rotational')]).toEqual(['SUN', 'SAT,SUN', 'MON,FRI', 'ROTATIONAL']);
    expect([p('MON,TUE,WED'), p('MON,MON'), p('SUNDAY'), p('')]).toEqual([null, null, null, null]);
  });

  test('M2-SET-06 AC1: scheme toggles are true/false only', () => {
    expect([KEYS.PF_APPLICABLE.parse('TRUE'), KEYS.PF_APPLICABLE.parse('false'), KEYS.PF_APPLICABLE.parse('1')]).toEqual(['true', 'false', null]);
  });

  test('M2-SET-01 AC1 M2-SET-10 AC1: day-of-month 1..28; OT hours 1..24; divisor 26 or 30', () => {
    const d = KEYS.PAY_PERIOD_START_DAY.parse;
    expect([d('1'), d('28'), d('0'), d('29'), d('1.5'), d('-3')]).toEqual(['1', '28', null, null, null, null]);
    expect([KEYS.OT_HOURS_PER_DAY.parse('8'), KEYS.OT_HOURS_PER_DAY.parse('24'), KEYS.OT_HOURS_PER_DAY.parse('25')]).toEqual(['8', '24', null]);
    expect([KEYS.OT_DIVISOR.parse('26'), KEYS.OT_DIVISOR.parse('30'), KEYS.OT_DIVISOR.parse('28')]).toEqual(['26', '30', null]);
  });
});

describe('resolution', () => {
  test('M2-SET-10 AC2: site beats client beats company beats the built-in default, and says where it came from', () => {
    expect(one([])).toMatchObject({ value: 'ACTUAL', source: 'DEFAULT' });
    const company = row({ value: '30' });
    const client = row({ scope: 'CLIENT', scopeId: C, value: '26' });
    const site = row({ scope: 'SITE', scopeId: S, value: 'ACTUAL' });
    expect(one([company])).toMatchObject({ value: '30', source: 'COMPANY' });
    expect(one([company, client])).toMatchObject({ value: '26', source: 'CLIENT' });
    expect(one([company, client, site])).toMatchObject({ value: 'ACTUAL', source: 'SITE' });
    expect(one([company, client, site], '2026-11-16', { clientId: C })).toMatchObject({ source: 'CLIENT' });
  });

  test('M2-SET-10 AC2: another client\'s or site\'s row never applies', () => {
    expect(one([row({ scope: 'CLIENT', scopeId: 'other', value: '26' }), row({ scope: 'SITE', scopeId: 'other', value: '30' })])).toMatchObject({ source: 'DEFAULT' });
  });

  test('M2-SET-10 AC4: a pending row grants nothing', () => {
    expect(one([row({ scope: 'CLIENT', scopeId: C, value: '26', approved: false })])).toMatchObject({ value: 'ACTUAL', source: 'DEFAULT' });
  });

  test('M2-SET-09 AC1: effective dates are inclusive at both ends', () => {
    const r = row({ scope: 'CLIENT', scopeId: C, value: '26', effectiveFrom: '2026-10-01', effectiveTo: '2026-10-31' });
    expect(one([r], '2026-09-30').source).toBe('DEFAULT');
    expect(one([r], '2026-10-01').value).toBe('26');
    expect(one([r], '2026-10-31').value).toBe('26');
    expect(one([r], '2026-11-01').source).toBe('DEFAULT');
  });

  test('M2-SET-10 AC3: pay-period keys ignore site and company rows (client level only)', () => {
    const rows = [row({ key: 'PAY_PERIOD_START_DAY', value: '26' }), row({ key: 'PAY_PERIOD_START_DAY', scope: 'SITE', scopeId: S, value: '21' })];
    expect(resolveSettings(rows, '2026-11-16', { clientId: C, siteId: S }).find((r) => r.key === 'PAY_PERIOD_START_DAY')).toMatchObject({ value: '1', source: 'DEFAULT' });
  });

  test('M2-SET-01 AC2: due day and pay day have no default', () => {
    expect(resolveSettings([], '2026-11-16', { clientId: C }).filter((r) => r.key === 'ATTENDANCE_DUE_DAY' || r.key === 'SALARY_PAY_DAY')).toEqual([
      { key: 'ATTENDANCE_DUE_DAY', value: null, source: 'NONE', effectiveFrom: null },
      { key: 'SALARY_PAY_DAY', value: null, source: 'NONE', effectiveFrom: null },
    ]);
  });
});
