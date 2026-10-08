// Prisma 8 runtime client — one instance for the whole process. Servers never
// close it; short scripts call `await db.close()` so Node can exit.
//
// Node < 26.8.2 has no global Temporal, which the Date / Timestamptz codecs
// need, so the polyfill must load before the first query.
import 'temporal-polyfill/full/global';
import postgres from '@prisma/orm-postgres/runtime';
import { databaseUrl } from './env.ts';
import type { Contract } from './contract.d.ts';
import contractJson from './contract.json' with { type: 'json' };

export { databaseUrl };

export const db = postgres<Contract>({
  contractJson,
  url: databaseUrl,
});
