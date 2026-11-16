// Holiday calendar rules (M14-HOL-03). Pure: no database, no clock. The service loads the rows.
//
// A site's paid holidays = national ∪ state (site's state) ∪ client ∪ site, minus the state holidays
// its client replaced, plus the replacement days. Two levels on the same date count once.

export type HolidayLevel = 'NATIONAL' | 'STATE' | 'CLIENT' | 'SITE';

export type HolidayRow = {
  id: string;
  level: HolidayLevel;
  scopeKey: string | null;
  date: string; // ISO yyyy-mm-dd
  name: string;
  paid: boolean;
  optional: boolean;
  half: boolean;
};

/** A client swapped one of its state's holidays for another day. */
export type ReplacementRow = { clientId: string; holidayId: string; replacementDate: string };

export type SiteReach = { siteId: string; clientId: string; stateCode: string };

export type SiteHoliday = {
  date: string;
  name: string;
  levels: HolidayLevel[];
  /** Counts 0.5 paid holiday + 0.5 working day. */
  half: boolean;
  optional: boolean;
  /** Set when this day is a client's replacement for a state holiday. */
  replacesDate: string | null;
};

const ORDER: HolidayLevel[] = ['NATIONAL', 'STATE', 'CLIENT', 'SITE'];

const reaches = (h: HolidayRow, site: SiteReach): boolean =>
  h.level === 'NATIONAL' ||
  (h.level === 'STATE' && h.scopeKey === site.stateCode) ||
  (h.level === 'CLIENT' && h.scopeKey === site.clientId) ||
  (h.level === 'SITE' && h.scopeKey === site.siteId);

/**
 * The paid holidays of one site between `from` and `to` (inclusive), one entry per date, in date order.
 * Optional holidays appear only when their id is in `chosenOptional` (the employee chose them).
 * Unpaid entries are never returned.
 */
export function mergeSiteHolidays(input: {
  holidays: readonly HolidayRow[];
  replacements: readonly ReplacementRow[];
  site: SiteReach;
  from: string;
  to: string;
  chosenOptional?: ReadonlySet<string>;
}): SiteHoliday[] {
  const { site, from, to } = input;
  const chosen = input.chosenOptional ?? new Set<string>();
  const replaced = new Map(input.replacements.filter((r) => r.clientId === site.clientId).map((r) => [r.holidayId, r]));
  const byDate = new Map<string, SiteHoliday>();

  const put = (date: string, name: string, level: HolidayLevel, half: boolean, optional: boolean, replacesDate: string | null) => {
    if (date < from || date > to) return;
    const hit = byDate.get(date);
    if (!hit) {
      byDate.set(date, { date, name, levels: [level], half, optional, replacesDate });
      return;
    }
    if (!hit.levels.includes(level)) hit.levels.push(level);
    // The same day from two sources is a full day if either source is a full day.
    hit.half = hit.half && half;
    hit.optional = hit.optional && optional;
  };

  const rows = input.holidays.filter((h) => h.paid && reaches(h, site)).sort((a, b) => ORDER.indexOf(a.level) - ORDER.indexOf(b.level) || a.date.localeCompare(b.date));
  for (const h of rows) {
    if (h.optional && !chosen.has(h.id)) continue;
    const swap = h.level === 'STATE' ? replaced.get(h.id) : undefined; // a national day can never be replaced
    if (swap) put(swap.replacementDate, `${h.name} (replacement day)`, 'CLIENT', h.half, h.optional, h.date);
    else put(h.date, h.name, h.level, h.half, h.optional, null);
  }
  for (const h of byDate.values()) h.levels.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const WEEKDAY = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;

/** `WEEKLY_OFF_DAYS` ("SUN", "SAT,SUN", "ROTATIONAL") → the weekdays that are off for the whole site. Rotational has none site-wide. */
export function weeklyOffDays(setting: string | null): ReadonlySet<string> {
  if (!setting || setting === 'ROTATIONAL') return new Set();
  return new Set(setting.split(',').map((d) => d.trim()));
}

export const isWeeklyOff = (date: Temporal.PlainDate, off: ReadonlySet<string>): boolean => off.has(WEEKDAY[date.dayOfWeek - 1]!);

/** Not a weekly off and not a (full-day) paid holiday. A half-day holiday is still a working day. */
export function isWorkingDay(date: Temporal.PlainDate, off: ReadonlySet<string>, holidays: ReadonlyMap<string, SiteHoliday>): boolean {
  if (isWeeklyOff(date, off)) return false;
  const h = holidays.get(date.toString());
  return !h || h.half;
}

/** The n-th working day after `start` (`start` itself is not counted). n = 0 returns `start`. */
export function addWorkingDays(start: Temporal.PlainDate, n: number, isWorking: (d: Temporal.PlainDate) => boolean): Temporal.PlainDate {
  if (!Number.isInteger(n) || n < 0) throw new RangeError('n must be a whole number of days, 0 or more');
  let day = start;
  let left = n;
  // A calendar where nothing is ever a working day must not loop forever.
  for (let guard = 0; left > 0; guard++) {
    if (guard > 366 * 3) throw new RangeError('no working days found in three years');
    day = day.add({ days: 1 });
    if (isWorking(day)) left--;
  }
  return day;
}
