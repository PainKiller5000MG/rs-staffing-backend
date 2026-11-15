// Request and response schemas for settings. They validate requests and generate openapi.json.
import { z } from '@hono/zod-openapi';
import { CursorQuery, IsoDate, listOf } from '../../lib/schemas.ts';
import { DESIGNATION, KEYS, KEY_NAMES, isKey, normaliseDesignation, type SettingKey } from './settings.keys.ts';

export const ScopeSchema = z.enum(['COMPANY', 'CLIENT', 'SITE']).openapi('SettingScope');
export const SettingKeySchema = z.enum(KEY_NAMES as [SettingKey, ...SettingKey[]]).openapi('SettingKey');
export const SettingStatusSchema = z.enum(['PENDING', 'SCHEDULED', 'ACTIVE', 'ENDED']).openapi('SettingStatus');

export const SettingIdParam = z.object({ id: z.uuid().openapi({ param: { name: 'id', in: 'path' } }) });
export const ClientIdParam = z.object({ clientId: z.uuid().openapi({ param: { name: 'clientId', in: 'path' } }) });
export const SiteIdParam = z.object({ siteId: z.uuid().openapi({ param: { name: 'siteId', in: 'path' } }) });
export const AsOfQuery = z.object({ asOf: IsoDate.optional().openapi({ description: 'The day to resolve for; default today' }) });
export type AsOfQuery = z.infer<typeof AsOfQuery>;

export const ProposeSettingBody = z
  .object({
    scope: ScopeSchema,
    scopeId: z.uuid().nullish().openapi({ description: 'Client or site id; omit for COMPANY' }),
    key: SettingKeySchema,
    designation: z.string().trim().min(1).max(40).optional().openapi({ description: 'Only for key SALARY_TEMPLATE: the designation this template is the default for' }),
    value: z.string().trim().min(1).max(200),
    effectiveFrom: IsoDate,
  })
  .superRefine((b, ctx) => {
    const def = KEYS[b.key];
    if (!(def.scopes as readonly string[]).includes(b.scope)) {
      ctx.addIssue({ code: 'custom', path: ['scope'], message: `${b.key} can be set at ${def.scopes.join(' or ')} level only` });
    }
    if (b.scope === 'COMPANY' ? b.scopeId != null : b.scopeId == null) {
      ctx.addIssue({ code: 'custom', path: ['scopeId'], message: b.scope === 'COMPANY' ? 'A company-wide setting has no scopeId' : `scopeId is required for ${b.scope}` });
    }
    if (def.parse(b.value) === null) ctx.addIssue({ code: 'custom', path: ['value'], message: `Not allowed for ${b.key}: use ${def.hint}` });
    if (b.designation !== undefined) {
      if (b.key !== 'SALARY_TEMPLATE') ctx.addIssue({ code: 'custom', path: ['designation'], message: 'Only SALARY_TEMPLATE takes a designation' });
      else if (!DESIGNATION.test(normaliseDesignation(b.designation))) ctx.addIssue({ code: 'custom', path: ['designation'], message: 'Use letters, digits, spaces and & . / - only' });
    }
  })
  .openapi('ProposeSettingBody');
export type ProposeSettingBody = z.infer<typeof ProposeSettingBody>;

export const ListSettingsQuery = CursorQuery.extend({
  scope: ScopeSchema,
  scopeId: z.uuid().optional(),
  key: z.string().trim().min(1).max(60).optional().refine((k) => k === undefined || isKey(k.split(':')[0] ?? ''), 'Unknown setting key'),
  status: SettingStatusSchema.optional(),
});
export type ListSettingsQuery = z.infer<typeof ListSettingsQuery>;

export const SettingSchema = z
  .object({
    id: z.uuid(),
    scope: ScopeSchema,
    scopeId: z.uuid().nullable(),
    key: z.string(),
    designation: z.string().nullable(),
    value: z.string(),
    effectiveFrom: IsoDate,
    effectiveTo: IsoDate.nullable(),
    status: SettingStatusSchema,
    createdBy: z.uuid().nullable(),
    approvedBy: z.uuid().nullable(),
    approvedAt: z.string().nullable(),
  })
  .openapi('Setting');
export const SettingListSchema = listOf(SettingSchema, 'SettingList');

export const ResolvedSettingsSchema = z
  .object({
    asOf: IsoDate,
    clientId: z.uuid().nullable(),
    siteId: z.uuid().nullable(),
    settings: z.array(
      z.object({
        key: SettingKeySchema,
        value: z.string().nullable(),
        source: z.enum(['SITE', 'CLIENT', 'COMPANY', 'DEFAULT', 'NONE']),
        effectiveFrom: IsoDate.nullable(),
      }),
    ),
  })
  .openapi('ResolvedSettings');

export const SalaryDefaultsSchema = z
  .object({
    asOf: IsoDate,
    clientId: z.uuid(),
    default: z.object({ templateId: z.uuid(), effectiveFrom: IsoDate }).nullable(),
    designations: z.array(z.object({ designation: z.string(), templateId: z.uuid(), effectiveFrom: IsoDate })),
  })
  .openapi('SalaryDefaults');
