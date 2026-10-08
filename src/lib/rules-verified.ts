// A7 production guard: a payroll run may not lock while any rule row it used
// is still a placeholder (note starts "VERIFY"). Outside production it is a
// no-op, so development and test runs on seeded placeholders still lock.
// M8's lock step calls this with every rule row recorded in the run's snapshot.
import { RuleError } from '../core/errors.ts';

export type RuleTable = 'statutory_rules' | 'pt_slabs' | 'lwf_rates' | 'min_wages';
export type UsedRuleRow = { table: RuleTable; id: string; note: string | null };

export const isUnverified = (note: string | null) => note?.trimStart().startsWith('VERIFY') ?? false;

export function assertRulesVerified(rows: readonly UsedRuleRow[], nodeEnv: string): void {
  if (nodeEnv !== 'production') return;
  const unverified = rows.filter((r) => isUnverified(r.note));
  if (unverified.length === 0) return;
  throw new RuleError(
    'RULES_UNVERIFIED',
    'This run uses rule rows still marked VERIFY. Confirm them with the CA before locking.',
    { rules: unverified.map(({ table, id }) => ({ table, id })) },
  );
}
