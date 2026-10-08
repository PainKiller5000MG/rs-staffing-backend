// Answer 3 (9 Oct): every money field in openapi.json is a string of integer
// paise (the shared Paise schema), and every money field is named *Paise.
import { expect, test } from 'vitest';
import { createApp, openApiInfo } from '../../src/core/app.ts';
import { createRootContainer } from '../../src/core/container.ts';
import { modules } from '../../src/modules/index.ts';

/** Names that contain a money word but aren't amounts. */
const NOT_MONEY = /(Zone|Code|Days|Hours|Count|Id|At|Rate|Months?|Method|Mode|Status)$/;
const MONEYISH = /(amount|gross|net(?!work)|wage|salary|balance|cost|price|fine|total(?!s$|_?count))/i;

type Schema = { $ref?: string; type?: string; pattern?: string; properties?: Record<string, Schema>; items?: Schema; allOf?: Schema[]; anyOf?: Schema[]; oneOf?: Schema[] };

function* fields(schema: Schema | undefined, path: string): Generator<[string, string, Schema]> {
  if (!schema) return;
  for (const [name, prop] of Object.entries(schema.properties ?? {})) {
    yield [`${path}.${name}`, name, prop];
    yield* fields(prop, `${path}.${name}`);
  }
  yield* fields(schema.items, `${path}[]`);
  for (const s of [...(schema.allOf ?? []), ...(schema.anyOf ?? []), ...(schema.oneOf ?? [])]) yield* fields(s, path);
}

const isPaise = (s: Schema) =>
  s.$ref === '#/components/schemas/Paise' ||
  (s.anyOf ?? s.oneOf ?? []).some((x) => x.$ref === '#/components/schemas/Paise') ||
  (s.type === 'string' && s.pattern === '^-?\\d+$');

test('money fields are Paise strings and named *Paise', () => {
  const app = createApp({ modules, container: createRootContainer({ auth: {} }) });
  const doc = app.getOpenAPI31Document(openApiInfo) as { components?: { schemas?: Record<string, Schema> } };
  const problems: string[] = [];
  for (const [schemaName, schema] of Object.entries(doc.components?.schemas ?? {})) {
    for (const [path, name, prop] of fields(schema, schemaName)) {
      if (/Paise$/.test(name) && !isPaise(prop)) problems.push(`${path}: named *Paise but not a Paise string`);
      if (!/Paise$/.test(name) && MONEYISH.test(name) && !NOT_MONEY.test(name) && !['object', 'array', 'boolean'].includes(prop.type ?? '') && !prop.properties) {
        problems.push(`${path}: looks like money; name it *Paise and use the Paise schema`);
      }
    }
  }
  expect(problems).toEqual([]);
});
