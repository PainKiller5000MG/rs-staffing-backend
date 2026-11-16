// Request and response schemas for employee bank accounts (M3-BNK).
import { z } from '@hono/zod-openapi';
import { IsoDate } from '../../lib/schemas.ts';

const text = (max: number) => z.string().trim().min(1).max(max);

export const EmployeeIdParam = z.object({ id: z.uuid().openapi({ param: { name: 'id', in: 'path' } }) });
export const BankIdParam = z.object({ id: z.uuid().openapi({ param: { name: 'id', in: 'path' } }) });
export const IfscParam = z.object({
  ifsc: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'An IFSC is 4 letters, a 0, then 6 letters or digits')
    .openapi({ param: { name: 'ifsc', in: 'path' }, example: 'SBIN0030112' }),
});

const Ifsc = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'An IFSC is 4 letters, a 0, then 6 letters or digits')
  .openapi({ example: 'SBIN0030112' });

const AccountNumber = z
  .string()
  .trim()
  .regex(/^[0-9]{9,18}$/, 'An account number is 9 to 18 digits');

export const AccountTypeSchema = z.enum(['SAVINGS', 'CURRENT']).openapi('BankAccountType');

export const CreateBankAccountBody = z
  .object({
    holderName: text(120),
    accountNumber: AccountNumber,
    accountNumberConfirm: z.string().trim(),
    ifsc: Ifsc,
    accountType: AccountTypeSchema.default('SAVINGS'),
    proofImageBase64: z.string().min(100).max(3_000_000).openapi({ description: 'Cancelled cheque or passbook image (JPEG/PNG), base64 (max 2 MB decoded)' }),
    sharedOverrideReason: text(300).optional().openapi({ description: 'Admin only: allow an account number another active employee already uses' }),
  })
  .refine((b) => b.accountNumber === b.accountNumberConfirm, { path: ['accountNumberConfirm'], message: 'The two account numbers do not match' })
  .openapi('CreateBankAccountBody');
export type CreateBankAccountBody = z.infer<typeof CreateBankAccountBody>;

export const ReasonBody = z.object({ reason: text(300) }).openapi('BankReasonBody');
export type ReasonBody = z.infer<typeof ReasonBody>;

export const BankAccountStatusSchema = z
  .enum(['PENDING_VERIFICATION', 'NAME_MISMATCH', 'FAILED', 'AWAITING_APPROVAL', 'SCHEDULED', 'ACTIVE', 'INACTIVE'])
  .openapi('BankAccountStatus');

export const BankAccountSchema = z
  .object({
    id: z.uuid(),
    employeeId: z.uuid(),
    status: BankAccountStatusSchema,
    holderName: z.string(),
    accountMasked: z.string().openapi({ example: 'XXXXXX4321' }),
    ifsc: z.string(),
    bankName: z.string().nullable(),
    branch: z.string().nullable(),
    accountType: AccountTypeSchema,
    hasProof: z.boolean(),
    verifyStatus: z.enum(['PENDING', 'VERIFIED', 'NAME_MISMATCH', 'FAILED']),
    bankReturnedName: z.string().nullable(),
    nameMatchScore: z.number().int().nullable(),
    mismatchReason: z.string().nullable(),
    sharedOverrideReason: z.string().nullable(),
    effectiveFrom: IsoDate.nullable(),
    effectiveTo: IsoDate.nullable(),
    createdAt: z.string(),
  })
  .openapi('BankAccount');

export const BankAccountListSchema = z.object({ items: z.array(BankAccountSchema) }).openapi('BankAccountList');

export const IfscSchema = z.object({ ifsc: z.string(), bankName: z.string(), branch: z.string() }).openapi('IfscLookup');
