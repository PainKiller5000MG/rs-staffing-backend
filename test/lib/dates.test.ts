import { expect, test } from 'vitest';
import { daysInMonth, daysOf, isEffectiveOn, lastDay, parseDate, parseWageMonth } from '../../src/lib/dates.ts';

test('wage month helpers', () => {
  const feb = parseWageMonth('2028-02');
  expect(daysInMonth(feb)).toBe(29);
  expect(lastDay(feb).toString()).toBe('2028-02-29');
  expect(daysOf(parseWageMonth('2026-09')).map(String).at(-1)).toBe('2026-09-30');
});

test('parseDate rejects impossible dates', () => {
  expect(() => parseDate('2026-02-30')).toThrow();
});

test('effective ranges are inclusive and open-ended when to is null', () => {
  const from = parseDate('2026-09-01');
  const to = parseDate('2026-09-30');
  expect(isEffectiveOn(parseDate('2026-09-30'), from, to)).toBe(true);
  expect(isEffectiveOn(parseDate('2026-10-01'), from, to)).toBe(false);
  expect(isEffectiveOn(parseDate('2030-01-01'), from, null)).toBe(true);
  expect(isEffectiveOn(parseDate('2026-08-31'), from, null)).toBe(false);
});
