// End-to-end check against the database in DATABASE_URL: reads through
// relations, then writes a row inside a transaction that is rolled back,
// so the script can be re-run without leaving data behind.
import { db } from '../src/prisma/db.ts';
import type { Models } from '../src/prisma/contract.d.ts';

type DailyWorker = Models.app_DailyWorker;

class Rollback extends Error {}

try {
  const site = await db.orm.app.Site.include('client').first();
  console.log('site via ORM:', site?.code, '->', site?.client?.name);

  const emp = await db.orm.app.Employee.include('deployments').first();
  console.log('employee', emp?.code, 'dob', String(emp?.dob), 'deployments', emp?.deployments?.length);

  await db.transaction(async (tx) => {
    const w = await tx.orm.app.DailyWorker.create({
      code: 'DW-SMOKE' as DailyWorker['code'],
      name: 'Ramesh' as DailyWorker['name'],
      paymentMode: 'CASH',
      blocklisted: false,
    });
    console.log('created daily worker id (uuid v7):', w.id, 'createdAt:', String(w.createdAt));
    throw new Rollback();
  }).catch((err) => {
    if (!(err instanceof Rollback)) throw err;
    console.log('write rolled back');
  });
} finally {
  await db.close();
}
