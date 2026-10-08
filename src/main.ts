// API entry: `node src/main.ts`. Config is validated first; an invalid
// environment stops the process before anything listens.
import { serve } from '@hono/node-server';
import { createApp } from './core/app.ts';
import { createRootContainer } from './core/container.ts';
import { modules } from './modules/index.ts';

const container = createRootContainer();
const { config, logger, db } = container.cradle;
const app = createApp({ modules, container });

const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  logger.info(`api listening on http://localhost:${info.port}`);
});

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'shutting down: draining requests');
  server.close(async () => {
    await container.dispose();
    await db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 30_000).unref();
}
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
