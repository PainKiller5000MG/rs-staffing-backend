import { describe, expect, test } from 'vitest';
import { isAadhaar, verhoeffDigit, verhoeffValid } from '../../src/lib/verhoeff.ts';

describe('Verhoeff (M3-PRF-05 AC1)', () => {
  test('the textbook example: 236 + check digit 3', () => {
    expect(verhoeffDigit('236')).toBe(3);
    expect(verhoeffValid('2363')).toBe(true);
    expect(verhoeffValid('2364')).toBe(false);
  });

  test('every single-digit change and every adjacent swap in a 12-digit number is caught', () => {
    const base = '23456789012';
    const n = base + verhoeffDigit(base);
    expect(isAadhaar(n)).toBe(true);
    for (let i = 0; i < 12; i++) {
      for (let d = 0; d < 10; d++) {
        if (String(d) === n[i]) continue;
        expect(verhoeffValid(n.slice(0, i) + d + n.slice(i + 1))).toBe(false);
      }
    }
    for (let i = 0; i < 11; i++) {
      if (n[i] === n[i + 1]) continue;
      expect(verhoeffValid(n.slice(0, i) + n[i + 1] + n[i] + n.slice(i + 2))).toBe(false);
    }
  });

  test('Aadhaar shape: 12 digits, not starting 0 or 1, digits only', () => {
    const ok = '23456789012' + verhoeffDigit('23456789012');
    expect(isAadhaar(ok)).toBe(true);
    expect(isAadhaar(ok.slice(1))).toBe(false);
    expect(isAadhaar('0' + ok.slice(1))).toBe(false);
    expect(isAadhaar('1' + ok.slice(1))).toBe(false);
    expect(isAadhaar(ok.slice(0, 11) + 'x')).toBe(false);
    expect(verhoeffValid('')).toBe(false);
  });
});
