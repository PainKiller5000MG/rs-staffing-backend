// Request and response schemas for employee profiles. They validate requests and generate openapi.json.
import { z } from '@hono/zod-openapi';
import { IsoDate } from '../../lib/schemas.ts';
import { isPan } from '../../lib/tax-ids.ts';
import { isAadhaar } from '../../lib/verhoeff.ts';
import { MobileSchema } from '../users/users.schemas.ts';

export { IdParam } from '../users/users.schemas.ts';

const text = (max: number) => z.string().trim().min(1).max(max);

export const GenderSchema = z.enum(['MALE', 'FEMALE', 'OTHER']).openapi('Gender');
export const MaritalStatusSchema = z.enum(['SINGLE', 'MARRIED', 'WIDOWED', 'DIVORCED']).openapi('MaritalStatus');
export const StaffTypeSchema = z.enum(['DEPLOYED', 'SUPERVISOR', 'HQ', 'CONTRACT']).openapi('StaffType');
export const SkillLevelSchema = z.enum(['UNSKILLED', 'SEMI_SKILLED', 'SKILLED', 'HIGHLY_SKILLED']).openapi('SkillLevel');
export const EmployeeStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'ON_NOTICE', 'EXITED', 'ABSCONDED']).openapi('EmployeeStatus');

export const AddressSchema = z
  .object({
    line: text(300),
    stateCode: z.string().regex(/^[A-Z]{2,4}$/, 'Use the state code, e.g. MP'),
    pin: z.string().regex(/^[1-9][0-9]{5}$/, 'Enter a 6-digit PIN code').openapi({ example: '462023' }),
  })
  .openapi('Address');

const Pan = z
  .string()
  .trim()
  .toUpperCase()
  .refine(isPan, 'PAN must look like ABCDE1234F')
  .openapi({ example: 'ABCPE1234F' });

const dob = IsoDate.refine((d) => d >= '1900-01-01', 'Enter a valid date of birth');

const personal = {
  designation: text(80),
  skillLevel: SkillLevelSchema,
  email: z.email().max(254),
  fatherName: text(120).openapi({ description: "Father's or husband's name" }),
  maritalStatus: MaritalStatusSchema,
  altPhone: MobileSchema,
  currentAddress: AddressSchema,
  permanentAddress: AddressSchema,
  pan: Pan,
  language: z.enum(['en', 'hi']),
};

export const CreateEmployeeBody = z
  .object({
    name: text(120),
    dob,
    gender: GenderSchema,
    mobile: MobileSchema,
    joinDate: IsoDate,
    staffType: StaffTypeSchema.optional(),
    designation: personal.designation.optional(),
    skillLevel: personal.skillLevel.optional(),
    email: personal.email.optional(),
    fatherName: personal.fatherName.optional(),
    maritalStatus: personal.maritalStatus.optional(),
    altPhone: personal.altPhone.optional(),
    currentAddress: personal.currentAddress.optional(),
    permanentAddress: personal.permanentAddress.optional(),
    pan: personal.pan.optional(),
    language: personal.language.optional(),
  })
  .openapi('CreateEmployeeBody');
export type CreateEmployeeBody = z.infer<typeof CreateEmployeeBody>;

/** Employee code, mobile (it is the login) and Aadhaar are not editable here: strict rejects them. */
export const UpdateEmployeeBody = z
  .object({
    name: text(120),
    dob,
    gender: GenderSchema,
    joinDate: IsoDate,
    designation: personal.designation,
    skillLevel: personal.skillLevel,
    email: personal.email.nullable(),
    fatherName: personal.fatherName.nullable(),
    maritalStatus: personal.maritalStatus.nullable(),
    altPhone: personal.altPhone.nullable(),
    currentAddress: personal.currentAddress.nullable(),
    permanentAddress: personal.permanentAddress.nullable(),
    pan: personal.pan.nullable(),
    language: personal.language,
  })
  .partial()
  .strict()
  .refine((b) => Object.keys(b).length > 0, 'Send at least one field to change')
  .openapi('UpdateEmployeeBody');
export type UpdateEmployeeBody = z.infer<typeof UpdateEmployeeBody>;

export const DuplicateCheckBody = z
  .object({
    name: text(120).optional(),
    dob: dob.optional(),
    mobile: MobileSchema.optional(),
    pan: Pan.optional(),
    uan: z.string().regex(/^\d{12}$/, 'UAN is 12 digits').optional(),
    aadhaarNumber: z.string().optional().transform((s) => s?.replace(/[\s-]/g, '')).pipe(z.string().refine(isAadhaar, 'Enter a valid 12-digit Aadhaar number').optional()),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), 'Send at least one field to check')
  .openapi('DuplicateCheckBody');
export type DuplicateCheckBody = z.infer<typeof DuplicateCheckBody>;

const ImageBase64 = z.string().min(100).max(3_000_000).openapi({ description: 'The file, base64 encoded (max 2 MB decoded)' });

export const PhotoBody = z.object({ imageBase64: ImageBase64 }).openapi('PhotoBody');

export const AadhaarBody = z
  .object({
    aadhaarNumber: z
      .string()
      .transform((s) => s.replace(/[\s-]/g, ''))
      .pipe(z.string().refine(isAadhaar, 'Enter a valid 12-digit Aadhaar number (checksum failed)')),
    cardImageBase64: ImageBase64.optional(),
    reason: text(300).optional().openapi({ description: 'Required when correcting an existing number (Admin only)' }),
  })
  .openapi('AadhaarBody');
export type AadhaarBody = z.infer<typeof AadhaarBody>;

const DuplicateMatchSchema = z
  .object({
    field: z.enum(['aadhaar', 'pan', 'uan', 'mobile', 'name_dob']),
    kind: z.enum(['EMPLOYEE', 'DAILY_WORKER']),
    id: z.uuid(),
    code: z.string(),
    name: z.string(),
    status: z.string().nullable(),
    offer: z.enum(['REHIRE', 'CONVERT_DAILY_WORKER']).nullable(),
    link: z.string(),
    blocking: z.boolean(),
  })
  .openapi('DuplicateMatch');

export const DuplicateCheckSchema = z.object({ matches: z.array(DuplicateMatchSchema) }).openapi('DuplicateCheck');

const AddressOut = AddressSchema.nullable();

export const ProfileSchema = z
  .object({
    id: z.uuid(),
    code: z.string(),
    status: EmployeeStatusSchema,
    name: z.string(),
    dob: z.string().openapi({ description: 'Masked: only the year is shown (1992-XX-XX)' }),
    age: z.number().int(),
    gender: GenderSchema,
    mobile: z.string(),
    altPhone: z.string().nullable(),
    email: z.string().nullable(),
    fatherName: z.string().nullable(),
    maritalStatus: MaritalStatusSchema.nullable(),
    staffType: StaffTypeSchema,
    designation: z.string().nullable(),
    skillLevel: SkillLevelSchema,
    joinDate: z.string().nullable(),
    exitDate: z.string().nullable(),
    language: z.string(),
    hasPhoto: z.boolean(),
    currentAddress: AddressOut,
    permanentAddress: AddressOut,
    pan: z.string().nullable().openapi({ description: 'Masked: ABXXXXX4F' }),
    aadhaar: z.string().nullable().openapi({ description: 'Masked: XXXX XXXX 1234' }),
    createdAt: z.string(),
  })
  .openapi('EmployeeProfile');

export const CreatedEmployeeSchema = ProfileSchema.extend({ warnings: z.array(DuplicateMatchSchema) }).openapi('CreatedEmployee');

export const EmployeeViewSchema = z
  .object({
    profile: ProfileSchema,
    currentDeployment: z
      .object({
        siteId: z.uuid(),
        siteCode: z.string(),
        siteName: z.string(),
        clientName: z.string(),
        designation: z.string(),
        effectiveFrom: z.string(),
      })
      .nullable(),
    bank: z
      .object({
        accountMasked: z.string(),
        ifsc: z.string(),
        holderName: z.string(),
        verified: z.boolean(),
        approved: z.boolean(),
      })
      .nullable(),
    statutory: z
      .object({
        uan: z.string().nullable(),
        esiIpNo: z.string().nullable(),
        pfExempt: z.boolean(),
        ptExempt: z.boolean(),
      })
      .nullable(),
    documents: z.array(z.object({ id: z.uuid(), type: z.string(), expiresOn: z.string().nullable() })),
    leaveBalances: z.array(z.object({ leaveTypeCode: z.string(), days: z.string() })),
  })
  .openapi('EmployeeView');

/** What a supervisor sees of a worker on their site: no salary, bank or KYC. */
export const SupervisorViewSchema = z
  .object({
    id: z.uuid(),
    code: z.string(),
    name: z.string(),
    designation: z.string().nullable(),
    mobile: z.string(),
    hasPhoto: z.boolean(),
    site: z.object({ id: z.uuid(), code: z.string(), name: z.string() }),
  })
  .openapi('SupervisorEmployeeView');

export const AadhaarSavedSchema = z.object({ aadhaar: z.string(), hasCardImage: z.boolean() }).openapi('AadhaarSaved');
export const PhotoSavedSchema = z.object({ hasPhoto: z.literal(true) }).openapi('PhotoSaved');
