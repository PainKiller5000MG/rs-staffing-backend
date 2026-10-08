// The M1 permission matrix as data. GET /me returns a user's permission keys
// for the frontend's menus; controllers derive their route `roles` from the
// same table (rolesWith), so what /me advertises and what routes enforce
// can't drift apart.
//
// Scope is implied by role: SUPERVISOR permissions apply only to their
// approved sites, EMPLOYEE permissions only to their own record.
// ACCOUNTS (9 Oct): the Auditor's read set + run cost summary, and writes on
// payment batch status/UTR, cash returns, challan payment entry and advances
// (still maker-checker). Never: compute/lock runs, salary structures or
// rules, Aadhaar reveal.
import type { Role } from './roles.ts';

export const PERMISSIONS = [
  'users.read',
  'users.write',
  'sites.read',
  'sites.write',
  'employees.read',
  'employees.write',
  'bank.read',
  'bank.write',
  'bank.approve',
  'aadhaar.reveal',
  'daily_wage.read',
  'daily_wage.write',
  'daily_wage.approve',
  'attendance.read',
  'attendance.write',
  'leave.read',
  'leave.write',
  'leave.approve',
  'rules.read',
  'rules.write',
  'payroll.read',
  'payroll.write',
  'payroll.lock',
  'payslips.read',
  'payslips.write',
  'supervisor_payroll.read',
  'supervisor_payroll.write',
  'supervisor_payroll.approve',
  'compliance.read',
  'compliance.write',
  'compliance.export',
  'audit.read',
  'run_cost.read',
  'payments.read',
  'payments.write',
  'cash_returns.write',
  'challans.write',
  'advances.read',
  'advances.write',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const AUDITOR: Permission[] = [
  'sites.read',
  'employees.read',
  'bank.read',
  'daily_wage.read',
  'attendance.read',
  'leave.read',
  'rules.read',
  'payroll.read',
  'payslips.read',
  'supervisor_payroll.read',
  'compliance.read',
  'compliance.export',
  'audit.read',
  'run_cost.read',
];

const ACCOUNTS: Permission[] = [
  ...AUDITOR,
  'payments.read',
  'payments.write',
  'cash_returns.write',
  'challans.write',
  'advances.read',
  'advances.write',
];

const PAYROLL_HR: Permission[] = [
  'users.read',
  'sites.read',
  'sites.write',
  'employees.read',
  'employees.write',
  'bank.read',
  'bank.write',
  'aadhaar.reveal',
  'daily_wage.read',
  'daily_wage.write',
  'daily_wage.approve',
  'attendance.read',
  'attendance.write',
  'leave.read',
  'leave.write',
  'leave.approve',
  'rules.read',
  'rules.write',
  'payroll.read',
  'payroll.write',
  'payslips.read',
  'payslips.write',
  'supervisor_payroll.read',
  'supervisor_payroll.write',
  'compliance.read',
  'compliance.write',
  'compliance.export',
  'audit.read',
  'run_cost.read',
  'payments.read',
  'advances.read',
  'advances.write',
];

const MATRIX: Record<Role, readonly Permission[]> = {
  ADMIN: PERMISSIONS.filter((p) => p !== 'payslips.write'),
  PAYROLL: PAYROLL_HR,
  HR: PAYROLL_HR,
  ACCOUNTS,
  AUDITOR,
  SUPERVISOR: [
    'sites.read',
    'employees.read',
    'daily_wage.read',
    'daily_wage.write',
    'attendance.read',
    'attendance.write',
    'leave.read',
    'leave.write',
    'leave.approve',
    'supervisor_payroll.read',
  ],
  EMPLOYEE: ['employees.read', 'bank.read', 'attendance.read', 'leave.read', 'leave.write', 'payslips.read'],
};

export function permissionsOf(role: Role): Permission[] {
  return [...MATRIX[role]];
}

/** The roles holding a permission, for a route's `roles`. */
export function rolesWith(permission: Permission): Role[] {
  return (Object.keys(MATRIX) as Role[]).filter((r) => MATRIX[r].includes(permission));
}
