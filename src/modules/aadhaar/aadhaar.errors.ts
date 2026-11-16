import { NotFoundError, RuleError, ValidationError } from '../../core/errors.ts';

export const invalidAadhaar = () =>
  new ValidationError('Enter a valid 12-digit Aadhaar number (checksum failed)', { fields: ['aadhaarNumber'] });

export const aadhaarNotFound = () => new NotFoundError('Aadhaar');

export const aadhaarRemoved = () => new RuleError('AADHAAR_REMOVED', 'This Aadhaar was removed from the store');

export const reasonTextRequired = () =>
  new ValidationError('Say why the Aadhaar is needed', { fields: ['reasonText'] });
