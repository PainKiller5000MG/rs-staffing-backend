// Worker entry: `node src/worker.ts`. Same container as the API, no HTTP.
// pg-boss keeps its queues in the same Postgres (schema "pgboss"), no Redis.
import { PgBoss } from 'pg-boss';
import { createRootContainer } from './core/container.ts';
import { Queues } from './jobs/queues.ts';

const container = createRootContainer();
const { config, logger, db } = container.cradle;

const boss = new PgBoss(config.DATABASE_URL);
boss.on('error', (err) => logger.error({ err }, 'pg-boss error'));

await boss.start();
for (const name of Object.values(Queues)) await boss.createQueue(name);

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
