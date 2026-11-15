// Business-rule errors specific to settings (RuleError → 422, ConflictError → 409).
import { ConflictError, ForbiddenError, RuleError } from '../../core/errors.ts';

export const unknownClient = () => new ConflictError('REFERENCE_MISSING', 'This client does not exist', { fields: ['scopeId'] });
export const unknownSite = () => new ConflictError('REFERENCE_MISSING', 'This site does not exist', { fields: ['scopeId'] });
export const unknownTemplate = () => new ConflictError('REFERENCE_MISSING', 'This salary template does not exist', { fields: ['value'] });

export const clientInactive = () => new RuleError('CLIENT_INACTIVE', 'This client is not active', { fields: ['scopeId'] });
export const siteClosed = () => new RuleError('SITE_CLOSED', 'This site is closed', { fields: ['scopeId'] });
export const templateUnusable = (reason: string) => new RuleError('TEMPLATE_NOT_USABLE', reason, { fields: ['value'] });

/** M2-SET-01 AC3: a change must not alter a month that is already behind us. */
export const effectiveInPast = (earliest: string) =>
  new RuleError('EFFECTIVE_DATE_IN_PAST', `A setting cannot start before ${earliest}, the first day of this month; past months keep the values they were run with`, {
    fields: ['effectiveFrom'],
    earliest,
  });

/** A newer approved value already starts on or after this date. */
export const overlap = (latest: string) =>
  new ConflictError('OVERLAP', `An approved value already starts on ${latest}; the new one must start after it`, { fields: ['effectiveFrom'], latestEffectiveFrom: latest });

export const alreadyApproved = () => new RuleError('ALREADY_APPROVED', 'This setting is already approved');
export const companyAdminOnly = () => new ForbiddenError('Only an Admin can change company-wide settings');
