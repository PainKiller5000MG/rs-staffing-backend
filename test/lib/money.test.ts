import { describe, expect, test } from 'vitest';
import {
  divRound,
  formatInr,
  paiseFromRupees,
  percentOf,
  prorate,
  roundToRupee,
  rupeesString,
} from '../../src/lib/money.ts';

describe('divRound', () => {
  test.each([
    // n, d, half-up, up, down
    [7n, 2n, 4n, 4n, 3n],
    [5n, 2n, 3n, 3n, 2n],
    [4n, 3n, 1n, 2n, 1n],
    [5n, 3n, 2n, 2n, 1n],
    [-7n, 2n, -4n, -3n, -4n],
    [-4n, 3n, -1n, -1n, -2n],
    [6n, 3n, 2n, 2n, 2n],
    [7n, -2n, -4n, -3n, -4n],
  ])('%s / %s', (n, d, halfUp, up, down) => {
    expect(divRound(n, d, 'half-up')).toBe(halfUp);
    expect(divRound(n, d, 'up')).toBe(up);
    expect(divRound(n, d, 'down')).toBe(down);
  });

  test('rejects division by zero', () => {
    expect(() => divRound(1n, 0n, 'half-up')).toThrow(RangeError);
  });
});

describe('rupee strings', () => {
  test('parse', () => {
    expect(paiseFromRupees('1234')).toBe(123400n);
    expect(paiseFromRupees('1234.5')).toBe(123450n);
    expect(paiseFromRupees('0.07')).toBe(7n);
    expect(paiseFromRupees('-0.75')).toBe(-75n);
    expect(() => paiseFromRupees('1.234')).toThrow(RangeError);
    expect(() => paiseFromRupees('1,234')).toThrow(RangeError);
  });

  test('format', () => {
    expect(rupeesString(123456789n)).toBe('1234567.89');
    expect(rupeesString(-5n)).toBe('-0.05');
    expect(formatInr(12345678900n)).toBe('₹12,34,56,789.00');
    expect(formatInr(-150n)).toBe('-₹1.50');
  });
});

describe('statutory-style arithmetic', () => {
  test('percentOf rounds to the paisa by the given mode', () => {
    // 12% of ₹15,000 = ₹1,800 exactly
    expect(percentOf(1_500_000n, '12', 'half-up')).toBe(180_000n);
    // 0.75% of ₹21,000.01 = ₹157.500075 → 15750.0075 paise
    expect(percentOf(2_100_001n, '0.75', 'half-up')).toBe(15_750n);
    expect(percentOf(2_100_001n, '0.75', 'up')).toBe(15_751n);
    expect(percentOf(2_100_001n, '3.2500', 'down')).toBe(68_250n);
  });

  test('roundToRupee', () => {
    expect(roundToRupee(15_750n, 'half-up')).toBe(15_800n);
    expect(roundToRupee(15_749n, 'half-up')).toBe(15_700n);
    expect(roundToRupee(15_701n, 'up')).toBe(15_800n);
    expect(roundToRupee(15_799n, 'down')).toBe(15_700n);
  });

  test('prorate by paid days', () => {
    // ₹15,000 × 26 / 30 = ₹13,000
    expect(prorate(1_500_000n, 26n, 30n, 'half-up')).toBe(1_300_000n);
    // ₹10,000 × 1 / 31 = 32258.06… paise
    expect(prorate(1_000_000n, 1n, 31n, 'half-up')).toBe(32_258n);
  });
});
