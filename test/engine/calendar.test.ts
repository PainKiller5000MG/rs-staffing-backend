// M14 worked examples H1 and H2, and the merge rules of M14-HOL-03, against the pure calendar engine.
import { expect, test } from 'vitest';
import { addWorkingDays, isWorkingDay, isWeeklyOff, mergeSiteHolidays, weeklyOffDays, type HolidayRow, type ReplacementRow, type SiteReach } from '../../src/engine/calendar.ts';

const PUNE: SiteReach = { siteId: 'site-pune-1', clientId: 'client-tata', stateCode: 'MH' };
let n = 0;
const h = (level: HolidayRow['level'], scopeKey: string | null, date: string, name: string, over: Partial<HolidayRow> = {}): HolidayRow => ({
  id: `h${++n}`, level, scopeKey, date, name, paid: true, optional: false, half: false, ...over,
});

const national = [h('NATIONAL', null, '2026-01-26', 'Republic Day'), h('NATIONAL', null, '2026-08-15', 'Independence Day'), h('NATIONAL', null, '2026-10-02', 'Gandhi Jayanti')];
const mayDay = h('STATE', 'MH', '2026-05-01', 'Maharashtra Day');
const clientDay = h('CLIENT', 'client-tata', '2026-11-14', 'Client festival');
const siteDay = h('SITE', 'site-pune-1', '2026-09-19', 'Site festival');
const swap: ReplacementRow = { clientId: 'client-tata', holidayId: mayDay.id, replacementDate: '2026-05-04' };
const year = { from: '2026-01-01', to: '2026-12-31' };
const dates = (r: ReturnType<typeof mergeSiteHolidays>) => r.map((x) => x.date);

test('M14-HOL-03 AC1 (H1): national + state + client + site, minus the replaced state day, plus its replacement → exactly six days', () => {
  const r = mergeSiteHolidays({ holidays: [...national, mayDay, clientDay, siteDay], replacements: [swap], site: PUNE, ...year });
  expect(dates(r)).toEqual(['2026-01-26', '2026-05-04', '2026-08-15', '2026-09-19', '2026-10-02', '2026-11-14']);
  expect(r.find((x) => x.date === '2026-05-04')).toMatchObject({ replacesDate: '2026-05-01', levels: ['CLIENT'] });
  expect(dates(r)).not.toContain('2026-05-01');
});

test('M14-HOL-03 AC1: another state, another client and another site contribute nothing', () => {
  const others = [h('STATE', 'MP', '2026-03-03', 'MP day'), h('CLIENT', 'client-other', '2026-03-04', 'Other client'), h('SITE', 'site-other', '2026-03-05', 'Other site')];
  const r = mergeSiteHolidays({ holidays: [...national, ...others], replacements: [], site: PUNE, ...year });
  expect(dates(r)).toEqual(['2026-01-26', '2026-08-15', '2026-10-02']);
});

test('M14-HOL-03 AC1: without the client’s replacement the state day stays; another client’s replacement does not apply', () => {
  const r = mergeSiteHolidays({ holidays: [mayDay], replacements: [{ ...swap, clientId: 'client-other' }], site: PUNE, ...year });
  expect(dates(r)).toEqual(['2026-05-01']);
});

test('M14-HOL-02 AC2: a replacement row pointing at a national holiday is ignored (national days cannot be swapped)', () => {
  const r = mergeSiteHolidays({ holidays: national, replacements: [{ clientId: 'client-tata', holidayId: national[1]!.id, replacementDate: '2026-08-17' }], site: PUNE, ...year });
  expect(dates(r)).toEqual(['2026-01-26', '2026-08-15', '2026-10-02']);
});

test('M14-HOL-03 edge: two levels on the same date count once, and both levels are shown', () => {
  const r = mergeSiteHolidays({ holidays: [...national, h('STATE', 'MH', '2026-10-02', 'State Gandhi day'), h('CLIENT', 'client-tata', '2026-10-02', 'Client Gandhi day')], replacements: [], site: PUNE, ...year });
  expect(r.filter((x) => x.date === '2026-10-02')).toHaveLength(1);
  expect(r.find((x) => x.date === '2026-10-02')!.levels).toEqual(['NATIONAL', 'STATE', 'CLIENT']);
});

test('M14-HOL-03 edge: a replacement landing on an existing holiday counts once', () => {
  const r = mergeSiteHolidays({ holidays: [...national, mayDay], replacements: [{ ...swap, replacementDate: '2026-08-15' }], site: PUNE, ...year });
  expect(dates(r)).toEqual(['2026-01-26', '2026-08-15', '2026-10-02']);
});

test('M14-HOL-03 AC1: unpaid days are never returned; optional days only when chosen; the range is inclusive', () => {
  const unpaid = h('SITE', 'site-pune-1', '2026-02-02', 'Unpaid', { paid: false });
  const optional = h('CLIENT', 'client-tata', '2026-03-03', 'Optional', { optional: true });
  const base = { holidays: [...national, unpaid, optional], replacements: [], site: PUNE };
  expect(dates(mergeSiteHolidays({ ...base, ...year }))).toEqual(['2026-01-26', '2026-08-15', '2026-10-02']);
  expect(dates(mergeSiteHolidays({ ...base, ...year, chosenOptional: new Set([optional.id]) }))).toEqual(['2026-01-26', '2026-03-03', '2026-08-15', '2026-10-02']);
  expect(dates(mergeSiteHolidays({ ...base, from: '2026-08-15', to: '2026-10-02' }))).toEqual(['2026-08-15', '2026-10-02']);
});

test('M14 edge: a half-day holiday is returned as half; with a full day on the same date it is a full day', () => {
  const eve = h('CLIENT', 'client-tata', '2026-11-13', 'Festival eve', { half: true });
  expect(mergeSiteHolidays({ holidays: [eve], replacements: [], site: PUNE, ...year })[0]).toMatchObject({ half: true });
  const both = mergeSiteHolidays({ holidays: [eve, h('SITE', 'site-pune-1', '2026-11-13', 'Full')], replacements: [], site: PUNE, ...year });
  expect(both[0]).toMatchObject({ half: false });
});

// --- working days -------------------------------------------------------------------

const d = (s: string) => Temporal.PlainDate.from(s);
const sunday = weeklyOffDays('SUN');
const marks = (rows: HolidayRow[]) => new Map(mergeSiteHolidays({ holidays: rows, replacements: [], site: PUNE, ...year }).map((x) => [x.date, x]));

test('M14-HOL-03 AC2 (H2): Thursday 1 Oct 2026 + 2 working days = Monday 5 Oct (2 Oct holiday, 4 Oct weekly off)', () => {
  const m = marks(national);
  const out = addWorkingDays(d('2026-10-01'), 2, (x) => isWorkingDay(x, sunday, m));
  expect(out.toString()).toBe('2026-10-05');
  expect(isWorkingDay(d('2026-10-02'), sunday, m)).toBe(false); // Friday: Gandhi Jayanti
  expect(isWorkingDay(d('2026-10-03'), sunday, m)).toBe(true); // Saturday
  expect(isWorkingDay(d('2026-10-04'), sunday, m)).toBe(false); // Sunday
  expect(out.dayOfWeek).toBe(1);
});

test('M14-HOL-03 AC2: zero days returns the start; a half-day holiday is a working day; two weekly-off days; rotational has no fixed off', () => {
  const m = marks([h('CLIENT', 'client-tata', '2026-11-13', 'Eve', { half: true })]);
  expect(addWorkingDays(d('2026-11-12'), 0, () => false).toString()).toBe('2026-11-12');
  expect(isWorkingDay(d('2026-11-13'), sunday, m)).toBe(true);
  const satSun = weeklyOffDays('SAT,SUN');
  expect(isWeeklyOff(d('2026-10-03'), satSun)).toBe(true);
  expect(isWorkingDay(d('2026-10-05'), satSun, new Map())).toBe(true);
  expect(weeklyOffDays('ROTATIONAL').size).toBe(0);
  expect(weeklyOffDays(null).size).toBe(0);
});

test('M14-HOL-03 AC2: negative or fractional n is refused; a calendar with no working day cannot loop forever', () => {
  expect(() => addWorkingDays(d('2026-10-01'), -1, () => true)).toThrow(RangeError);
  expect(() => addWorkingDays(d('2026-10-01'), 1.5, () => true)).toThrow(RangeError);
  expect(() => addWorkingDays(d('2026-10-01'), 1, () => false)).toThrow(/no working days/);
});

test('M14-HOL-03 AC2: skipping across a year end and a leap day', () => {
  const m = marks([]);
  expect(addWorkingDays(d('2027-02-26'), 3, (x) => isWorkingDay(x, sunday, m)).toString()).toBe('2027-03-02'); // Fri 26 Feb + 3 → Tue 2 Mar (Sun skipped)
  expect(addWorkingDays(d('2028-02-28'), 1, (x) => isWorkingDay(x, sunday, new Map())).toString()).toBe('2028-02-29'); // leap day, a Tuesday
});
