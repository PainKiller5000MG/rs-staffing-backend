// Loads packages/db/.env by path, so DATABASE_URL resolves no matter which
// app (api, worker, scripts) is the current working directory. Variables
// already set in the environment win, so deployed platforms need no file.
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

export const databaseUrl = process.env['DATABASE_URL'];
