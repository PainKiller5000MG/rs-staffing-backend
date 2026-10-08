// Request and response schemas for the Users module. The same schemas
// validate requests and generate openapi.json.
import { z } from '@hono/zod-openapi';
import { ROLES } from '../../lib/roles.ts';

export const RoleSchema = z.enum(ROLES).openapi('Role');
export const UserStatusSchema = z.enum(['ACTIVE', 'LOCKED', 'DISABLED']).openapi('UserStatus');

/** Indian mobile number, normalised to E.164 (+91XXXXXXXXXX). */
export const MobileSchema = z
  .string()
  .transform((s) => s.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^(\+91|91|0)?[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number'))
  .transform((s) => `+91${s.slice(-10)}`)
  .openapi({ example: '9000000001' });

export const IdParam = z.object({ id: z.uuid().openapi({ param: { name: 'id', in: 'path' } }) });
export const ScopeIdParam = z.object({ scopeId: z.uuid().openapi({ param: { name: 'scopeId', in: 'path' } }) });

export const CreateUserBody = z
  .object({
    name: z.string().trim().min(1).max(120),
    mobile: MobileSchema,
    email: z
      .email()
      .max(254)
      .transform((e) => e.trim().toLowerCase())
      .nullish(),
    role: RoleSchema,
    employeeId: z.uuid().nullish().openapi({ description: 'Required for SUPERVISOR and EMPLOYEE logins' }),
    expiresAt: z.iso.datetime({ offset: true }).nullish().openapi({ description: 'Auditor access end (AUDITOR only)' }),
  })
  .superRefine((b, ctx) => {
    if ((b.role === 'SUPERVISOR' || b.role === 'EMPLOYEE') && !b.employeeId) {
      ctx.addIssue({ code: 'custom', path: ['employeeId'], message: 'Supervisor and employee logins come from an employee record' });
    }
    if (b.expiresAt && b.role !== 'AUDITOR') {
      ctx.addIssue({ code: 'custom', path: ['expiresAt'], message: 'Only auditor accounts expire' });
    }
  })
  .openapi('CreateUserBody');
export type CreateUserBody = z.infer<typeof CreateUserBody>;

export const ChangeRoleBody = z.object({ role: RoleSchema }).openapi('ChangeRoleBody');
export type ChangeRoleBody = z.infer<typeof ChangeRoleBody>;

export const AssignScopeBody = z
  .object({
    siteId: z.uuid(),
    effectiveFrom: z.iso.date().optional().openapi({ description: 'Defaults to today (IST)' }),
  })
  .openapi('AssignScopeBody');
export type AssignScopeBody = z.infer<typeof AssignScopeBody>;

export const ListUsersQuery = z.object({
  role: RoleSchema.optional(),
  status: UserStatusSchema.optional(),
  q: z.string().trim().min(1).max(100).optional().openapi({ description: 'Matches name, email or mobile' }),
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListUsersQuery = z.infer<typeof ListUsersQuery>;

export const UserSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    mobile: z.string(),
    email: z.string().nullable(),
    role: RoleSchema,
    status: UserStatusSchema,
    employeeId: z.uuid().nullable(),
    expiresAt: z.string().nullable(),
    lastLoginAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('User');

export const SiteScopeSchema = z
  .object({
    id: z.uuid(),
    userId: z.uuid(),
    siteId: z.uuid(),
    effectiveFrom: z.string(),
    effectiveTo: z.string().nullable(),
    status: z.enum(['PENDING', 'ACTIVE', 'ENDED']),
    createdBy: z.uuid().nullable(),
    approvedBy: z.uuid().nullable(),
    approvedAt: z.string().nullable(),
    endedBy: z.uuid().nullable(),
    endedAt: z.string().nullable(),
  })
  .openapi('SiteScope');

export const UserDetailSchema = UserSchema.extend({ siteScopes: z.array(SiteScopeSchema) }).openapi('UserDetail');

export const UserListSchema = z
  .object({ items: z.array(UserSchema), nextCursor: z.uuid().nullable() })
  .openapi('UserList');

export const MeSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    role: RoleSchema,
    employeeId: z.uuid().nullable(),
    siteIds: z.array(z.uuid()),
    permissions: z.array(z.string()).openapi({ description: 'Permission keys (see GET /lookups); supervisors: own sites only, employees: own record only' }),
    siteScopes: z.array(
      z.object({ siteId: z.uuid(), siteCode: z.string(), siteName: z.string(), effectiveFrom: z.string(), effectiveTo: z.string().nullable() }),
    ),
  })
  .openapi('Me');
