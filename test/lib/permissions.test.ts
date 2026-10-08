import { expect, test } from 'vitest';
import { permissionsOf, rolesWith } from '../../src/lib/permissions.ts';

test('ACCOUNTS: auditor reads + run cost, writes on payments, cash returns, challans, advances', () => {
  const accounts = permissionsOf('ACCOUNTS');
  expect(accounts).toEqual(expect.arrayContaining([...permissionsOf('AUDITOR'), 'run_cost.read', 'payments.write', 'cash_returns.write', 'challans.write', 'advances.write']));
  for (const never of ['payroll.write', 'payroll.lock', 'rules.write', 'aadhaar.reveal', 'users.write'] as const) {
    expect(accounts).not.toContain(never);
  }
});

test('auditor is read-only; only Admin locks runs', () => {
  expect(permissionsOf('AUDITOR').every((p) => p.endsWith('.read') || p === 'compliance.export')).toBe(true);
  expect(rolesWith('payroll.lock')).toEqual(['ADMIN']);
  expect(rolesWith('aadhaar.reveal').sort()).toEqual(['ADMIN', 'HR', 'PAYROLL']);
});
