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
    WEB_ORIGIN: z.url().default('http://localhost:3001'),
    DATA_KEY: base64Key.optional(),
    HMAC_KEY: base64Key.optional(),
    SMS_PROVIDER: z.enum(['mock']).default('mock'),
    /** true only behind our own reverse proxy: then the last X-Forwarded-For hop is the client. */
    TRUST_PROXY: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    for (const key of ['BETTER_AUTH_SECRET', 'DATA_KEY', 'HMAC_KEY'] as const) {
      if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'required in production' });
    }
  });

const DEV_AUTH_SECRET = 'dev-only-better-auth-secret-change-me-0000';

export type Config = Omit<z.infer<typeof schema>, 'BETTER_AUTH_SECRET'> & { BETTER_AUTH_SECRET: string };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${lines.join('\n')}`);
  }
  return { ...parsed.data, BETTER_AUTH_SECRET: parsed.data.BETTER_AUTH_SECRET ?? DEV_AUTH_SECRET };
}

let cached: Config | undefined;

/** The process-wide config, validated on first use. */
export function config(): Config {
  cached ??= loadConfig();
  return cached;
}
