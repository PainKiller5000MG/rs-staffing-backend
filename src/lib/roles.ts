// Roles from the contract (enum Role) and the groupings routes declare.
import type { Models } from '../prisma/contract.d.ts';

export type Role = Models.app_User['role'];

export const ROLES = ['ADMIN', 'PAYROLL', 'HR', 'ACCOUNTS', 'AUDITOR', 'SUPERVISOR', 'EMPLOYEE'] as const satisfies readonly Role[];

/** HQ staff: everyone who works across all clients and sites. */
export const HQ = ['ADMIN', 'PAYROLL', 'HR', 'ACCOUNTS', 'AUDITOR'] as const satisfies readonly Role[];

/** HQ staff who may change master data (the Auditor is read-only). */
export const HQ_WRITERS = ['ADMIN', 'PAYROLL', 'HR'] as const satisfies readonly Role[];
