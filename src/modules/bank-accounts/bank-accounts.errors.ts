// Business-rule errors for employee bank accounts (M3-BNK).
import { ConflictError, ForbiddenError, RuleError } from '../../core/errors.ts';

export const unknownIfsc = () => new RuleError('IFSC_UNKNOWN', 'This IFSC is not in the bank list. Check it against the cheque or passbook.');

export const employeeExited = () => new RuleError('EMPLOYEE_EXITED', 'This employee has exited; bank details can no longer change');

export const invalidProof = () => new RuleError('INVALID_IMAGE', 'The proof must be a JPEG or PNG image');

export const proofTooLarge = () => new RuleError('IMAGE_TOO_LARGE', 'The proof image must be 2 MB or smaller');

export const changePending = () =>
  new ConflictError('CHANGE_PENDING', 'This employee already has a bank account waiting for verification or approval');

export const sameAccount = () => new ConflictError('DUPLICATE', 'This is already the employee\'s current account');

export type SharedWith = { employeeId: string; code: string; name: string };
export const sharedAccount = (owners: SharedWith[]) =>
  new ConflictError('SHARED_ACCOUNT', `This account is already used by ${owners[0]!.name} (${owners[0]!.code})`, { owners });

export const overrideNeedsAdmin = () => new ForbiddenError('Only an Admin can override a shared account');

export const alreadyApproved = () => new ConflictError('ALREADY_APPROVED', 'This account is already approved');

export const notVerifiable = () =>
  new ConflictError('NOT_VERIFIABLE', 'This account is already approved or its mismatch is already decided');

export const notMismatch = () => new RuleError('NOT_NAME_MISMATCH', 'Only an account marked "name mismatch" needs this approval');

export const notVerified = () =>
  new RuleError('NOT_VERIFIED', 'The account must be verified (or its name mismatch approved by an Admin) before it can be used for salary');

export const noActiveAccount = (employeeId: string, date: string) =>
  new RuleError('NO_BANK_ACCOUNT', `No active, verified bank account on ${date}`, { employeeId, date });

export const manyActiveAccounts = (employeeId: string, date: string) =>
  new RuleError('MULTIPLE_BANK_ACCOUNTS', `More than one active bank account on ${date}`, { employeeId, date });

export const bankAccountRequired = () =>
  new RuleError('BANK_ACCOUNT_REQUIRED', 'An employee paid by bank transfer needs a verified, approved bank account before becoming Active');
