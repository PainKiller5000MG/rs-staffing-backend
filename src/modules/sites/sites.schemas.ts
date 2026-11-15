// Request and response schemas for sites. They validate requests and generate openapi.json.
import { z } from '@hono/zod-openapi';
import { CursorQuery, IsoDate, listOf } from '../../lib/schemas.ts';

export const SiteIdParam = z.object({ siteId: z.uuid().openapi({ param: { name: 'siteId', in: 'path' } }) });

export const StatusSchema = z.enum(['ACTIVE', 'INACTIVE']).openapi('RecordStatus');
export const WageSphereSchema = z.enum(['CENTRAL', 'STATE']).openapi('WageSphere');

const text = (max: number) => z.string().trim().min(1).max(max);

export const SiteCode = z
  .string()
  .regex(/^[A-Z0-9][A-Z0-9-]{2,29}$/, 'Use 3–30 uppercase letters, digits or hyphens, e.g. NTX-BPL')
  .openapi({ example: 'NTX-BPL' });

const Time = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'Use 24-hour HH:MM').openapi({ example: '06:00' });

const fields = {
  name: text(200),
  stateCode: z.string().regex(/^[A-Z]{2,4}$/, 'Use the state code, e.g. MP'),
  district: text(80),
  pincode: z.string().regex(/^[1-9][0-9]{5}$/, 'Enter a 6-digit PIN code').openapi({ example: '462023' }),
  address: text(500),
  minWageZone: text(20).openapi({ description: 'Zone/area as in the state notification, e.g. "A" or "Zone II"' }),
  sphere: WageSphereSchema,
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  inchargeName: text(120),
  inchargePhone: z.string().trim().regex(/^\+?[0-9][0-9 -]{5,18}$/, 'Enter a phone number'),
  shiftStart: Time,
  shiftEnd: Time,
};

type LatLng = { lat?: number | null; lng?: number | null };
function latLngTogether(b: LatLng, ctx: z.RefinementCtx) {
  if ((b.lat == null) !== (b.lng == null)) ctx.addIssue({ code: 'custom', path: [b.lat == null ? 'lat' : 'lng'], message: 'Give both latitude and longitude, or neither' });
}

const createShape = {
  code: SiteCode,
  name: fields.name,
  stateCode: fields.stateCode,
  district: fields.district,
  pincode: fields.pincode,
  address: fields.address.nullish(),
  minWageZone: fields.minWageZone.nullish(),
  sphere: fields.sphere.nullish(),
  lat: fields.lat.nullish(),
  lng: fields.lng.nullish(),
  inchargeName: fields.inchargeName.nullish(),
  inchargePhone: fields.inchargePhone.nullish(),
  shiftStart: fields.shiftStart.nullish(),
  shiftEnd: fields.shiftEnd.nullish(),
};

export const CreateSiteBody = z
  .object({ clientId: z.uuid(), ...createShape })
  .superRefine(latLngTogether)
  .openapi('CreateSiteBody');
export type CreateSiteBody = z.infer<typeof CreateSiteBody>;

/** M2-SIT-08 AC1: one object per spreadsheet row (client by short code). */
export const ImportSiteRow = z
  .object({
    clientCode: z.string().trim().min(1),
    ...createShape,
    primarySupervisorEmployeeCode: z.string().trim().min(1).max(12).nullish(),
  })
  .superRefine(latLngTogether);
export type ImportSiteRow = z.infer<typeof ImportSiteRow>;

export const ImportSitesBody = z
  .object({
    rows: z.array(z.record(z.string(), z.unknown())).min(1).max(1000).openapi({
      description: 'One object per site: clientCode, code, name, stateCode, district, pincode, minWageZone, address, lat, lng, primarySupervisorEmployeeCode',
    }),
  })
  .openapi('ImportSitesBody');
export type ImportSitesBody = z.infer<typeof ImportSitesBody>;

export const ImportResultSchema = z
  .object({
    created: z.number().int(),
    rejected: z.number().int(),
    results: z.array(
      z.object({
        row: z.number().int().openapi({ description: '1-based position in the request' }),
        status: z.enum(['CREATED', 'REJECTED']),
        id: z.uuid().nullable(),
        errors: z.array(z.object({ path: z.string(), message: z.string() })),
      }),
    ),
  })
  .openapi('ImportSitesResult');

/** Every field optional; null clears an optional field. The code and client never change. */
export const UpdateSiteBody = z
  .object({
    name: fields.name.optional(),
    stateCode: fields.stateCode.optional().openapi({ description: 'Refused once payroll has run for the site' }),
    district: fields.district.optional(),
    pincode: fields.pincode.optional(),
    address: fields.address.nullable().optional(),
    minWageZone: fields.minWageZone.nullable().optional(),
    sphere: fields.sphere.nullable().optional(),
    lat: fields.lat.nullable().optional(),
    lng: fields.lng.nullable().optional(),
    inchargeName: fields.inchargeName.nullable().optional(),
    inchargePhone: fields.inchargePhone.nullable().optional(),
    shiftStart: fields.shiftStart.nullable().optional(),
    shiftEnd: fields.shiftEnd.nullable().optional(),
  })
  .strict()
  .superRefine((b, ctx) => {
    if (Object.keys(b).length === 0) ctx.addIssue({ code: 'custom', message: 'Nothing to change' });
  })
  .openapi('UpdateSiteBody');
export type UpdateSiteBody = z.infer<typeof UpdateSiteBody>;

export const ListSitesQuery = CursorQuery.extend({
  q: z.string().trim().min(1).max(100).optional().openapi({ description: 'Matches site name or code' }),
  clientId: z.uuid().optional(),
  stateCode: fields.stateCode.optional(),
  supervisorId: z.uuid().optional().openapi({ description: 'User id of a supervisor with a current assignment (primary or backup)' }),
  status: StatusSchema.optional(),
});
export type ListSitesQuery = z.infer<typeof ListSitesQuery>;

export const SiteSchema = z
  .object({
    id: z.uuid(),
    clientId: z.uuid(),
    code: z.string(),
    name: z.string(),
    address: z.string().nullable(),
    stateCode: z.string(),
    district: z.string(),
    pincode: z.string(),
    minWageZone: z.string().nullable(),
    sphere: WageSphereSchema.nullable(),
    minWageReady: z.boolean().openapi({ description: 'Zone and sphere are both set (needed before the first payroll run)' }),
    lat: z.number().nullable(),
    lng: z.number().nullable(),
    inchargeName: z.string().nullable(),
    inchargePhone: z.string().nullable(),
    shiftStart: z.string().nullable(),
    shiftEnd: z.string().nullable(),
    status: StatusSchema,
    createdAt: z.string(),
  })
  .openapi('Site');

export const SiteRowSchema = SiteSchema.extend({
  activeHeadcount: z.number().int().openapi({ description: 'Employees with a deployment running today' }),
  primarySupervisor: z.object({ userId: z.uuid(), name: z.string() }).nullable(),
}).openapi('SiteRow');

export const SiteListSchema = listOf(SiteRowSchema, 'SiteList');

export const AssignSupervisorBody = z
  .object({
    userId: z.uuid(),
    role: z.enum(['PRIMARY', 'BACKUP']),
    effectiveFrom: IsoDate.optional().openapi({ description: 'Defaults to today' }),
    effectiveTo: IsoDate.nullish(),
  })
  .superRefine((b, ctx) => {
    if (b.effectiveFrom && b.effectiveTo && b.effectiveTo < b.effectiveFrom) {
      ctx.addIssue({ code: 'custom', path: ['effectiveTo'], message: 'End date is before the start date' });
    }
  })
  .openapi('AssignSupervisorBody');
export type AssignSupervisorBody = z.infer<typeof AssignSupervisorBody>;

export const SiteSupervisorSchema = z
  .object({
    id: z.uuid().openapi({ description: 'The site-scope id: approve or revoke it at /site-scopes/{id}/…' }),
    userId: z.uuid(),
    name: z.string(),
    role: z.enum(['PRIMARY', 'BACKUP']),
    effectiveFrom: z.string(),
    effectiveTo: z.string().nullable(),
    status: z.enum(['PENDING', 'ACTIVE', 'ENDED']),
  })
  .openapi('SiteSupervisor');

export const SiteSupervisorListSchema = z.object({ items: z.array(SiteSupervisorSchema) }).openapi('SiteSupervisorList');

export const MySitesSchema = z
  .object({
    items: z.array(
      z.object({
        siteId: z.uuid(),
        code: z.string(),
        name: z.string(),
        clientId: z.uuid(),
        clientName: z.string(),
        address: z.string().nullable(),
        district: z.string(),
        shiftStart: z.string().nullable(),
        shiftEnd: z.string().nullable(),
        role: z.enum(['PRIMARY', 'BACKUP']),
      }),
    ),
  })
  .openapi('MySites');
