// Environment, validated once at boot. Anything invalid stops the process
// with every problem listed — the app never runs half-configured.
// Development and test get fixed fallback secrets; production must set them.
import { z } from 'zod';
import '../prisma/env.ts';

const base64Key = z
  .string()
  .refine((s) => Buffer.from(s, 'base64').length === 32, 'must be 32 bytes, base64-encoded');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    BETTER_AUTH_SECRET: z.string().min(32).optional(),
    BETTER_AUTH_URL: z.url().default('http://localhost:3000'),
    /** The frontend origin(s), comma-separated: CORS + Better Auth trusted origins. */
    WEB_ORIGIN: z
      .string()
      .default('http://localhost:3001')
      .transform((v) => v.split(',').map((o) => o.trim()).filter(Boolean))
      .pipe(z.array(z.url()).min(1)),
    DATA_KEY: base64Key.optional(),
    HMAC_KEY: base64Key.optional(),
    SMS_PROVIDER: z.enum(['mock', 'msg91']).default('mock'),
    MSG91_AUTH_KEY: z.string().min(10).optional(),
    MSG91_SENDER_ID: z.string().regex(/^[A-Z]{6}$/, 'a 6-letter DLT sender id').optional(),
    MSG91_TPL_OTP: z.string().min(1).optional(),
    MSG91_TPL_PAYSLIP: z.string().min(1).optional(),
    MSG91_TPL_PAYSLIP_REVISED: z.string().min(1).optional(),
    MSG91_TPL_FNF: z.string().min(1).optional(),
    /** Sent by MSG91 as the x-rs-webhook-secret header (a custom header set on the webhook). */
    MSG91_WEBHOOK_SECRET: z.string().min(24).optional(),
    /** Optional comma-separated IP allow-list for the delivery-report webhook. */
    MSG91_WEBHOOK_IPS: z
      .string()
      .optional()
      .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [])),
    /** OTP sends allowed per phone and per IP per hour (M1-OTP-03); over the limit the reply is the same, no SMS. */
    /** M1-LOG-06: minutes without API activity before a session ends; 0 = never. */
    IDLE_TIMEOUT_MIN_HQ: z.coerce.number().int().min(0).default(30),
    IDLE_TIMEOUT_MIN_FIELD: z.coerce.number().int().min(0).default(0),
    /** Where uploaded files live: a local directory in dev/test; an S3-compatible bucket in an Indian region in production. */
    STORAGE_DIR: z.string().default('./.storage'),
    OTP_MAX_PER_PHONE_HOUR: z.coerce.number().int().positive().default(5),
    OTP_MAX_PER_IP_HOUR: z.coerce.number().int().positive().default(20),
    /** true only behind our own reverse proxy: then the last X-Forwarded-For hop is the client. */
    TRUST_PROXY: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  })
  .superRefine((env, ctx) => {
    if (env.SMS_PROVIDER === 'msg91') {
      for (const key of ['MSG91_AUTH_KEY', 'MSG91_SENDER_ID', 'MSG91_TPL_OTP', 'MSG91_TPL_PAYSLIP', 'MSG91_TPL_PAYSLIP_REVISED', 'MSG91_TPL_FNF', 'MSG91_WEBHOOK_SECRET'] as const) {
        if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'required when SMS_PROVIDER=msg91' });
      }
    }
    if (env.NODE_ENV !== 'production') return;
    for (const key of ['BETTER_AUTH_SECRET', 'DATA_KEY', 'HMAC_KEY'] as const) {
      if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'required in production' });
    }
  });

const DEV_AUTH_SECRET = 'dev-only-better-auth-secret-change-me-0000';

export type Config = Omit<z.infer<typeof schema>, 'BETTER_AUTH_SECRET' | 'WEB_ORIGIN'> & {
  BETTER_AUTH_SECRET: string;
  /** Parsed WEB_ORIGIN list. */
  WEB_ORIGINS: string[];
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${lines.join('\n')}`);
  }
  const { WEB_ORIGIN, ...rest } = parsed.data;
  return { ...rest, WEB_ORIGINS: WEB_ORIGIN, BETTER_AUTH_SECRET: parsed.data.BETTER_AUTH_SECRET ?? DEV_AUTH_SECRET };
}

let cached: Config | undefined;

/** The process-wide config, validated on first use. */
export function config(): Config {
  cached ??= loadConfig();
  return cached;
}
