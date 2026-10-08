// The ONLY place errors become HTTP responses. Every error leaves as
//   { "error": { "code", "message", "details", "requestId" } }
// and never carries a stack trace, SQL, or personal data.
import { APIError } from 'better-auth/api';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ZodError } from 'zod';
import { AppError } from './errors.ts';
import type { Logger } from './logger.ts';

export type ErrorBody = {
  error: { code: string; message: string; details: unknown; requestId: string };
};

type Mapped = { status: ContentfulStatusCode; code: string; message: string; details?: unknown };

/** A Postgres error as node-postgres reports it. */
type PgError = { code: string; constraint?: string; detail?: string; table?: string; column?: string };

/** Check constraints by name (without Prisma's `_<8 hex>` suffix) → what the user is told. */
const CHECK_MESSAGES: Record<string, { code: string; message: string }> = {
  cash_payouts_ack_before_paid: { code: 'ACK_REQUIRED', message: 'Upload the acknowledgement photo first' },
  payroll_runs_lock_not_computer: {
    code: 'MAKER_CHECKER',
    message: 'The person who computed the run cannot lock it',
  },
};

const MAKER_CHECKER = { code: 'MAKER_CHECKER', message: 'The approver cannot be the person who made the change' };

/** Prisma 8 names constraints `<name>_<8 hex digits>`; unique keys keep their plain name. */
export const constraintBase = (name: string) => name.replace(/_[0-9a-f]{8}$/, '');

/** Walks `.cause` (and a few wrapper fields) until it finds the Postgres error. */
export function findPgError(err: unknown, depth = 0): PgError | null {
  if (!err || typeof err !== 'object' || depth > 8) return null;
  const e = err as Record<string, unknown>;
  if (typeof e['code'] === 'string' && /^[0-9A-Z]{5}$/.test(e['code']) && ('severity' in e || 'constraint' in e)) {
    return e as unknown as PgError;
  }
  for (const key of ['cause', 'originalError', 'error', 'driverError']) {
    const found = findPgError(e[key], depth + 1);
    if (found) return found;
  }
  return null;
}

/** "Key (mobile)=(+919…) already exists." → ["mobile"]. The values are dropped. */
function keyColumns(detail: string | undefined): string[] {
  const m = detail && /Key \(([^)]+)\)=/.exec(detail);
  return m?.[1] ? m[1].split(',').map((s) => s.trim()) : [];
}

function mapPgError(pg: PgError): Mapped | null {
  const constraint = pg.constraint ? constraintBase(pg.constraint) : undefined;
  switch (pg.code) {
    case '23505': {
      const fields = keyColumns(pg.detail);
      const field = fields.join(', ') || constraint || 'value';
      return {
        status: 409,
        code: 'DUPLICATE',
        message: `A record with this ${field} already exists`,
        details: { fields, constraint },
      };
    }
    case '23P01':
      return {
        status: 409,
        code: 'OVERLAP',
        message: 'The dates overlap an existing record',
        details: { constraint },
      };
    case '23514': {
      if (constraint && CHECK_MESSAGES[constraint]) return { status: 422, ...CHECK_MESSAGES[constraint], details: { constraint } };
      if (constraint?.endsWith('_maker_checker')) return { status: 422, ...MAKER_CHECKER, details: { constraint } };
      if (constraint?.endsWith('_check')) {
        return { status: 422, code: 'INVALID_VALUE', message: 'A value is not one of the allowed options', details: { constraint } };
      }
      return { status: 422, code: 'RULE_VIOLATED', message: 'The change breaks a data rule', details: { constraint } };
    }
    case '23503': {
      const inUse = pg.detail?.includes('is still referenced');
      return inUse
        ? { status: 409, code: 'IN_USE', message: 'This record is still in use', details: { constraint } }
        : { status: 409, code: 'REFERENCE_MISSING', message: 'A linked record does not exist', details: { constraint } };
    }
    case '23502':
      return {
        status: 422,
        code: 'VALIDATION_FAILED',
        message: 'A required value is missing',
        details: pg.column ? [{ path: pg.column, message: 'Required' }] : null,
      };
    default:
      return null;
  }
}

function zodDetails(err: ZodError) {
  return err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}

export function mapError(err: unknown): Mapped | null {
  if (err instanceof AppError) return { status: err.status, code: err.code, message: err.message, details: err.details };
  if (err instanceof ZodError) {
    return { status: 422, code: 'VALIDATION_FAILED', message: 'Invalid request', details: zodDetails(err) };
  }
  if (err instanceof APIError) {
    const status = err.statusCode === 429 ? 429 : 401;
    return {
      status,
      code: status === 429 ? 'RATE_LIMITED' : 'UNAUTHENTICATED',
      message: status === 429 ? 'Too many attempts, try again later' : 'Sign in to continue',
    };
  }
  if (err instanceof HTTPException) return { status: err.status, code: 'HTTP_ERROR', message: err.message };
  const pg = findPgError(err);
  return pg ? mapPgError(pg) : null;
}

export function errorBody(c: Context, m: Mapped): ErrorBody {
  return { error: { code: m.code, message: m.message, details: m.details ?? null, requestId: c.get('requestId') } };
}

export function createErrorHandler(logger: Logger) {
  return (err: Error, c: Context) => {
    const requestId = c.get('requestId');
    const mapped = mapError(err);
    if (mapped) {
      if (mapped.status >= 500) logger.error({ err, requestId }, 'request failed');
      else logger.info({ requestId, code: mapped.code, status: mapped.status }, 'request refused');
      return c.json(errorBody(c, mapped), mapped.status);
    }
    logger.error({ err, requestId }, 'unhandled error');
    return c.json(errorBody(c, { status: 500, code: 'INTERNAL', message: 'Something went wrong' }), 500);
  };
}

export function notFoundHandler(c: Context) {
  return c.json(errorBody(c, { status: 404, code: 'NOT_FOUND', message: 'Route not found' }), 404);
}

/** OpenAPIHono defaultHook: request validation failures → 422 VALIDATION_FAILED. */
export function validationHook(result: { success: boolean; error?: unknown }, c: Context) {
  if (!result.success && result.error instanceof ZodError) {
    return c.json(
      errorBody(c, { status: 422, code: 'VALIDATION_FAILED', message: 'Invalid request', details: zodDetails(result.error) }),
      422,
    );
  }
}
