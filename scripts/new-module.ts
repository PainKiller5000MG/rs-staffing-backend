// Scaffold an API module in the house pattern (see src/modules/users) so a
// session spends its effort on rules and tests, not on copying files.
//
//   npm run new-module -- clients Client
//     <name>   plural, lowercase: folder, route prefix and audit prefix (clients)
//     <Model>  the app model in src/prisma/contract.prisma (Client)
//
// Creates src/modules/<name>/{schemas,repository,service,controller,errors,module}.ts,
// test/services/<name>.service.test.ts and test/api/<name>.test.ts, and
// registers the module in src/modules/index.ts. Never overwrites a file.
// The result typechecks and serves GET /<name>/{id}; fill in the rest per story.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const [name, Model] = process.argv.slice(2);
if (!name || !Model || !/^[a-z][a-z-]*$/.test(name) || !/^[A-Z][A-Za-z]*$/.test(Model)) {
  console.error('usage: npm run new-module -- <plural-name> <Model>   e.g. clients Client');
  process.exit(1);
}
const contract = readFileSync(join(ROOT, 'src/prisma/contract.prisma'), 'utf8');
if (!new RegExp(`^\\s*model ${Model} \\{`, 'm').test(contract)) {
  console.error(`model ${Model} is not in src/prisma/contract.prisma — add it first (contract change), then rerun`);
  process.exit(1);
}

const pascal = name.replace(/(^|-)([a-z])/g, (_, __, c: string) => c.toUpperCase()); // Clients
const camel = pascal[0]!.toLowerCase() + pascal.slice(1); // clients
const entity = Model[0]!.toLowerCase() + Model.slice(1); // client
const label = Model.replace(/([a-z])([A-Z])/g, '$1 $2'); // "Pay Setting"

const files: Record<string, string> = {
  [`src/modules/${name}/${name}.schemas.ts`]: `// Request and response schemas for ${name}. They validate requests and generate openapi.json.
// Money fields: Paise / PaiseIn from src/lib/schemas.ts, named *Paise.
import { z } from '@hono/zod-openapi';

export { IdParam } from '../../lib/schemas.ts';

export const ${Model}Schema = z
  .object({
    id: z.uuid(),
  })
  .openapi('${Model}');
export type ${Model}Dto = z.infer<typeof ${Model}Schema>;
`,

  [`src/modules/${name}/${name}.repository.ts`]: `// Queries only, through the request's executor (its transaction on writes).
// Returns plain objects; no business rules here.
import type { Scalars } from '@prisma/orm-postgres/family-contract/types';
import type { Executor } from '../../core/context.ts';
import type { Models } from '../../prisma/contract.d.ts';

type ${Model}Row = Scalars<Models.app_${Model}>;

export type ${Model} = {
  id: string;
};

const to${Model} = (r: ${Model}Row): ${Model} => ({
  id: r.id,
});

export class ${pascal}Repository {
  readonly #executor: Executor;

  constructor({ executor }: { executor: Executor }) {
    this.#executor = executor;
  }

  async findById(id: string): Promise<${Model} | null> {
    const row = await this.#executor.orm.app.${Model}.first({ id: id as ${Model}Row['id'] });
    return row && to${Model}(row);
  }
}
`,

  [`src/modules/${name}/${name}.errors.ts`]: `// Business-rule errors specific to ${name} (RuleError → 422, ConflictError → 409).
// Each factory: a stable UPPER_SNAKE code + a sentence an HQ user understands.
import { RuleError } from '../../core/errors.ts';

export const ${entity}Inactive = () => new RuleError('${Model.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()}_INACTIVE', 'This ${label.toLowerCase()} is not active');
`,

  [`src/modules/${name}/${name}.service.ts`]: `// ${name} business rules (story ids in each method's comment). Throws
// AppErrors; never touches HTTP or the ORM directly. audit() on every write.
import type { Ctx } from '../../core/context.ts';
import { NotFoundError } from '../../core/errors.ts';
import type { ${pascal}Repository } from './${name}.repository.ts';

type Deps = { ${camel}Repository: ${pascal}Repository; ctx: Ctx };

export class ${pascal}Service {
  readonly #repo: ${pascal}Repository;
  readonly #ctx: Ctx;

  constructor({ ${camel}Repository, ctx }: Deps) {
    this.#repo = ${camel}Repository;
    this.#ctx = ctx;
  }

  async get(id: string) {
    const found = await this.#repo.findById(id);
    if (!found) throw new NotFoundError('${label}');
    return found;
  }
}
`,

  [`src/modules/${name}/${name}.controller.ts`]: `// HTTP only: each route declares roles, schemas and (writes) an audit tag,
// and calls one service method.
import { defineRoutes } from '../../core/routes.ts';
import { rolesWith } from '../../lib/permissions.ts';
import { IdParam, ${Model}Schema } from './${name}.schemas.ts';
import type { ${pascal}Service } from './${name}.service.ts';

// Pick the permission keys from src/lib/permissions.ts.
const READERS = rolesWith('sites.read');

export class ${pascal}Controller {
  readonly service: ${pascal}Service;

  constructor({ ${camel}Service }: { ${camel}Service: ${pascal}Service }) {
    this.service = ${camel}Service;
  }

  static readonly routes = defineRoutes<${pascal}Controller>([
    {
      method: 'get',
      path: '/${name}/{id}',
      summary: 'Get a ${label.toLowerCase()}',
      roles: READERS,
      params: IdParam,
      response: ${Model}Schema,
      handler: (c, ctx) => c.service.get(ctx.param('id')),
    },
  ]);
}
`,

  [`src/modules/${name}/${name}.module.ts`]: `import { asClass } from 'awilix';
import { Module } from '../../core/module.ts';
import { ${pascal}Controller } from './${name}.controller.ts';
import { ${pascal}Repository } from './${name}.repository.ts';
import { ${pascal}Service } from './${name}.service.ts';

export class ${pascal}Module extends Module {
  readonly name = '${name}';
  readonly providers = {
    ${camel}Repository: asClass(${pascal}Repository).scoped(),
    ${camel}Service: asClass(${pascal}Service).scoped(),
  };
  readonly controllers = [${pascal}Controller];
}
`,

  [`test/services/${name}.service.test.ts`]: `// ${name} service rules against in-memory fakes (no database).
// Add story skeletons: npm run story -- todo <ID> --out test/services/${name}.service.test.ts
import { describe, expect, test } from 'vitest';
import type { Ctx } from '../../src/core/context.ts';
import type { ${Model}, ${pascal}Repository } from '../../src/modules/${name}/${name}.repository.ts';
import { ${pascal}Service } from '../../src/modules/${name}/${name}.service.ts';

class Fake${pascal} {
  rows = new Map<string, ${Model}>();
  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
}

function make(repo = new Fake${pascal}()) {
  const ctx = { user: { id: 'u-hr', role: 'HR', siteIds: [] } } as unknown as Ctx;
  return { repo, service: new ${pascal}Service({ ${camel}Repository: repo as unknown as ${pascal}Repository, ctx }) };
}

describe('${name} service', () => {
  test('get: unknown id → NOT_FOUND', async () => {
    const { service } = make();
    await expect(service.get('missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
`,

  [`test/api/${name}.test.ts`]: `// ${name} end to end against the seeded database (npm run seed:reset).
// Add story skeletons: npm run story -- todo <ID> --out test/api/${name}.test.ts
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { db } from '../../src/prisma/db.ts';
import { mobileOf, testApp } from '../helpers.ts';

const { request, login } = testApp();
let hr: string;

beforeAll(async () => {
  hr = await login(mobileOf('hr'));
});
afterAll(() => db.close());

describe('${name} routes', () => {
  test('need a session; unknown id → 404', async () => {
    expect((await request('GET', '/${name}/00000000-0000-7000-8000-000000000000')).status).toBe(401);
    const res = await request('GET', '/${name}/00000000-0000-7000-8000-000000000000', { cookie: hr });
    expect(res).toMatchObject({ status: 404, body: { error: { code: 'NOT_FOUND' } } });
  });
});
`,
};

for (const [rel, src] of Object.entries(files)) {
  const p = join(ROOT, rel);
  if (existsSync(p)) {
    console.log(`skip ${rel} (exists)`);
    continue;
  }
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, src);
  console.log(`new  ${rel}`);
}

const indexPath = join(ROOT, 'src/modules/index.ts');
let index = readFileSync(indexPath, 'utf8');
if (!index.includes(`${pascal}Module`)) {
  index = index.replace(
    /(\nexport const modules)/,
    `import { ${pascal}Module } from './${name}/${name}.module.ts';\n$1`,
  );
  index = index.replace(/\];\s*$/, `, new ${pascal}Module()];\n`);
  writeFileSync(indexPath, index);
  console.log(`edit src/modules/index.ts (registered ${pascal}Module)`);
}
console.log(`\nNext: npm run story -- show <IDs>; npm run story -- todo <ID> --out test/api/${name}.test.ts`);
