// Request and response schemas for clients. They validate requests and generate openapi.json.
import { z } from '@hono/zod-openapi';
import { checkGstin, isPan, panOfGstin } from '../../lib/tax-ids.ts';
import { CursorQuery, IsoDate, listOf } from '../../lib/schemas.ts';

export { IdParam } from '../../lib/schemas.ts';

export const ContactIdParam = z.object({
  id: z.uuid().openapi({ param: { name: 'id', in: 'path' } }),
  contactId: z.uuid().openapi({ param: { name: 'contactId', in: 'path' } }),
});

export const StatusSchema = z.enum(['ACTIVE', 'INACTIVE']).openapi('RecordStatus');
export const ContactRoleSchema = z.enum(['HR', 'ACCOUNTS', 'SITE_INCHARGE', 'OTHER']).openapi('ContactRole');

const Email = z.string().trim().toLowerCase().pipe(z.email().max(254));

const text = (max: number) => z.string().trim().min(1).max(max);

/** Short code: uppercase letters, digits and hyphens; 3–20 characters (M2-CLI-01 AC4). */
export const ShortCode = z
  .string()
  .regex(/^[A-Z0-9][A-Z0-9-]{2,19}$/, 'Use 3–20 uppercase letters, digits or hyphens, e.g. TATA-PUNE')
  .openapi({ example: 'TATA-PUNE' });

const Gstin = z
  .string()
  .superRefine((v, ctx) => {
    const problem = checkGstin(v);
    if (problem) ctx.addIssue({ code: 'custom', message: problem === 'format' ? 'Not a valid GSTIN format' : 'GSTIN check digit is wrong' });
  })
  .openapi({ example: '27AAPFU0939F1ZV' });

const Pan = z
  .string()
  .refine(isPan, 'Not a valid PAN (e.g. AABCT1234F)')
  .openapi({ example: 'AABCT1234F' });

const fields = {
  name: text(200).openapi({ description: 'Legal name' }),
  stateCode: z.string().regex(/^[A-Z]{2,4}$/, 'Use the state code, e.g. MP').openapi({ description: 'Primary state' }),
  gstin: Gstin,
  pan: Pan,
  registeredAddress: text(500),
  billingAddress: text(500),
  contractStart: IsoDate,
  contractEnd: IsoDate,
  workOrderNumber: text(60),
};

type Checkable = { gstin?: string | null; pan?: string | null; contractStart?: string | null; contractEnd?: string | null };

/** Cross-field rules shared by create and edit. */
function crossChecks(b: Checkable, ctx: z.RefinementCtx) {
  if (b.gstin && b.pan && checkGstin(b.gstin) === null && panOfGstin(b.gstin) !== b.pan) {
    ctx.addIssue({ code: 'custom', path: ['pan'], message: 'PAN does not match the GSTIN' });
  }
  if (b.contractStart && b.contractEnd && b.contractEnd < b.contractStart) {
    ctx.addIssue({ code: 'custom', path: ['contractEnd'], message: 'Contract end is before contract start' });
  }
}

export const CreateClientBody = z
  .object({
    code: ShortCode,
    name: fields.name,
    stateCode: fields.stateCode,
    gstin: fields.gstin.nullish(),
    pan: fields.pan.nullish(),
    registeredAddress: fields.registeredAddress.nullish(),
    billingAddress: fields.billingAddress.nullish(),
    contractStart: fields.contractStart.nullish(),
    contractEnd: fields.contractEnd.nullish(),
    workOrderNumber: fields.workOrderNumber.nullish(),
    pfEstablishmentId: z.uuid().optional().openapi({ description: 'Defaults to the default PF establishment' }),
    esiEstablishmentId: z.uuid().optional().openapi({ description: 'Defaults to the default ESI establishment' }),
  })
  .superRefine(crossChecks)
  .openapi('CreateClientBody');
export type CreateClientBody = z.infer<typeof CreateClientBody>;

/** Every field optional; null clears an optional field. */
export const UpdateClientBody = z
  .object({
    code: ShortCode.optional().openapi({ description: 'Refused once payroll has run for the client' }),
    name: fields.name.optional(),
    stateCode: fields.stateCode.optional(),
    gstin: fields.gstin.nullable().optional(),
    pan: fields.pan.nullable().optional(),
    registeredAddress: fields.registeredAddress.nullable().optional(),
    billingAddress: fields.billingAddress.nullable().optional(),
    contractStart: fields.contractStart.nullable().optional(),
    contractEnd: fields.contractEnd.nullable().optional(),
    workOrderNumber: fields.workOrderNumber.nullable().optional(),
    pfEstablishmentId: z.uuid().optional(),
    esiEstablishmentId: z.uuid().optional(),
  })
  .superRefine((b, ctx) => {
    if (Object.keys(b).length === 0) ctx.addIssue({ code: 'custom', message: 'Nothing to change' });
    crossChecks(b, ctx);
  })
  .openapi('UpdateClientBody');
export type UpdateClientBody = z.infer<typeof UpdateClientBody>;

export const ListClientsQuery = CursorQuery.extend({
  q: z.string().trim().min(1).max(100).optional().openapi({ description: 'Matches name, short code or GSTIN' }),
  stateCode: fields.stateCode.optional(),
  status: StatusSchema.optional(),
});
export type ListClientsQuery = z.infer<typeof ListClientsQuery>;

export const ExpiringQuery = z.object({
  withinDays: z.coerce.number().int().min(1).max(365).default(30),
});
export type ExpiringQuery = z.infer<typeof ExpiringQuery>;

export const ClientSchema = z
  .object({
    id: z.uuid(),
    code: z.string(),
    name: z.string(),
    stateCode: z.string(),
    gstin: z.string().nullable(),
    pan: z.string().nullable(),
    registeredAddress: z.string().nullable(),
    billingAddress: z.string().nullable(),
    contractStart: z.string().nullable(),
    contractEnd: z.string().nullable(),
    workOrderNumber: z.string().nullable(),
    pfEstablishmentId: z.uuid(),
    esiEstablishmentId: z.uuid(),
    status: StatusSchema,
    createdAt: z.string(),
  })
  .openapi('Client');
export type ClientDto = z.infer<typeof ClientSchema>;

export const ClientRowSchema = ClientSchema.extend({
  siteCount: z.number().int(),
  activeEmployees: z.number().int().openapi({ description: 'Employees with a deployment running today' }),
}).openapi('ClientRow');

export const ClientListSchema = listOf(ClientRowSchema, 'ClientList');

export const ExpiringSchema = z
  .object({
    items: z.array(
      z.object({
        id: z.uuid(),
        code: z.string(),
        name: z.string(),
        contractEnd: z.string(),
        daysLeft: z.number().int(),
        alert: z.enum(['D7', 'D30']).nullable().openapi({ description: 'D7 when 7 or fewer days remain, D30 when 30 or fewer' }),
      }),
    ),
  })
  .openapi('ExpiringClients');

export const CreateContactBody = z
  .object({
    name: text(120),
    role: ContactRoleSchema,
    email: Email.nullish(),
    phone: z.string().trim().regex(/^\+?[0-9][0-9 -]{5,18}$/, 'Enter a phone number').nullish(),
    isAttendanceSender: z.boolean().default(false),
  })
  .superRefine((b, ctx) => {
    if (b.isAttendanceSender && !b.email) {
      ctx.addIssue({ code: 'custom', path: ['email'], message: 'The attendance sender needs an email' });
    }
  })
  .openapi('CreateContactBody');
export type CreateContactBody = z.infer<typeof CreateContactBody>;

export const UpdateContactBody = z
  .object({
    name: text(120).optional(),
    role: ContactRoleSchema.optional(),
    email: Email.nullable().optional(),
    phone: z.string().trim().regex(/^\+?[0-9][0-9 -]{5,18}$/, 'Enter a phone number').nullable().optional(),
    isAttendanceSender: z.boolean().optional(),
    status: StatusSchema.optional().openapi({ description: 'INACTIVE removes the contact (never deleted)' }),
  })
  .superRefine((b, ctx) => {
    if (Object.keys(b).length === 0) ctx.addIssue({ code: 'custom', message: 'Nothing to change' });
  })
  .openapi('UpdateContactBody');
export type UpdateContactBody = z.infer<typeof UpdateContactBody>;

export const ContactSchema = z
  .object({
    id: z.uuid(),
    clientId: z.uuid(),
    name: z.string(),
    role: ContactRoleSchema,
    email: z.string().nullable(),
    phone: z.string().nullable(),
    isAttendanceSender: z.boolean(),
    status: StatusSchema,
  })
  .openapi('ClientContact');
export type ContactDto = z.infer<typeof ContactSchema>;

export const ContactListSchema = z.object({ items: z.array(ContactSchema) }).openapi('ClientContactList');

export const ImportClientsBody = z
  .object({
    rows: z.array(z.record(z.string(), z.unknown())).min(1).max(1000).openapi({ description: 'One object per client, same fields as POST /clients' }),
  })
  .openapi('ImportClientsBody');
export type ImportClientsBody = z.infer<typeof ImportClientsBody>;

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
  .openapi('ImportClientsResult');
