// Every value list the API accepts or returns, so clients never hard-code
// them. Enums come straight from the emitted contract; states from the DB.
import contractJson from '../../prisma/contract.json' with { type: 'json' };
import { RULE_CODES } from '../../engine/rule-codes.ts';
import { PERMISSIONS } from '../../lib/permissions.ts';
import type { LookupsRepository } from './lookups.repository.ts';

export type Option = { value: string; label: string };

const LABELS: Record<string, Record<string, string>> = {
  DayCode: {
    P: 'Present',
    A: 'Absent',
    HD: 'Half day',
    WO: 'Weekly off',
    WOP: 'Weekly off worked',
    PH: 'Paid holiday',
    PHP: 'Paid holiday worked',
    EL: 'Earned leave',
    CL: 'Casual leave',
    SL: 'Sick leave',
  },
  Role: { ADMIN: 'HQ Admin', PAYROLL: 'HQ Payroll', HR: 'HQ HR', ACCOUNTS: 'HQ Accounts', AUDITOR: 'Auditor', SUPERVISOR: 'Supervisor', EMPLOYEE: 'Employee' },
  PaymentMode: { BANK: 'Bank transfer', UPI: 'UPI', CASH: 'Cash' },
  StaffType: { HQ: 'HQ staff' },
};

/** "ON_NOTICE" → "On notice" */
const humanize = (v: string) => v.charAt(0) + v.slice(1).toLowerCase().replaceAll('_', ' ');

type EnumDef = { members: { name: string; value: string }[] };
const ENUMS = (contractJson as unknown as { domain: { namespaces: { public: { enum: Record<string, EnumDef> } } } }).domain.namespaces.public.enum;

export function enumLookups(): Record<string, Option[]> {
  return Object.fromEntries(
    Object.entries(ENUMS)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, def]) => [name, def.members.map((m) => ({ value: m.value, label: LABELS[name]?.[m.value] ?? humanize(m.value) }))]),
  );
}

export class LookupsService {
  readonly #repo: LookupsRepository;

  constructor({ lookupsRepository }: { lookupsRepository: LookupsRepository }) {
    this.#repo = lookupsRepository;
  }

  async all() {
    const states = await this.#repo.states();
    return {
      enums: enumLookups(),
      states,
      permissions: [...PERMISSIONS],
      ruleCodes: [...RULE_CODES],
    };
  }
}
