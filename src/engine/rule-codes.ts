// The statutory_rules codes: the single source (M7-RUL-01 names, plus
// PF_SPLIT_METHOD from Decision 8). The seed and the engine import from here;
// no other file writes a rule code as a string literal.
//
// Engine (this directory): pure functions only — no database, no I/O, no clock.
// Inputs are plain values (paise as bigint, Temporal dates, rates as percent
// strings) and every rounding goes through src/lib/money.ts with an explicit mode.

export const RuleCode = {
  PF_EE_RATE: 'PF_EE_RATE',
  PF_ER_RATE: 'PF_ER_RATE',
  /** ₹15,000 to 16 Sep 2026, ₹25,000 from 17 Sep 2026 (Decision 8). */
  EPF_WAGE_CEILING: 'EPF_WAGE_CEILING',
  EPS_RATE: 'EPS_RATE',
  /** Also the EDLI ceiling (M7-RUL-01: "same as EPS ceiling"). */
  EPS_WAGE_CEILING: 'EPS_WAGE_CEILING',
  EDLI_RATE: 'EDLI_RATE',
  /** value.minPaise: the per-establishment minimum (₹500). */
  PF_ADMIN_RATE: 'PF_ADMIN_RATE',
  /** How a month spanning a ceiling change is split (Decision 8; default PRORATE_DAYS). */
  PF_SPLIT_METHOD: 'PF_SPLIT_METHOD',
  ESI_EE_RATE: 'ESI_EE_RATE',
  ESI_ER_RATE: 'ESI_ER_RATE',
  ESI_COVERAGE_CEILING: 'ESI_COVERAGE_CEILING',
  ESI_COVERAGE_CEILING_PWD: 'ESI_COVERAGE_CEILING_PWD',
  /** Code on Wages 50% rule. */
  WAGE_RULE_EXCLUSION_CAP: 'WAGE_RULE_EXCLUSION_CAP',
} as const;

export type RuleCode = (typeof RuleCode)[keyof typeof RuleCode];

export const RULE_CODES: readonly RuleCode[] = Object.values(RuleCode);

/** Shapes of statutory_rules.value per kind of rule (JSON: paise as strings). */
export type RuleValue = { percent: string; minPaise?: string } | { paise: string } | { method: 'PRORATE_DAYS' };
