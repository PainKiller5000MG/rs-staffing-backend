import { expect, test } from 'vitest';
import type { SessionUser } from '../../src/core/context.ts';
import { requireRole, requireSiteScope } from '../../src/core/guards.ts';

const user = (role: SessionUser['role'], siteIds: string[] = []): SessionUser => ({
  id: 'u',
  authUserId: 'a',
  name: 'Test',
  role,
  employeeId: null,
  siteIds,
});

test('supervisors reach only their own sites; others look like missing sites (404)', () => {
  const sup = user('SUPERVISOR', ['s1', 's2', 's3']);
  expect(() => requireSiteScope(sup, ['s2'])).not.toThrow();
  expect(() => requireSiteScope(sup, ['s1', 's4'])).toThrow(
    expect.objectContaining({ status: 404, code: 'NOT_FOUND', message: 'Site not found' }),
  );
});

test('HQ roles reach every site; employees reach none through site routes', () => {
  expect(() => requireSiteScope(user('PAYROLL'), ['any'])).not.toThrow();
  expect(() => requireSiteScope(user('AUDITOR'), ['any'])).not.toThrow();
  expect(() => requireSiteScope(user('EMPLOYEE'), ['any'])).toThrow(expect.objectContaining({ status: 403 }));
});

test('requireRole', () => {
  expect(() => requireRole(user('HR'), ['ADMIN', 'HR'])).not.toThrow();
  expect(() => requireRole(user('AUDITOR'), ['ADMIN'])).toThrow(expect.objectContaining({ status: 403, code: 'FORBIDDEN' }));
});
