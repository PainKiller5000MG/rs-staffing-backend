// Penny-drop verification behind an interface (M3-BNK-02). The provider (Razorpay, Cashfree or
// Decentro) is an open question in docs/DECISIONS.md; production swaps the class, nothing else.

export type VerifyInput = { accountNumber: string; ifsc: string; holderName: string };
export type VerifyResult =
  | { ok: true; returnedName: string; ref: string }
  | { ok: false; reason: string; ref: string };

export interface BankVerifier {
  verify(input: VerifyInput): Promise<VerifyResult>;
}

/**
 * The 24-hour-build stub: "verified" with the name that was entered. Test hook, never in production:
 * an account number ending 0000 is reported as not found.
 */
export class StubBankVerifier implements BankVerifier {
  async verify(input: VerifyInput): Promise<VerifyResult> {
    const ref = `STUB-${Date.now()}`;
    if (input.accountNumber.endsWith('0000')) return { ok: false, reason: 'Account not found', ref };
    return { ok: true, returnedName: input.holderName, ref };
  }
}
