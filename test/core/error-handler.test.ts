// Unit: the mapping rules, on synthetic errors. The DB-backed file next to
// this one triggers each code with a real constraint violation.
import { describe, expect, test } from 'vitest';
import { ZodError, z } from 'zod';
import { constraintBase, findPgError, mapError } from '../../src/core/error-handler.ts';
import { ForbiddenError, RuleError } from '../../src/core/errors.ts';

const pgError = (code: string, extra: Record<string, unknown> = {}) => Object.assign(new Error('pg'), { code, severity: 'ERROR', ...extra });

describe('mapError', () => {
  test('AppError keeps its own status and code', () => {
    expect(mapError(new RuleError('RUN_LOCKED', 'The run is locked'))).toMatchObject({ status: 422, code: 'RUN_LOCKED' });
    expect(mapError(new ForbiddenError())).toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });

  test('zod errors → 422 with field paths', () => {
    const err = z.object({ name: z.string() }).safeParse({}).error as ZodError;
    const m = mapError(err)!;
    expect(m).toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
    expect(m.details).toEqual([{ path: 'name', message: expect.any(String) }]);
  });

  test('finds the Postgres error through nested causes', () => {
    const inner = pgError('23505', { constraint: 'users_mobile_key', detail: 'Key (mobile)=(+919000000001) already exists.' });
    const wrapped = new Error('outer', { cause: new Error('middle', { cause: inner }) });
    expect(findPgError(wrapped)).toBe(inner);
  });

  test('23505 → 409 DUPLICATE naming the column, never the value', () => {
    const m = mapError(pgError('23505', { constraint: 'users_mobile_key', detail: 'Key (mobile)=(+919000000001) already exists.' }))!;
    expect(m).toMatchObject({ status: 409, code: 'DUPLICATE', details: { fields: ['mobile'] } });
    expect(JSON.stringify(m)).not.toContain('9000000001');
  });

  test('23P01 → 409 OVERLAP', () => {
    expect(mapError(pgError('23P01', { constraint: 'deployments_no_overlap' }))).toMatchObject({ status: 409, code: 'OVERLAP' });
  });

  test('23514 maker-checker (with Prisma hash suffix) → 422 MAKER_CHECKER', () => {
    expect(mapError(pgError('23514', { constraint: 'pay_settings_maker_checker_49c0af58' }))).toMatchObject({
      status: 422,
      code: 'MAKER_CHECKER',
      message: 'The approver cannot be the person who made the change',
    });
  });

  test('23514 named constraints get their own message', () => {
    expect(mapError(pgError('23514', { constraint: 'cash_payouts_ack_before_paid_1cff30de' }))).toMatchObject({
      code: 'ACK_REQUIRED',
      message: 'Upload the acknowledgement photo first',
    });
    expect(mapError(pgError('23514', { constraint: 'payroll_runs_lock_not_computer_48af50b7' }))).toMatchObject({
      code: 'MAKER_CHECKER',
      message: 'The person who computed the run cannot lock it',
    });
  });

  test('23514 enum check → 422 INVALID_VALUE', () => {
    expect(mapError(pgError('23514', { constraint: 'users_role_check_51bf2c02' }))).toMatchObject({ status: 422, code: 'INVALID_VALUE' });
  });

  test('23503 → IN_USE or REFERENCE_MISSING', () => {
    expect(mapError(pgError('23503', { detail: 'Key (id)=(x) is still referenced from table "deployments".' }))).toMatchObject({ code: 'IN_USE' });
    expect(mapError(pgError('23503', { detail: 'Key (site_id)=(x) is not present in table "sites".' }))).toMatchObject({ code: 'REFERENCE_MISSING' });
  });

  test('unknown errors are not mapped (→ 500 with only the request id)', () => {
    expect(mapError(new Error('boom'))).toBeNull();
  });

  test('constraintBase strips only an 8-hex suffix', () => {
    expect(constraintBase('advances_maker_checker_49c0af58')).toBe('advances_maker_checker');
    expect(constraintBase('users_mobile_key')).toBe('users_mobile_key');
  });
});
