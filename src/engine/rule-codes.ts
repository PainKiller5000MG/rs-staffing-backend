// The statutory_rules codes: the single source (M7-RUL-01 names, plus
// PF_SPLIT_METHOD from Decision 8). The seed and the engine import from here;
// no other file writes a rule code as a string literal.
//
// Engine (this directory): pure functions only — no database, no I/O, no clock.
// Inputs are plain values (paise as bigint, Temporal dates, rates as percent
// strings) and every rounding goes through src/lib/money.ts with an explicit mode.

// Rule: any value set by law (rates, ceilings, limits, multipliers, deadlines)
// is a code here plus a dated statutory_rules row; the engine never hard-codes it.
export const RuleCode = {
  // --- PF (EPF & MP Act) ---
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
  // --- ESI ---
  ESI_EE_RATE: 'ESI_EE_RATE',
  ESI_ER_RATE: 'ESI_ER_RATE',
  ESI_COVERAGE_CEILING: 'ESI_COVERAGE_CEILING',
  ESI_COVERAGE_CEILING_PWD: 'ESI_COVERAGE_CEILING_PWD',
  /** Average daily wage at or below this pays no employee share (₹176). */
  ESI_EE_EXEMPT_DAILY_WAGE: 'ESI_EE_EXEMPT_DAILY_WAGE',
  /** Months that start a contribution period (April, October); coverage is decided per period. */
  ESI_CONTRIBUTION_PERIOD_START_MONTHS: 'ESI_CONTRIBUTION_PERIOD_START_MONTHS',
  // --- Code on Wages ---
  /** The 50% rule: excluded components above this share are added back to wages. */
  WAGE_RULE_EXCLUSION_CAP: 'WAGE_RULE_EXCLUSION_CAP',
  /** Non-statutory deductions may not exceed this share of earnings (s.18). */
  DEDUCTION_LIMIT: 'DEDUCTION_LIMIT',
  /** F&F is paid within this many working days of the last working day (s.17(2)). */
  FNF_DUE_WORKING_DAYS: 'FNF_DUE_WORKING_DAYS',
  // --- Working hours and overtime (OSH Code) ---
  OT_MULTIPLIER: 'OT_MULTIPLIER',
  NORMAL_HOURS_PER_DAY: 'NORMAL_HOURS_PER_DAY',
  NORMAL_HOURS_PER_WEEK: 'NORMAL_HOURS_PER_WEEK',
  /** Hours worked in a day, OT included, above this is flagged (DAY_OVER_LIMIT). */
  DAILY_HOURS_CAP: 'DAILY_HOURS_CAP',
  /** OT hours in a calendar quarter above this is flagged (QUARTER_OT_CAP). */
  OT_QUARTER_CAP_HOURS: 'OT_QUARTER_CAP_HOURS',
  // --- Gratuity (P1) ---
  GRATUITY_CEILING: 'GRATUITY_CEILING',
  GRATUITY_DUE_DAYS: 'GRATUITY_DUE_DAYS',
} as const;

export type RuleCode = (typeof RuleCode)[keyof typeof RuleCode];

export const RULE_CODES: readonly RuleCode[] = Object.values(RuleCode);

/** Shapes of statutory_rules.value per kind of rule (JSON: paise as strings). */
export type RuleValue =
  | { percent: string; minPaise?: string }
  | { paise: string }
  | { method: 'PRORATE_DAYS' }
  | { factor: string }
  | { hours: string }
  | { days: string }
  | { months: number[] };
