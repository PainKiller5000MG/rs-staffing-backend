// The AppError hierarchy. Services and guards throw these; only
// core/error-handler.ts turns them (or anything else) into HTTP responses.
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export class AppError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: string;
  readonly details: unknown;

  constructor(status: ContentfulStatusCode, code: string, message: string, details: unknown = null) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Invalid request', details: unknown = null) {
    super(422, 'VALIDATION_FAILED', message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(entity = 'Record') {
    super(404, 'NOT_FOUND', `${entity} not found`);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Sign in to continue') {
    super(401, 'UNAUTHENTICATED', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You are not allowed to do this', code = 'FORBIDDEN') {
    super(403, code, message);
  }
}

export class ConflictError extends AppError {
  constructor(code: string, message: string, details: unknown = null) {
    super(409, code, message, details);
  }
}

/** A business rule refused the request (e.g. MAKER_CHECKER, RUN_LOCKED). */
export class RuleError extends AppError {
  constructor(code: string, message: string, details: unknown = null) {
    super(422, code, message, details);
  }
}

export const makerChecker = () =>
  new RuleError('MAKER_CHECKER', 'The approver cannot be the person who made the change');
