// Request and response schemas for attendance layouts (M2-SET-05).
import { z } from '@hono/zod-openapi';
import { CursorQuery, listOf } from '../../lib/schemas.ts';

export const ClientIdParam = z.object({ clientId: z.uuid().openapi({ param: { name: 'clientId', in: 'path' } }) });
export const LayoutKeyParam = z.object({ layoutKey: z.uuid().openapi({ param: { name: 'layoutKey', in: 'path' } }) });
export const LayoutVersionParam = LayoutKeyParam.extend({ version: z.coerce.number().int().min(1).openapi({ param: { name: 'version', in: 'path' } }) });

const text = (max: number) => z.string().trim().min(1).max(max);
/** A column letter ("C") or the header text above it. */
const Col = text(60);
const DayCodeSchema = z.enum(['P', 'A', 'HD', 'WO', 'WOP', 'PH', 'PHP', 'EL', 'CL', 'SL']).openapi('DayCode');

export const LayoutDefinition = z
  .object({
    sheet: text(100).openapi({ description: 'Sheet name in the workbook' }),
    layoutType: z.enum(['DAY_COLUMNS', 'DATE_COLUMNS', 'DATE_STATUS_ROWS']).openapi({
      description: 'DAY_COLUMNS: columns 1..31. DATE_COLUMNS: one dated column per day. DATE_STATUS_ROWS: one row per worker per date.',
    }),
    headerRow: z.number().int().min(1).max(1000),
    identityColumns: z
      .object({ employeeCode: Col.optional(), name: Col.optional(), mobile: Col.optional(), siteCode: Col.optional(), designation: Col.optional() })
      .refine((c) => c.employeeCode !== undefined || c.name !== undefined, 'Name the employee code or the name column'),
    dayColumns: z.object({ from: Col, to: Col }).optional().openapi({ description: 'First and last day/date column (DAY_COLUMNS, DATE_COLUMNS)' }),
    dateColumn: Col.optional().openapi({ description: 'DATE_STATUS_ROWS only' }),
    statusColumn: Col.optional().openapi({ description: 'DATE_STATUS_ROWS only' }),
    statusMap: z
      .record(z.string().trim().min(1).max(10).transform((k) => k.toUpperCase()), DayCodeSchema)
      .refine((m) => Object.keys(m).length > 0, 'Map at least one status code')
      .openapi({ description: 'The client\'s code → our code, e.g. {"P":"P","A":"A","H":"HD","OFF":"WO"}' }),
    otColumns: z.array(Col).max(3).default([]),
  })
  .superRefine((d, ctx) => {
    const rows = d.layoutType === 'DATE_STATUS_ROWS';
    if (rows) {
      for (const f of ['dateColumn', 'statusColumn'] as const) if (!d[f]) ctx.addIssue({ code: 'custom', path: [f], message: 'Required for DATE_STATUS_ROWS' });
    } else if (!d.dayColumns) ctx.addIssue({ code: 'custom', path: ['dayColumns'], message: `Required for ${d.layoutType}` });
  })
  .openapi('LayoutDefinition');
export type LayoutDefinition = z.infer<typeof LayoutDefinition>;

const layoutShape = {
  name: text(120),
  siteId: z.uuid().nullish().openapi({ description: 'Set when this sheet is one site\'s own' }),
  definition: LayoutDefinition,
  headerFingerprint: text(128).openapi({ description: 'Fingerprint of the header cells, to recognise next month\'s file' }),
};
export const CreateLayoutBody = z.object(layoutShape).openapi('CreateLayoutBody');
export type CreateLayoutBody = z.infer<typeof CreateLayoutBody>;
export const NewVersionBody = z
  .object({ ...layoutShape, siteId: layoutShape.siteId })
  .partial({ name: true, siteId: true })
  .openapi('NewLayoutVersionBody');
export type NewVersionBody = z.infer<typeof NewVersionBody>;

export const ListLayoutsQuery = CursorQuery.extend({ siteId: z.uuid().optional() });
export type ListLayoutsQuery = z.infer<typeof ListLayoutsQuery>;

export const LayoutSchema = z
  .object({
    id: z.uuid().openapi({ description: 'This version; imports reference it' }),
    layoutKey: z.uuid(),
    version: z.number().int(),
    clientId: z.uuid(),
    siteId: z.uuid().nullable(),
    name: z.string(),
    definition: LayoutDefinition,
    headerFingerprint: z.string(),
    confirmedBy: z.uuid().nullable(),
    confirmedAt: z.string().nullable(),
    createdAt: z.string(),
    isLatest: z.boolean(),
  })
  .openapi('AttendanceLayout');
export const LayoutListSchema = listOf(LayoutSchema, 'AttendanceLayoutList');
export const LayoutVersionsSchema = z.object({ items: z.array(LayoutSchema) }).openapi('AttendanceLayoutVersions');
