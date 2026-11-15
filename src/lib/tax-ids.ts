// GSTIN and PAN validation. Format is checked first, then the GSTIN check
// character (base-36 Luhn-style, the algorithm GSTN publishes).

const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const GSTIN_FORMAT = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
/** 4th character is the holder type: P person, C company, H HUF, F firm, A AOP, T trust, B BOI, L local authority, J juridical, G government. */
const PAN_FORMAT = /^[A-Z]{3}[PCHFATBLJG][A-Z][0-9]{4}[A-Z]$/;

/** The 15th character for the first 14 characters of a GSTIN. */
export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const value = CHARS.indexOf(first14.charAt(i));
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARS.charAt((36 - (sum % 36)) % 36);
}

export type TaxIdProblem = 'format' | 'checksum';

export function checkGstin(gstin: string): TaxIdProblem | null {
  if (!GSTIN_FORMAT.test(gstin)) return 'format';
  return gstinCheckChar(gstin.slice(0, 14)) === gstin.charAt(14) ? null : 'checksum';
}

export const isPan = (pan: string): boolean => PAN_FORMAT.test(pan);

/** A GSTIN embeds the holder's PAN in characters 3–12. */
export const panOfGstin = (gstin: string): string => gstin.slice(2, 12);
