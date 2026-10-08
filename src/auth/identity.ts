// The Better Auth side of a user: the identity a phone OTP signs into, and
// its sessions. Services depend on this interface, not on Better Auth.
import type { Auth } from './auth.ts';
import { placeholderEmail } from './auth.ts';

export interface Identity {
  /** Finds or creates the auth.user for this mobile. `created` says whether to undo on failure. */
  ensure(name: string, mobile: string): Promise<{ authUserId: string; created: boolean }>;
  remove(authUserId: string): Promise<void>;
  revokeSessions(authUserId: string): Promise<void>;
}

export class BetterAuthIdentity implements Identity {
  readonly #auth: Auth;

  constructor({ auth }: { auth: Auth }) {
    this.#auth = auth;
  }

  async ensure(name: string, mobile: string) {
    const { internalAdapter } = await this.#auth.$context;
    const email = placeholderEmail(mobile);
    const existing = await internalAdapter.findUserByEmail(email);
    if (existing) return { authUserId: existing.user.id, created: false };
    const user = await internalAdapter.createUser(
      { name, email, phoneNumber: mobile, phoneNumberVerified: false },
      { method: 'admin' }, // HQ creates every user; there is no self sign-up
    );
    return { authUserId: user.id, created: true };
  }

  async remove(authUserId: string) {
    const { internalAdapter } = await this.#auth.$context;
    await internalAdapter.deleteUser(authUserId);
  }

  async revokeSessions(authUserId: string) {
    const { internalAdapter } = await this.#auth.$context;
    await internalAdapter.deleteUserSessions(authUserId);
  }
}
