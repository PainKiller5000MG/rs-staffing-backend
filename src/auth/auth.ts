// Better Auth: identity only (auth.user / session / account / verification,
// in the `auth` schema). Roles, status, expiry and site scopes stay in
// app.users and app.user_site_scopes; core/guards.ts joins the two.
//
// Login is phone OTP for everyone (Decision 16). There is no self sign-up:
// HQ creates users, and sendOTP only sends to a number that belongs to an
// ACTIVE app user, while the endpoint answers the same either way.
import { betterAuth } from 'better-auth';
import { bearer, phoneNumber } from 'better-auth/plugins';
import pg from 'pg';
import type { Config } from '../core/config.ts';
import type { Logger } from '../core/logger.ts';
import type { SmsProvider } from '../lib/sms.ts';
import { CLIENT_IP_HEADER } from '../core/client-ip.ts';

export type AuthDeps = {
  config: Config;
  logger: Logger;
  sms: SmsProvider;
  /** True when the mobile belongs to an ACTIVE app.users row. */
  isActiveMobile: (mobile: string) => Promise<boolean>;
  /** After a session is created: last-login time, login event, audit row (M1-AUD-02). */
  onLogin?: (authUserId: string, ip: string | null) => Promise<void>;
  pool?: pg.Pool;
};

const E164_INDIA = /^\+91[6-9]\d{9}$/;

/** Better Auth requires an email on every user; phone-only users get an unroutable one. */
export const placeholderEmail = (mobile: string) => `${mobile.replace(/\D/g, '')}@phone.rs-staffing.invalid`;

export function createAuthPool(databaseUrl: string): pg.Pool {
  return new pg.Pool({ connectionString: databaseUrl, options: '-c search_path=auth' });
}

export function createAuth({ config, logger, sms, isActiveMobile, onLogin, pool }: AuthDeps) {
  return betterAuth({
    appName: 'RS Staffing',
    baseURL: config.BETTER_AUTH_URL,
    basePath: '/api/auth',
    secret: config.BETTER_AUTH_SECRET,
    database: pool ?? createAuthPool(config.DATABASE_URL),
    trustedOrigins: config.WEB_ORIGINS,
    emailAndPassword: { enabled: false },
    session: {
      expiresIn: 60 * 60 * 12, // 12 h
      updateAge: 60 * 30, // refreshed every 30 min of use
    },
    rateLimit: {
      enabled: config.NODE_ENV !== 'test',
      window: 60,
      max: 60,
      customRules: {
        '/phone-number/send-otp': { window: 600, max: 3 },
        '/phone-number/verify': { window: 300, max: 10 },
      },
    },
    databaseHooks: {
      session: {
        create: {
          after: async (session) => {
            await onLogin?.(session.userId, session.ipAddress ?? null).catch((err: unknown) =>
              logger.error({ err }, 'login bookkeeping failed'),
            );
          },
        },
      },
    },
    advanced: {
      database: { generateId: 'uuid' },
      // Rate limits key on the IP the app computed (core/client-ip.ts), so a
      // spoofed X-Forwarded-For can't mint fresh limits.
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
      useSecureCookies: config.NODE_ENV === 'production',
    },
    plugins: [
      // A frontend on another domain sends `Authorization: Bearer <token>`; the token
      // comes back in the `set-auth-token` header of the verify response. Cookies still work.
      bearer(),
      phoneNumber({
        otpLength: 6,
        expiresIn: 300,
        allowedAttempts: 3,
        phoneNumberValidator: (n) => E164_INDIA.test(n),
        // Not awaited: the response must not reveal (by content or timing)
        // whether the number belongs to anyone.
        sendOTP: ({ phoneNumber: mobile, code }) => {
          void isActiveMobile(mobile)
            .then((active) => (active ? sms.sendOtp(mobile, code) : undefined))
            .catch((err: unknown) => logger.error({ err }, 'sendOTP failed'));
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
