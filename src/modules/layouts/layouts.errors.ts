import { ConflictError, RuleError } from '../../core/errors.ts';

export const unknownClient = () => new ConflictError('REFERENCE_MISSING', 'This client does not exist', { fields: ['clientId'] });
export const unknownSite = () => new ConflictError('REFERENCE_MISSING', 'This site does not exist', { fields: ['siteId'] });
export const clientInactive = () => new RuleError('CLIENT_INACTIVE', 'This client is not active');
export const siteClosed = () => new RuleError('SITE_CLOSED', 'This site is closed', { fields: ['siteId'] });
export const siteNotOfClient = () => new RuleError('SITE_NOT_OF_CLIENT', 'This site belongs to another client', { fields: ['siteId'] });
