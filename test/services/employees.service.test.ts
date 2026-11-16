// Employee rules with fakes (no database): age, masking, duplicate offers.
import { describe, expect, test } from 'vitest';
import { EmployeesService, profileOf } from '../../src/modules/employees/employees.service.ts';
import type { Employee } from '../../src/modules/employees/employees.repository.ts';
import { maskAadhaar, maskBankAccount, maskDob, maskPan } from '../../src/lib/mask.ts';

const person = (over: Record<string, unknown> = {}) => ({ id: 'e1', code: 'RS000001', name: 'Old Hand', status: 'ACTIVE', ...over });

function service(repo: Record<string, unknown> = {}) {
  const fakeRepo = {
    stateExists: async () => true,
    byMobile: async () => [],
    byPan: async () => [],
    byUan: async () => [],
    byNameAndDob: async () => [],
    dailyWorkersByMobile: async () => [],
    aadhaarOwner: async () => null,
    nextCode: async () => 'RS000100',
    create: async (d: Record<string, unknown>) => ({ id: 'new', ...d }),
    setPan: async () => {},
    ...repo,
  };
  const ctx = { user: { id: 'u1', role: 'HR', siteIds: [] }, executor: {}, audited: false };
  const deps = {
    employeesRepository: fakeRepo,
    usersRepository: { findByMobile: async () => null, create: async () => ({}) },
    identity: { ensure: async () => ({ authUserId: 'a', created: false }), remove: async () => {} },
    storage: {},
    ctx,
    events: { emit() {} },
  };
  return new EmployeesService(deps as never);
}

const body = (over: Record<string, unknown> = {}) =>
  ({ name: 'A B', dob: '2000-06-15', gender: 'MALE', mobile: '+919000099999', joinDate: '2018-06-15', ...over }) as never;

describe('age at joining (M3-PRF-01 AC5)', () => {
  test('M3-PRF-01 AC5: the day before the 18th birthday is refused, the birthday is allowed, a leap-day birth waits for 1 March', async () => {
    const s = service();
    await expect(s.create(body({ joinDate: '2018-06-14' }))).rejects.toMatchObject({ code: 'UNDERAGE', status: 422 });
    // allowed: it gets past the age check and fails later only because the fake ctx cannot audit
    await expect(s.create(body({ joinDate: '2018-06-15' }))).rejects.not.toMatchObject({ code: 'UNDERAGE' });
    await expect(s.create(body({ dob: '2000-02-29', joinDate: '2018-02-28' }))).rejects.toMatchObject({ code: 'UNDERAGE' });
    await expect(s.create(body({ dob: '2000-02-29', joinDate: '2018-03-01' }))).rejects.not.toMatchObject({ code: 'UNDERAGE' });
  });

  test('M3-PRF-01 AC5: a date of birth today or later is refused as a validation error', async () => {
    await expect(service().create(body({ dob: '2999-01-01' }))).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});

describe('masking (M3-PRF-04 AC2, M3-PRF-07 AC2)', () => {
  test('M3-PRF-07 AC2: Aadhaar, PAN, bank account and DOB use the story formats', () => {
    expect(maskAadhaar('1234')).toBe('XXXX XXXX 1234');
    expect(maskBankAccount('4321')).toBe('XXXXXX4321');
    expect(maskPan('ABCPE1234F')).toBe('ABXXXXX4F');
    expect(maskDob('1992-03-05')).toBe('1992-XX-XX');
  });

  test('M3-PRF-04 AC2: profileOf never contains the full PAN, DOB or Aadhaar', () => {
    const e = { id: 'e', code: 'RS000007', name: 'N', dob: '1992-03-05', gender: 'MALE', mobile: '+919000000000', staffType: 'DEPLOYED', designation: '', skillLevel: 'UNSKILLED', status: 'DRAFT', language: 'en', photoKey: null, aadhaarLast4: '9876', createdAt: 'x' } as unknown as Employee;
    const p = profileOf(e, 'ABCPE1234F');
    expect(p).toMatchObject({ pan: 'ABXXXXX4F', aadhaar: 'XXXX XXXX 9876', dob: '1992-XX-XX', designation: null, hasPhoto: false });
    expect(JSON.stringify(p)).not.toMatch(/ABCPE1234F|1992-03-05/);
  });
});

describe('duplicate offers (M3-PRF-06)', () => {
  test('M3-PRF-06 AC1 AC3: a PAN match blocks; an exited match carries the REHIRE offer, a live one none', async () => {
    const live = await service({ byPan: async () => [person()] }).checkDuplicates({ pan: 'ABCPE1234F' } as never);
    expect(live.matches).toMatchObject([{ field: 'pan', blocking: true, offer: null }]);
    const exited = await service({ byPan: async () => [person({ status: 'EXITED' })] }).checkDuplicates({ pan: 'ABCPE1234F' } as never);
    expect(exited.matches).toMatchObject([{ offer: 'REHIRE', blocking: true }]);
    await expect(service({ byPan: async () => [person()] }).create(body({ pan: 'ABCPE1234F' }))).rejects.toMatchObject({ code: 'DUPLICATE_PERSON', status: 409 });
  });

  test('M3-PRF-06 AC2: name + DOB alone never blocks, and is not repeated for a person already matched on a hard field', async () => {
    const s = service({ byNameAndDob: async () => [person()], byMobile: async () => [person()] });
    const { matches } = await s.checkDuplicates({ name: 'Old Hand', dob: '1990-01-01', mobile: '+919000000001' } as never);
    expect(matches).toMatchObject([{ field: 'mobile', blocking: true }]);
    const soft = await service({ byNameAndDob: async () => [person()] }).checkDuplicates({ name: 'Old Hand', dob: '1990-01-01' } as never);
    expect(soft.matches).toMatchObject([{ field: 'name_dob', blocking: false }]);
  });

  test('M3-PRF-06 AC4: a daily-wage worker is offered CONVERT_DAILY_WORKER and links to the worker', async () => {
    const dw = { id: 'd1', code: 'DW00001', name: 'Day Worker', status: null };
    const { matches } = await service({ dailyWorkersByMobile: async () => [dw] }).checkDuplicates({ mobile: '+919000000002' } as never);
    expect(matches).toMatchObject([{ kind: 'DAILY_WORKER', offer: 'CONVERT_DAILY_WORKER', link: '/daily-workers/d1', blocking: true }]);
  });
});
