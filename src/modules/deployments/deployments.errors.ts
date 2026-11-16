// Business-rule errors for deployments, salary revisions and staff type (M3-DEP).
import { ConflictError, RuleError } from '../../core/errors.ts';

export const employeeExited = () => new RuleError('EMPLOYEE_EXITED', 'This employee has exited; deployments can no longer change');
export const siteInactive = () => new RuleError('SITE_INACTIVE', 'This site is not active');
export const clientInactive = () => new RuleError('CLIENT_INACTIVE', 'This site\'s client is not active');
export const internalNotDeployable = () =>
  new RuleError('INTERNAL_NOT_DEPLOYABLE', 'Internal staff (supervisors, HQ) are not deployed to a client; change the staff type first');
export const beforeJoining = (joinDate: string) => new RuleError('BEFORE_JOINING', `A deployment cannot start before the joining date ${joinDate}`);
export const alreadyDeployed = (from: string) =>
  new ConflictError('ALREADY_DEPLOYED', `This employee already has a deployment running on or after this date (from ${from}); redeploy them instead`);
export const notDeployed = () => new RuleError('NOT_DEPLOYED', 'This employee has no running deployment');
export const sameSite = () => new RuleError('SAME_SITE', 'The employee is already at this site; use a salary revision to change pay');
export const dateNotAfterStart = (start: string) =>
  new RuleError('DATE_NOT_AFTER_START', `The date must be after the current deployment started on ${start}`);
export const payrollLocked = (end: string) =>
  new RuleError('PAYROLL_LOCKED', `Payroll is locked up to ${end}; a move cannot start on or before that date`, { lockedThrough: end });
export const templateInvalid = () => new RuleError('TEMPLATE_INVALID', 'The salary template does not exist, is inactive or belongs to another client');
export const minWageNotConfigured = (state: string, zone: string | null, skill: string) =>
  new RuleError('MIN_WAGE_NOT_CONFIGURED', `No minimum wage is set up for ${state} ${zone ?? '(site has no zone)'} ${skill}; set the site zone or add the rate first`, {
    state,
    zone,
    skill,
  });
export const belowMinimumWage = (minimumPaise: bigint, state: string, zone: string, skill: string) =>
  new RuleError('BELOW_MINIMUM_WAGE', `Monthly pay is below the minimum wage of ${minimumPaise} paise for ${state} ${zone} ${skill}`, {
    minimumMonthlyPaise: minimumPaise.toString(),
    state,
    zone,
    skill,
  });
export const openDeployment = () => new RuleError('OPEN_DEPLOYMENT', 'End the employee\'s deployment before marking them as internal staff');
