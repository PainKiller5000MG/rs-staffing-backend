// Default masking for sensitive identifiers in API responses (M1-SCP-05 AC1).
// Audit rows mask the same fields by key (core/audit.ts).
export const maskAadhaar = (last4: string): string => `XXXX XXXX ${last4}`;
export const maskBankAccount = (last4: string): string => `XXXXXX${last4}`;
/** ABCDE1234F → ABXXXXX4F */
export const maskPan = (pan: string): string => `${pan.slice(0, 2)}XXXXX${pan.slice(-2)}`;
/** Full DOB is never returned (HOW-TO rule): only the year survives. 1992-03-05 → 1992-XX-XX */
export const maskDob = (iso: string): string => `${iso.slice(0, 4)}-XX-XX`;
