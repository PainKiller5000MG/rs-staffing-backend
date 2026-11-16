// M16-SMS-02: MSG91 delivery reports — caller verification and idempotency.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { parseDate } from '../../src/lib/dates.ts';
import { db } from '../../src/prisma/db.ts';
import { testApp } from '../helpers.ts';

const SECRET = 'test-webhook-secret-0123456789';
const { request } = testApp();
const requestId = `req-${randomUUID()}`;
const mobile = '+919000000006';
let deliveryId: string;

beforeAll(async () => {
  const employee = (await db.orm.app.Employee.where({ code: 'RS000001' as never }).first())!;
  const run = await db.orm.app.PayrollRun.create({
    clientId: null,
    type: 'INTERNAL',
    periodFrom: parseDate('2026-09-01'),
    periodTo: parseDate('2026-09-30'),
    status: 'PUBLISHED',
    version: Math.floor(Math.random() * 1e6) + 2,
  } as never);
  const line = await db.orm.app.RunLine.create({
    runId: run.id, employeeId: employee.id, siteId: null,
    paidDays: '30.0', lopDays: '0.0', otHours: '0.00',
    grossPaise: 1500000n, deductionsPaise: 101300n, netPaise: 1398700n, employerCostPaise: 1646400n,
    pfWagesPaise: 750000n, epsWagesPaise: 750000n, edliWagesPaise: 750000n, esiGrossPaise: 1500000n,
    lineHash: 'a'.repeat(64), snapshot: {}, status: 'OK',
  } as never);
  const doc = await db.orm.app.PayslipDocument.create({ runLineId: line.id, version: 1, template: 'DEPLOYED', lineHash: 'a'.repeat(64), status: 'ACTIVE' } as never);
  const batch = await db.orm.app.DeliveryBatch.create({ runId: run.id, kind: 'PUBLISH' } as never);
  const delivery = await db.orm.app.Delivery.create({ batchId: batch.id, documentId: doc.id, channel: 'SMS', toMobile: mobile, providerMsgId: requestId, status: 'SUBMITTED' } as never);
  deliveryId = delivery.id;
});
afterAll(() => db.close());

const dlr = (body: unknown, secret: string | null = SECRET) =>
  request('POST', '/webhooks/msg91/dlr', { body, headers: secret ? { 'x-rs-webhook-secret': secret } : {} });
const statusOf = async () => (await db.orm.app.Delivery.first({ id: deliveryId as never }))!;
const auditRows = async () => (await db.orm.audit.AuditLog.where({ entity: 'delivery' as never, entityId: deliveryId as never }).all()).length;

describe('MSG91 delivery reports', () => {
  test('an unknown caller is refused', async () => {
    expect((await dlr({ requestId, telNum: '919000000006', status: '1' }, null)).status).toBe(401);
    expect((await dlr({ requestId, telNum: '919000000006', status: '1' }, 'wrong-secret-wrong-secret')).status).toBe(401);
    expect((await statusOf()).status).toBe('SUBMITTED');
  });

  test('M1-OTP-08 AC1: a delivered report updates the delivery once; a replay changes nothing', async () => {
    const event = { requestId, telNum: '919000000006', status: '1', eventName: 'delivered' };
    expect(await dlr(event)).toMatchObject({ status: 200, body: { received: 1, updated: 1, unmatched: 0 } });
    const after = await statusOf();
    expect(after.status).toBe('DELIVERED');
    expect(after.deliveredAt).not.toBeNull();
    const audits = await auditRows();

    expect(await dlr(event)).toMatchObject({ status: 200, body: { updated: 0 } });
    expect(await auditRows()).toBe(audits);
  });

  test('a late failure report never undoes a delivery', async () => {
    await dlr({ requestId, telNum: '919000000006', status: '2', failureReason: 'Template Id not found on DLT' });
    expect((await statusOf()).status).toBe('DELIVERED');
  });

  test('reports for unknown messages are acknowledged (so MSG91 stops retrying) and counted', async () => {
    expect(await dlr([{ requestId: 'nope', telNum: '919999999999', status: '1' }])).toMatchObject({ status: 200, body: { received: 1, unmatched: 1 } });
  });
});
