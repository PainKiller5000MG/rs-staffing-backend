// Zod schemas: they validate requests and generate openapi.json.
import { z } from '@hono/zod-openapi';
import { CursorQuery, IsoDate, listOf } from '../../lib/schemas.ts';

export const Level = z.enum(['NATIONAL', 'STATE', 'CLIENT', 'SITE']).openapi('HolidayLevel');
export const HolidayType = z.enum(['FIXED', 'OPTIONAL']).openapi('HolidayType');

const Name = z.string().trim().min(1, 'Required').max(120);
const YearField = z.number().int().min(2000).max(2100);

const STATE_CODE = /^[A-Z]{2,4}$/;

/** Level/key rules shared by the create body and import rows. */
function levelKey(v: { level: z.infer<typeof Level>; scopeKey?: string | null }, ctx: z.RefinementCtx) {
  const key = v.scopeKey ?? null;
  if (v.level === 'NATIONAL') {
    if (key !== null) ctx.addIssue({ code: 'custom', path: ['scopeKey'], message: 'A national holiday has no level key' });
    return;
  }
  if (key === null) ctx.addIssue({ code: 'custom', path: ['scopeKey'], message: 'Required for this level' });
  else if (v.level === 'STATE' && !STATE_CODE.test(key)) ctx.addIssue({ code: 'custom', path: ['scopeKey'], message: 'Use the state code, e.g. MH' });
  else if ((v.level === 'CLIENT' || v.level === 'SITE') && !z.uuid().safeParse(key).success) ctx.addIssue({ code: 'custom', path: ['scopeKey'], message: 'Use the client or site id' });
}

/** M14-HOL-01 AC1 (+ half-day, P1). The date must fall in the year when one is given. */
export const CreateHolidayBody = z
  .object({
    date: IsoDate,
    year: YearField.optional().openapi({ description: 'Defaults to the date’s year; when given, the date must fall in it' }),
    name: Name,
    level: Level,
    scopeKey: z.string().trim().min(1).max(40).nullish().openapi({ description: 'State code (STATE), client id (CLIENT) or site id (SITE); omit for NATIONAL' }),
    paid: z.boolean().default(true),
    type: HolidayType.default('FIXED'),
    half: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    levelKey(v, ctx);
    if (v.year !== undefined && Number(v.date.slice(0, 4)) !== v.year) ctx.addIssue({ code: 'custom', path: ['date'], message: `The date must fall in ${v.year}` });
    if (v.level === 'NATIONAL' && (!v.paid || v.type !== 'FIXED' || v.half)) ctx.addIssue({ code: 'custom', path: ['paid'], message: 'A national holiday is always paid and fixed' });
  })
  .openapi('CreateHolidayBody');
export type CreateHolidayBody = z.infer<typeof CreateHolidayBody>;

/** The date and level never change: remove the row and add a new one. */
export const UpdateHolidayBody = z
  .object({ name: Name.optional(), paid: z.boolean().optional(), type: HolidayType.optional(), half: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to change' })
  .openapi('UpdateHolidayBody');
export type UpdateHolidayBody = z.infer<typeof UpdateHolidayBody>;

export const HolidaySchema = z
  .object({
    id: z.uuid(),
    date: IsoDate,
    year: z.number().int(),
    name: z.string(),
    level: Level,
    scopeKey: z.string().nullable(),
    paid: z.boolean(),
    type: HolidayType,
    half: z.boolean(),
  })
  .openapi('Holiday');
export const HolidayListSchema = listOf(HolidaySchema, 'HolidayList');

export const ListHolidaysQuery = CursorQuery.extend({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  level: Level.optional(),
  key: z.string().trim().min(1).max(40).optional().openapi({ description: 'State code, client id or site id' }),
});
export type ListHolidaysQuery = z.infer<typeof ListHolidaysQuery>;

export const HolidayIdParam = z.object({ id: z.uuid().openapi({ param: { name: 'id', in: 'path' } }) });

// --- client replacements (M14-HOL-02) ------------------------------------------

export const CreateReplacementBody = z
  .object({ clientId: z.uuid(), holidayId: z.uuid().openapi({ description: 'The state holiday the client swaps' }), replacementDate: IsoDate })
  .openapi('CreateHolidayReplacementBody');
export type CreateReplacementBody = z.infer<typeof CreateReplacementBody>;

export const ReplacementSchema = z
  .object({ id: z.uuid(), clientId: z.uuid(), holidayId: z.uuid(), replacementDate: IsoDate, status: z.literal('REPLACED') })
  .openapi('HolidayReplacement');
export const ReplacementListSchema = listOf(ReplacementSchema, 'HolidayReplacementList');
export const ListReplacementsQuery = CursorQuery.extend({ clientId: z.uuid().optional() });
export type ListReplacementsQuery = z.infer<typeof ListReplacementsQuery>;

// --- merged site calendar (M14-HOL-03) -------------------------------------------

export const SiteIdParam = z.object({ siteId: z.uuid().openapi({ param: { name: 'siteId', in: 'path' } }) });
export const SiteHolidaysQuery = z.object({ year: z.coerce.number().int().min(2000).max(2100).openapi({ description: 'Calendar year' }) });
export type SiteHolidaysQuery = z.infer<typeof SiteHolidaysQuery>;

export const SiteHolidaysSchema = z
  .object({
    siteId: z.uuid(),
    year: z.number().int(),
    items: z.array(
      z.object({
        date: IsoDate,
        name: z.string(),
        levels: z.array(Level),
        half: z.boolean(),
        replacesDate: IsoDate.nullable(),
      }),
    ),
  })
  .openapi('SiteHolidays');

// --- impact preview (M14-HOL-05) -------------------------------------------------

export const ImpactBody = z
  .discriminatedUnion('action', [
    z.object({ action: z.literal('ADD'), holiday: CreateHolidayBody }),
    z.object({ action: z.literal('REMOVE'), holidayId: z.uuid() }),
    z.object({ action: z.literal('REPLACE'), replacement: CreateReplacementBody }),
    z.object({ action: z.literal('UNREPLACE'), replacementId: z.uuid() }),
  ])
  .openapi('HolidayImpactBody');
export type ImpactBody = z.infer<typeof ImpactBody>;

const RunSchema = z.object({ id: z.uuid(), clientId: z.uuid().nullable(), type: z.string(), status: z.string(), periodFrom: IsoDate, periodTo: IsoDate });
export const ImpactSchema = z
  .object({
    dates: z.array(IsoDate),
    sites: z.number().int(),
    employees: z.number().int(),
    leaveRequests: z.number().int(),
    computedRuns: z.number().int().openapi({ description: 'Computed or checked runs that would be flagged "inputs changed"' }),
    lockedRuns: z.array(RunSchema),
    blocked: z.boolean().openapi({ description: 'true when a locked month is touched: the change would be refused (use an adjustment run)' }),
  })
  .openapi('HolidayImpact');

// --- Excel import (M14-HOL-04) ---------------------------------------------------

/** One spreadsheet row: the level key is the state code, client code or site code by level. */
export const ImportHolidayRow = z
  .object({
    date: IsoDate,
    name: Name,
    level: Level,
    stateCode: z.string().trim().toUpperCase().regex(STATE_CODE).nullish(),
    clientCode: z.string().trim().min(1).max(30).nullish(),
    siteCode: z.string().trim().min(1).max(30).nullish(),
    paid: z.boolean().default(true),
    type: HolidayType.default('FIXED'),
    half: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    const key = { NATIONAL: null, STATE: v.stateCode, CLIENT: v.clientCode, SITE: v.siteCode }[v.level];
    const field = { NATIONAL: 'level', STATE: 'stateCode', CLIENT: 'clientCode', SITE: 'siteCode' }[v.level];
    if (v.level !== 'NATIONAL' && !key) ctx.addIssue({ code: 'custom', path: [field], message: 'Required for this level' });
    if (v.level === 'NATIONAL' && (v.stateCode || v.clientCode || v.siteCode)) ctx.addIssue({ code: 'custom', path: ['level'], message: 'A national holiday has no state, client or site code' });
    if (v.level === 'NATIONAL' && (!v.paid || v.type !== 'FIXED' || v.half)) ctx.addIssue({ code: 'custom', path: ['paid'], message: 'A national holiday is always paid and fixed' });
  });
export type ImportHolidayRow = z.infer<typeof ImportHolidayRow>;

export const ImportHolidaysBody = z
  .object({
    year: YearField,
    preview: z.boolean().default(false).openapi({ description: 'true: check every row and report, save nothing' }),
    rows: z.array(z.record(z.string(), z.unknown())).min(1).max(2000).openapi({ description: 'One object per holiday: date, name, level, stateCode / clientCode / siteCode, paid, type' }),
  })
  .openapi('ImportHolidaysBody');
export type ImportHolidaysBody = z.infer<typeof ImportHolidaysBody>;

export const ImportHolidaysResult = z
  .object({
    preview: z.boolean(),
    year: z.number().int(),
    created: z.number().int(),
    rejected: z.number().int(),
    results: z.array(
      z.object({
        row: z.number().int().openapi({ description: '1-based position in the request' }),
        status: z.enum(['OK', 'CREATED', 'REJECTED']),
        id: z.uuid().nullable(),
        errors: z.array(z.object({ path: z.string(), message: z.string() })),
      }),
    ),
  })
  .openapi('ImportHolidaysResult');
