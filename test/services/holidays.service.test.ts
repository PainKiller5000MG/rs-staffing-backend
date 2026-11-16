// Calendar functions of the holidays service against fake repositories (no database).
import { beforeEach, describe, expect, test } from 'vitest';
import type { HolidayRow } from '../../src/engine/calendar.ts';
import { EventBuffer } from '../../src/core/events.ts';
import { calendarCache } from '../../src/modules/holidays/calendar-cache.ts';
import { HolidaysService } from '../../src/modules/holidays/holidays.service.ts';

const SITE = { siteId: 'pune-1', clientId: 'tata', stateCode: 'MH', status: 'ACTIVE', code: 'PUNE-1' };
let n = 0;
const row = (level: HolidayRow['level'], scopeKey: string | null, date: string, name: string): HolidayRow & { year: number; createdBy: null; removedAt: null } => ({
  id: `h${++n}`, level, scopeKey, date, year: Number(date.slice(0, 4)), name, paid: true, optional: false, half: false, createdBy: null, removedAt: null,
});

function setup(weeklyOff = 'SUN') {
  const calls = { reaching: 0, weekly: 0 };
  const store = [
    row('NATIONAL', null, '2026-01-26', 'Republic Day'), row('NATIONAL', null, '2026-08-15', 'Independence Day'), row('NATIONAL', null, '2026-10-02', 'Gandhi Jayanti'),
    row('NATIONAL', null, '2027-01-26', 'Republic Day'),
    row('STATE', 'MH', '2026-05-01', 'Maharashtra Day'), row('CLIENT', 'tata', '2026-11-14', 'Client day'), row('SITE', 'pune-1', '2026-09-19', 'Site day'),
  ];
  const repo = {
    site: async (id: string) => (id === SITE.siteId ? SITE : null),
    reaching: async (_site: unknown, year: number) => {
      calls.reaching++;
      return store.filter((h) => h.year === year);
    },
    liveReplacements: async () => [{ id: 'r1', clientId: 'tata', holidayId: store[4]!.id, replacementDate: '2026-05-04', createdBy: null, removedAt: null }],
  };
  const settings = {
    forSite: async (_id: string, asOf: string) => {
      calls.weekly++;
      return { asOf, settings: [{ key: 'WEEKLY_OFF_DAYS', value: weeklyOff }] };
    },
  };
  const service = new HolidaysService({ holidaysRepository: repo as never, settingsService: settings as never, ctx: {} as never, events: new EventBuffer() });
  return { service, calls, store };
}
const d = (s: string) => Temporal.PlainDate.from(s);

beforeEach(() => calendarCache.clear());

describe('M14-HOL-03 calendar functions', () => {
  test('M14-HOL-03 AC1 (H1): holidaysFor returns exactly the six days for a range spanning the year, replacement included', async () => {
    const { service } = setup();
    const r = await service.holidaysFor('pune-1', d('2026-01-01'), d('2026-12-31'));
    expect(r.map((h) => h.date)).toEqual(['2026-01-26', '2026-05-04', '2026-08-15', '2026-09-19', '2026-10-02', '2026-11-14']);
    expect((await service.holidaysFor('pune-1', d('2026-08-01'), d('2026-09-30'))).map((h) => h.date)).toEqual(['2026-08-15', '2026-09-19']);
    expect(await service.holidaysFor('pune-1', d('2026-12-31'), d('2026-01-01'))).toEqual([]); // reversed range
  });

  test('M14-HOL-03 AC1: a range across a year end reads both years', async () => {
    const { service } = setup();
    expect((await service.holidaysFor('pune-1', d('2026-12-01'), d('2027-02-01'))).map((h) => h.date)).toEqual(['2027-01-26']);
  });

  test('M14-HOL-03 AC1: an unknown site is a 404', async () => {
    await expect(setup().service.holidaysFor('nope', d('2026-01-01'), d('2026-01-02'))).rejects.toMatchObject({ status: 404 });
  });

  test('M14-HOL-03 AC2: isWorkingDay is false on the weekly off and on a paid holiday, true otherwise', async () => {
    const { service } = setup('SUN');
    expect(await service.isWorkingDay('pune-1', d('2026-10-04'))).toBe(false); // Sunday
    expect(await service.isWorkingDay('pune-1', d('2026-10-02'))).toBe(false); // Gandhi Jayanti, a Friday
    expect(await service.isWorkingDay('pune-1', d('2026-10-03'))).toBe(true);
    expect(await service.isWorkingDay('pune-1', d('2026-05-01'))).toBe(true); // replaced by the client: a normal working day
    expect(await service.isWorkingDay('pune-1', d('2026-05-04'))).toBe(false); // …and the replacement day (a Monday) is the holiday
  });

  test('M14-HOL-03 AC2 (H2): addWorkingDays(PUNE-1, Thu 1 Oct 2026, 2) = Monday 5 Oct 2026', async () => {
    const { service } = setup('SUN');
    const due = await service.addWorkingDays('pune-1', d('2026-10-01'), 2);
    expect(due.toString()).toBe('2026-10-05');
    expect((await service.addWorkingDays('pune-1', d('2026-10-01'), 0)).toString()).toBe('2026-10-01');
    expect((await service.addWorkingDays('pune-1', d('2026-10-01'), 1)).toString()).toBe('2026-10-03');
  });

  test('M14-HOL-03 AC2: the weekly-off setting drives it (Saturday + Sunday off moves the due date to Tuesday 6 Oct)', async () => {
    const { service } = setup('SAT,SUN');
    expect((await service.addWorkingDays('pune-1', d('2026-10-01'), 2)).toString()).toBe('2026-10-06');
  });

  test('M14-HOL-03 AC3: holidays are cached per site per year (one query per year, not per call); clearing the cache reloads', async () => {
    const { service, calls } = setup();
    await service.holidaysFor('pune-1', d('2026-01-01'), d('2026-12-31'));
    await service.holidaysFor('pune-1', d('2026-03-01'), d('2026-03-31'));
    await service.isWorkingDay('pune-1', d('2026-10-03'));
    expect(calls.reaching).toBe(1);
    await service.holidaysFor('pune-1', d('2026-12-31'), d('2027-01-02')); // a second year: one more load
    expect(calls.reaching).toBe(2);
    calendarCache.clear(); // what the holiday.changed event does after a commit
    await service.holidaysFor('pune-1', d('2026-01-01'), d('2026-12-31'));
    expect(calls.reaching).toBe(3);
  });
});
