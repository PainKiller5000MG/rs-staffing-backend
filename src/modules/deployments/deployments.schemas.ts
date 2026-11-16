// Request and response schemas for deployments (M3-DEP).
import { z } from '@hono/zod-openapi';
import { IsoDate, Paise, PaiseIn } from '../../lib/schemas.ts';

const text = (max: number) => z.string().trim().min(1).max(max);

export const EmployeeIdParam = z.object({ id: z.uuid().openapi({ param: { name: 'id', in: 'path' } }) });

export const SkillLevelSchema = z.enum(['UNSKILLED', 'SEMI_SKILLED', 'SKILLED', 'HIGHLY_SKILLED']).openapi('SkillLevel');
export const StaffTypeSchema = z.enum(['DEPLOYED', 'SUPERVISOR', 'HQ', 'CONTRACT']).openapi('StaffType');

const PositivePaise = PaiseIn.refine((n) => n > 0n, 'must be more than zero');

export const DeployBody = z
  .object({
    siteId: z.uuid(),
    designation: text(80),
    skillLevel: SkillLevelSchema,
    templateId: z.uuid().optional().openapi({ description: 'Salary template; defaults from the client settings (M2-SET-04)' }),
    monthlyCtcPaise: PositivePaise,
    effectiveFrom: IsoDate,
  })
  .openapi('DeployBody');
export type DeployBody = z.infer<typeof DeployBody>;

export const ReviseBody = z
  .object({
    effectiveFrom: IsoDate,
    monthlyCtcPaise: PositivePaise,
    templateId: z.uuid().optional().openapi({ description: 'New salary structure; omit to keep the current one' }),
    reason: text(200),
  })
  .openapi('SalaryRevisionBody');
export type ReviseBody = z.infer<typeof ReviseBody>;

export const AsOfQuery = z.object({ asOf: IsoDate.optional() });
export type AsOfQuery = z.infer<typeof AsOfQuery>;

export const StaffTypeBody = z.object({ staffType: StaffTypeSchema }).openapi('StaffTypeBody');
export type StaffTypeBody = z.infer<typeof StaffTypeBody>;

export const DeploymentSchema = z
  .object({
    id: z.uuid(),
    employeeId: z.uuid(),
    clientId: z.uuid(),
    clientName: z.string(),
    siteId: z.uuid(),
    siteCode: z.string(),
    siteName: z.string(),
    designation: z.string(),
    skillLevel: SkillLevelSchema,
    templateId: z.uuid().nullable(),
    monthlyCtcPaise: Paise,
    kind: z.enum(['DEPLOY', 'REDEPLOY', 'REVISION']),
    reason: z.string().nullable(),
    effectiveFrom: IsoDate,
    effectiveTo: IsoDate.nullable(),
    status: z.enum(['SCHEDULED', 'ACTIVE', 'ENDED']),
  })
  .openapi('Deployment');

export const DeploymentListSchema = z
  .object({ employeeId: z.uuid(), staffType: StaffTypeSchema, asOf: IsoDate.nullable(), items: z.array(DeploymentSchema) })
  .openapi('DeploymentList');

export const RedeploySchema = z.object({ ended: DeploymentSchema, started: DeploymentSchema }).openapi('RedeployResult');

export const StaffTypeResultSchema = z
  .object({
    id: z.uuid(),
    staffType: StaffTypeSchema,
    category: z.enum(['DEPLOYED', 'INTERNAL']),
    payrollCentre: z.string().nullable(),
  })
  .openapi('StaffTypeResult');
