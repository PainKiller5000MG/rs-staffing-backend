// pino logger. Personal data never reaches the logs: the fields below are
// redacted wherever they appear (up to three levels deep).
import { pino, type Logger } from 'pino';
import { config } from './config.ts';

const SENSITIVE = [
  'aadhaar',
  'aadhaarNumber',
  'accountNumber',
  'account',
  'mobile',
  'phoneNumber',
  'phone',
  'dob',
  'otp',
  'code',
  'password',
  'token',
];

const paths = [
  ...SENSITIVE.flatMap((k) => [k, `*.${k}`, `*.*.${k}`]),
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
];

export function createLogger(): Logger {
  const { NODE_ENV, LOG_LEVEL } = config();
  return pino({
    level: NODE_ENV === 'test' ? 'silent' : LOG_LEVEL,
    redact: { paths, censor: '[redacted]' },
    ...(NODE_ENV === 'development' ? { transport: { target: 'pino-pretty', options: { singleLine: true } } } : {}),
  });
}

export type { Logger };
