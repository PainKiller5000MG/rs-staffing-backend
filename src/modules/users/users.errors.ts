// Business-rule errors specific to user management.
import { ConflictError, RuleError } from '../../core/errors.ts';

export const lastAdmin = () =>
  new RuleError('LAST_ADMIN', 'At least one active Admin must remain. Make someone else Admin first.');

export const cannotDisableSelf = () => new RuleError('SELF_DISABLE', 'You cannot disable your own account');

export const notASupervisor = () =>
  new RuleError('NOT_A_SUPERVISOR', 'Site scopes can only be assigned to supervisor accounts');

export const loginNeedsEmployee = () =>
  new RuleError('EMPLOYEE_REQUIRED', 'Supervisor and employee logins must be linked to an employee record');

export const scopeAlreadyApproved = () => new ConflictError('ALREADY_APPROVED', 'This site scope is already approved');

export const scopeEnded = () => new ConflictError('SCOPE_ENDED', 'This site scope has already ended');

export const scopeAlreadyLive = () =>
  new ConflictError('OVERLAP', 'The supervisor already has an approved scope for this site');

export const siteInactive = () => new RuleError('SITE_INACTIVE', 'This site is not active');

/** M2-SIT-06: the new primary would start on or before the current primary's own start. */
export const primaryOverlap = () =>
  new ConflictError('PRIMARY_OVERLAP', 'The site already has a primary supervisor who started on or after this date');
