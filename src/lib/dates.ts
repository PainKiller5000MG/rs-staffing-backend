// Dates are Temporal.PlainDate; wage months are Temporal.PlainYearMonth.
// Never use JS Date for wage months. This installs the same global polyfill
// as src/prisma/db.ts, so values read from the database and values built here are the
// same classes. (Node < 26.8.2 has no global Temporal.)
/// <reference types="temporal-polyfill/types/global" />
import 'temporal-polyfill/full/global';

export type PlainDate = Temporal.PlainDate;
export type WageMonth = Temporal.PlainYearMonth;

export const BUSINESS_TIME_ZONE = 'Asia/Kolkata';

/** "2026-09-15" → PlainDate. Rejects anything that isn't a calendar date. */
export function parseDate(iso: string): PlainDate {
  return Temporal.PlainDate.from(iso, { overflow: 'reject' });
}

/** "2026-09" → wage month. */
export function parseWageMonth(iso: string): WageMonth {
  return Temporal.PlainYearMonth.from(iso, { overflow: 'reject' });
}

/** Today's date in India, regardless of the server's time zone. */
export function today(): PlainDate {
  return Temporal.Now.plainDateISO(BUSINESS_TIME_ZONE);
}

export function wageMonthOf(date: PlainDate): WageMonth {
  return date.toPlainYearMonth();
}

export function daysInMonth(month: WageMonth): number {
  return month.daysInMonth;
}

export function firstDay(month: WageMonth): PlainDate {
  return month.toPlainDate({ day: 1 });
}

export function lastDay(month: WageMonth): PlainDate {
  return month.toPlainDate({ day: month.daysInMonth });
}

/** Every date of the wage month, in order. */
export function daysOf(month: WageMonth): PlainDate[] {
  return Array.from({ length: month.daysInMonth }, (_, i) => month.toPlainDate({ day: i + 1 }));
}

/**
 * Whether `date` falls inside an effective-dated row. `to` is inclusive and
 * null means open-ended — the same rule as the no-overlap constraints in
 * sql/001_extras.sql (daterange(from, to, '[]')).
 */
export function isEffectiveOn(date: PlainDate, from: PlainDate, to: PlainDate | null): boolean {
  return Temporal.PlainDate.compare(date, from) >= 0 && (to === null || Temporal.PlainDate.compare(date, to) <= 0);
}
