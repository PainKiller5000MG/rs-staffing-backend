// Writes openapi.json from the route definitions. Runs on every build; CI
// fails if the committed file differs, and releases attach it as an asset.
import { writeFileSync } from 'node:fs';
import { createApp, openApiInfo } from '../src/core/app.ts';
import { createRootContainer } from '../src/core/container.ts';
import { modules } from '../src/modules/index.ts';

// Better Auth is stubbed: generating the spec must not touch the database.
const container = createRootContainer({ auth: {} });
const app = createApp({ modules, container });
const doc = app.getOpenAPI31Document(openApiInfo);
writeFileSync(new URL('../openapi.json', import.meta.url), `${JSON.stringify(doc, null, 2)}\n`);
console.log('wrote openapi.json');
await container.dispose();
await container.cradle.db.close();
