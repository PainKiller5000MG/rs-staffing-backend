// Business-rule errors specific to employee profiles.
import { ConflictError, ForbiddenError, RuleError, ValidationError } from '../../core/errors.ts';

export type DuplicateMatch = {
  field: 'aadhaar' | 'pan' | 'uan' | 'mobile' | 'name_dob';
  kind: 'EMPLOYEE' | 'DAILY_WORKER';
  id: string;
  code: string;
  name: string;
  status: string | null;
  /** M3-PRF-06 AC3/AC4: what HR can do instead of creating a new person. */
  offer: 'REHIRE' | 'CONVERT_DAILY_WORKER' | null;
  link: string;
  /** false = a warning only (same name + date of birth, or an exited person's released mobile). */
  blocking: boolean;
};

export const duplicatePerson = (matches: DuplicateMatch[]) => {
  const first = matches[0]!;
  const what = { aadhaar: 'Aadhaar', pan: 'PAN', uan: 'UAN', mobile: 'mobile number', name_dob: 'name and date of birth' }[first.field];
  return new ConflictError('DUPLICATE_PERSON', `This ${what} already belongs to ${first.name} (${first.code})`, { matches });
};

export const underage = () => new RuleError('UNDERAGE', 'The employee must be at least 18 years old on the date of joining');

export const dobInFuture = () => new ValidationError('Date of birth must be in the past', { fields: ['dob'] });

export const unknownState = (field: string) =>
  new ConflictError('REFERENCE_MISSING', 'Unknown state code', { fields: [field] });

export const mobileInUse = () => new ConflictError('DUPLICATE', 'This mobile number already belongs to another user', { fields: ['mobile'] });

export const aadhaarLocked = () =>
  new ForbiddenError('Aadhaar is fixed once saved. Only an Admin can correct it, with a reason.', 'AADHAAR_LOCKED');

export const reasonRequired = () =>
  new ValidationError('A reason is required to correct an Aadhaar number', { fields: ['reason'] });

export const invalidImage = () => new RuleError('IMAGE_INVALID', 'Upload a JPG or PNG image');

export const imageTooLarge = () => new RuleError('IMAGE_TOO_LARGE', 'The image must be 2 MB or smaller');
