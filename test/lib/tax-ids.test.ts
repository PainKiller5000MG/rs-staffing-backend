import { describe, expect, test } from 'vitest';
import { checkGstin, gstinCheckChar, isPan } from '../../src/lib/tax-ids.ts';

describe('GSTIN', () => {
  test('known valid GSTINs pass (published examples)', () => {
    expect(checkGstin('27AAPFU0939F1ZV')).toBeNull();
    expect(checkGstin('29AAGCB7383J1Z4')).toBeNull();
  });
  test('wrong check character → checksum; malformed → format', () => {
    expect(checkGstin('27AAPFU0939F1ZA')).toBe('checksum');
    expect(checkGstin('27AAPFU0939F1Z')).toBe('format');
    expect(checkGstin('27aapfu0939f1zv')).toBe('format');
    expect(checkGstin('27AAPFU0939F1XV')).toBe('format'); // 14th char must be Z
  });
  test('gstinCheckChar reproduces the 15th character', () => {
    expect(gstinCheckChar('27AAPFU0939F1Z')).toBe('V');
  });
});

describe('PAN', () => {
  test('format and holder type', () => {
    expect(isPan('AAPFU0939F')).toBe(true);
    expect(isPan('AABCT1234F')).toBe(true);
    expect(isPan('AAAXU0939F')).toBe(false); // X is not a holder type
    expect(isPan('AAPFU09391')).toBe(false);
    expect(isPan('aapfu0939f')).toBe(false);
  });
});
