// Worker entry: `node src/worker.ts`. Same container as the API, no HTTP.
// pg-boss keeps its queues in the same Postgres (schema "pgboss"), no Redis.
import { PgBoss } from 'pg-boss';
import { createRootContainer } from './core/container.ts';
import { SmsDailyReport } from './jobs/sms-daily-report.ts';
import { Queues } from './jobs/queues.ts';

const container = createRootContainer();
const { config, logger, db } = container.cradle;

const boss = new PgBoss(config.DATABASE_URL);
boss.on('error', (err) => logger.error({ err }, 'pg-boss error'));

await boss.start();
for (const name of Object.values(Queues)) await boss.createQueue(name);

// 00:15 IST every day: report yesterday's OTP SMS count and cost, check the balance.
const smsReport = new SmsDailyReport(container.cradle);
await boss.work(Queues.smsDailyReport, async () => void (await smsReport.run()));
await boss.schedule(Queues.smsDailyReport, '15 0 * * *', {}, { tz: 'Asia/Kolkata' });

// Handlers register here as each job is built (src/jobs/<name>.ts), e.g.
//   await boss.work<JobPayloads['payroll-compute']>(Queues.payrollCompute, payrollCompute(container));

logger.info({ queues: Object.values(Queues) }, 'worker started');

async function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down: draining jobs');
  await boss.stop({ graceful: true, timeout: 30_000 });
  await container.dispose();
  await db.close();
  process.exit(0);
}
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
