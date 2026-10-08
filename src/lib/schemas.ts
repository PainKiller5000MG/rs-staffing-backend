// Shared zod building blocks for route schemas.
import { z } from '@hono/zod-openapi';
import { parseDate } from './dates.ts';

/**
 * Money on the wire: a string of integer paise ("1655000" = ₹16,550.00).
 * Every money field in every schema is this type and its name ends in "Paise"
 * (test/api/openapi-money.test.ts enforces both across openapi.json).
 */
export const Paise = z
  .string()
  .regex(/^-?\d+$/, 'expected an integer number of paise')
  .openapi('Paise', { description: 'Integer paise as a string: "1655000" is ₹16,550.00', example: '1655000' });

/** Request input: Paise → bigint. */
export const PaiseIn = Paise.transform((s) => BigInt(s));

/** Response output: bigint → Paise string. */
export const paise = (p: bigint): string => p.toString();

/** Percent rate as a decimal string, Numeric(7,4): "12", "8.33", "0.7500". */
export const Rate = z.string().regex(/^\d{1,3}(\.\d{1,4})?$/, 'expected a percent with up to 4 decimals').openapi({ example: '12' });

export const IsoDate = z.iso.date().openapi({ example: '2026-09-15' });
export const PlainDateIn = IsoDate.transform(parseDate);

export const Uuid = z.uuid();

export const CursorQuery = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const IdParam = z.object({ id: z.uuid().openapi({ param: { name: 'id', in: 'path' } }) });

/** `{ items, nextCursor }` for a list of `item`. */
export const listOf = <T extends z.ZodType>(item: T, name: string) =>
  z.object({ items: z.array(item), nextCursor: z.uuid().nullable() }).openapi(name);
