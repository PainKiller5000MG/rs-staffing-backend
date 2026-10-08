// DB: each Postgres error code, triggered by a real constraint in the seeded
// database (npm run seed:reset), mapped by the error handler. Every attempt
// runs in a transaction that rolls back.
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { config } from '../../src/core/config.ts';
import type { Tx } from '../../src/core/context.ts';
import { mapError } from '../../src/core/error-handler.ts';
import { parseDate } from '../../src/lib/dates.ts';
import { db } from '../../src/prisma/db.ts';
import { mobileOf } from '../helpers.ts';

async function violation(fn: (tx: Tx) => Promise<unknown>): Promise<unknown> {
  try {
    await db.transaction(async (tx) => {
      await fn(tx);
      throw new Error('expected a constraint violation');
    });
  } catch (err) {
    return err;
  }
  throw new Error('unreachable');
}

let adminId: string;
let employeeId: string;
let exitedEmployeeId: string;
let otherSiteId: string;
let releaseId: string;
let unpaidWorkerId: string;

beforeAll(async () => {
  adminId = (await db.orm.app.User.where({ mobile: mobileOf('admin') as never }).first())!.id;
  employeeId = (await db.orm.app.Employee.where({ code: 'RS000001' as never }).first())!.id;
  // Exited 25 Sep: a 2031 deployment overlaps nothing, so only the FK can fail.
  exitedEmployeeId = (await db.orm.app.Employee.where({ code: 'RS000005' as never }).first())!.id;
  otherSiteId = (await db.orm.app.Site.where({ code: 'VHC-IDR' as never }).first())!.id;
  releaseId = (await db.orm.app.CashRelease.first())!.id;
  unpaidWorkerId = (await db.orm.app.DailyWorker.where({ code: 'DW00006' as never }).first())!.id;
});

afterAll(async () => {
  await db.close();
});

describe('Postgres errors → the standard error shape', () => {
  test('23505 unique → 409 DUPLICATE (users.mobile)', async () => {
    const err = await violation((tx) =>
      tx.orm.app.User.create({ name: 'Dup', mobile: mobileOf('admin'), role: 'HR', status: 'ACTIVE' } as never),
    );
    expect(mapError(err)).toMatchObject({ status: 409, code: 'DUPLICATE', details: { fields: ['mobile'] } });
  });

  test('23P01 exclusion → 409 OVERLAP (two deployments on the same days)', async () => {
    const err = await violation((tx) =>
      tx.orm.app.Deployment.create({ employeeId, siteId: otherSiteId, designation: 'Helper', effectiveFrom: parseDate('2026-09-10'), effectiveTo: null } as never),
    );
    expect(mapError(err)).toMatchObject({ status: 409, code: 'OVERLAP', details: { constraint: 'deployments_no_overlap' } });
  });

  test('23514 maker-checker → 422 MAKER_CHECKER (approver = maker)', async () => {
    const err = await violation((tx) =>
      tx.orm.app.PaySetting.create({
        scope: 'COMPANY',
        scopeId: null,
        key: 'TEST_KEY',
        value: 'x',
        effectiveFrom: parseDate('2030-01-01'),
        createdBy: adminId,
        approvedBy: adminId,
      } as never),
    );
    expect(mapError(err)).toMatchObject({ status: 422, code: 'MAKER_CHECKER', message: 'The approver cannot be the person who made the change' });
  });

  test('23514 cash_payouts_ack_before_paid → "Upload the acknowledgement photo first"', async () => {
    const err = await violation((tx) =>
      tx.orm.app.CashPayout.create({ cashReleaseId: releaseId, dailyWorkerId: unpaidWorkerId, runLineId: null, amountPaise: 50000n, status: 'PAID_VERIFIED' } as never),
    );
    expect(mapError(err)).toMatchObject({ status: 422, message: 'Upload the acknowledgement photo first' });
  });

  test('23514 payroll_runs_lock_not_computer → "The person who computed the run cannot lock it"', async () => {
    const err = await violation((tx) =>
      tx.orm.app.PayrollRun.create({
        clientId: null,
        type: 'INTERNAL',
        periodFrom: parseDate('2030-01-01'),
        periodTo: parseDate('2030-01-31'),
        status: 'LOCKED',
        computedBy: adminId,
        lockedBy: adminId,
      } as never),
    );
    expect(mapError(err)).toMatchObject({ status: 422, code: 'MAKER_CHECKER', message: 'The person who computed the run cannot lock it' });
  });

  test('23514 enum check → 422 INVALID_VALUE (role not in the value set)', async () => {
    // The ORM won't encode an unknown enum value, so this goes straight to Postgres.
    const client = new pg.Client({ connectionString: config().DATABASE_URL });
    await client.connect();
    let err: unknown;
    try {
      await client.query('BEGIN');
      await client.query(
        "INSERT INTO app.users (id, mobile, name, role, status, created_at, updated_at) VALUES (gen_random_uuid(), '+919999999990', 'x', 'BOSS', 'ACTIVE', now(), now())",
      );
    } catch (e) {
      err = e;
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
    expect(mapError(err)).toMatchObject({ status: 422, code: 'INVALID_VALUE' });
  });

  test('23503 foreign key → 409 REFERENCE_MISSING (unknown site)', async () => {
    const err = await violation((tx) =>
      tx.orm.app.Deployment.create({
        employeeId: exitedEmployeeId,
        siteId: '01900000-0000-7000-8000-000000000000',
        designation: 'Helper',
        effectiveFrom: parseDate('2031-01-01'),
        effectiveTo: null,
      } as never),
    );
    expect(mapError(err)).toMatchObject({ status: 409, code: 'REFERENCE_MISSING' });
  });
});
