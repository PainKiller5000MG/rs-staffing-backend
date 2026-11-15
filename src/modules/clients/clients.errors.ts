// Business-rule errors specific to clients (RuleError → 422, ConflictError → 409).
import { ConflictError, RuleError } from '../../core/errors.ts';

export const clientInactive = () => new RuleError('CLIENT_INACTIVE', 'This client is not active');

export const duplicateCode = () => new ConflictError('DUPLICATE', 'A client with this short code already exists', { fields: ['code'] });

export const duplicateGstin = () => new ConflictError('DUPLICATE', 'A client with this GSTIN already exists', { fields: ['gstin'] });

export const unknownState = () => new ConflictError('REFERENCE_MISSING', 'This state does not exist', { fields: ['stateCode'] });

export const unknownEstablishment = (field: 'pfEstablishmentId' | 'esiEstablishmentId') =>
  new ConflictError('REFERENCE_MISSING', 'This PF/ESI establishment does not exist or is inactive', { fields: [field] });

export const noDefaultEstablishment = (type: 'PF' | 'ESI') =>
  new RuleError('NO_DEFAULT_ESTABLISHMENT', `No default ${type} establishment is set; choose one for this client`);

/** M2-CLI-01 AC4 / M2-CLI-03 AC1. */
export const codeLocked = () =>
  new RuleError('CODE_LOCKED', 'The short code cannot be changed because payroll has run for this client', { fields: ['code'] });

export type DeploymentLoad = { siteId: string; siteCode: string; deployments: number };

/** M2-CLI-05 AC1: how many, and which sites to look at. */
export const hasActiveDeployments = (clientId: string, load: DeploymentLoad[]) => {
  const total = load.reduce((n, l) => n + l.deployments, 0);
  return new RuleError('ACTIVE_DEPLOYMENTS', `This client still has ${total} active deployment${total === 1 ? '' : 's'}. End them first.`, {
    activeDeployments: total,
    sites: load.map((l) => ({ id: l.siteId, code: l.siteCode, deployments: l.deployments, href: `/sites/${l.siteId}` })),
    href: `/clients/${clientId}`,
  });
};

export const alreadyInactive = () => new RuleError('ALREADY_INACTIVE', 'This client is already inactive');
export const alreadyActive = () => new RuleError('ALREADY_ACTIVE', 'This client is already active');

export const senderNeedsEmail = () =>
  new RuleError('SENDER_NEEDS_EMAIL', 'The attendance sender needs an email', { fields: ['email'] });
