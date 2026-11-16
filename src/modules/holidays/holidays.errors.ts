// Business-rule errors specific to holidays (RuleError → 422, ConflictError → 409, NotFoundError → 404).
import { ConflictError, NotFoundError, RuleError } from '../../core/errors.ts';

export const notFound = () => new NotFoundError('Holiday');
export const replacementNotFound = () => new NotFoundError('Holiday replacement');
export const siteNotFound = () => new NotFoundError('Site');

export const duplicate = () => new ConflictError('DUPLICATE', 'A holiday already exists on this date for this level and key', { fields: ['date'] });
export const unknownState = () => new ConflictError('REFERENCE_MISSING', 'This state does not exist', { fields: ['scopeKey'] });
export const unknownClient = () => new ConflictError('REFERENCE_MISSING', 'This client does not exist', { fields: ['scopeKey'] });
export const unknownSite = () => new ConflictError('REFERENCE_MISSING', 'This site does not exist', { fields: ['scopeKey'] });

export const clientInactive = () => new RuleError('CLIENT_INACTIVE', 'This client is not active');
export const siteClosed = () => new RuleError('SITE_CLOSED', 'This site is closed');

/** National days are paid and fixed (M14-HOL-01 AC2). */
export const nationalFixed = () => new RuleError('NATIONAL_HOLIDAY_FIXED', 'A national holiday is always paid and fixed, never optional or half-day');

/** M14-HOL-02 AC2. */
export const nationalNotReplaceable = () => new RuleError('NATIONAL_NOT_REPLACEABLE', 'A national holiday cannot be removed or replaced by a client', { fields: ['holidayId'] });
export const notStateHoliday = () => new RuleError('NOT_STATE_HOLIDAY', 'Only a state holiday can be replaced by a client', { fields: ['holidayId'] });
export const replacementSameDay = () => new RuleError('REPLACEMENT_SAME_DAY', 'The replacement day must differ from the holiday', { fields: ['replacementDate'] });
export const replacementOtherYear = () => new RuleError('DATE_OUTSIDE_YEAR', 'The replacement day must fall in the same year as the holiday', { fields: ['replacementDate'] });
export const alreadyReplaced = () => new ConflictError('DUPLICATE', 'This client already replaced this holiday', { fields: ['holidayId'] });

/** M14-HOL-05 AC1. */
export const monthLocked = (runs: { id: string; clientId: string | null; status: string; periodFrom: string; periodTo: string }[]) =>
  new RuleError('MONTH_LOCKED', 'Payroll for this month is locked for the affected sites. Use an adjustment run.', { lockedRuns: runs });

export const cannotReadYear = () => new RuleError('YEAR_OUT_OF_RANGE', 'The year must be between 2000 and 2100', { fields: ['year'] });
