// Business-rule errors specific to sites (RuleError → 422, ConflictError → 409).
import { ConflictError, RuleError } from '../../core/errors.ts';

export const duplicateCode = () => new ConflictError('DUPLICATE', 'A site with this code already exists', { fields: ['code'] });
export const unknownState = () => new ConflictError('REFERENCE_MISSING', 'This state does not exist', { fields: ['stateCode'] });
export const unknownClient = () => new ConflictError('REFERENCE_MISSING', 'This client does not exist', { fields: ['clientId'] });

export const siteClosed = () => new RuleError('SITE_CLOSED', 'This site is closed');
export const alreadyClosed = () => new RuleError('ALREADY_CLOSED', 'This site is already closed');

/** M2-SIT-03 AC1. */
export const stateLocked = () =>
  new RuleError('STATE_LOCKED', 'The state cannot be changed because payroll has run for this site. Create a new site instead.', { fields: ['stateCode'] });

export type SiteDeployment = { employeeId: string; employeeCode: string; employeeName: string; effectiveFrom: string; effectiveTo: string | null };

/** M2-SIT-05 AC1: lists the deployments (first 50) so HQ can end them. */
export const hasActiveDeployments = (siteId: string, total: number, deployments: SiteDeployment[]) =>
  new RuleError('ACTIVE_DEPLOYMENTS', `This site still has ${total} active deployment${total === 1 ? '' : 's'}. End them first.`, {
    activeDeployments: total,
    deployments,
    href: `/sites/${siteId}`,
  });

/** M2-SIT-06 AC1. */
export const notAssignable = (reason: string) => new RuleError('NOT_ASSIGNABLE_SUPERVISOR', reason, { fields: ['userId'] });
