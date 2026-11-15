// The registry of pay-setting keys (M2-SET-01..03, 06, 10): which scopes may set a key, what
// values it takes, and its company-wide default. Pure: shared by the schema, the service and the
// payroll engine's resolver. A new key is one entry here plus a test.
export type Scope = 'COMPANY' | 'CLIENT' | 'SITE';

export type KeyDef = {
  scopes: readonly Scope[];
  /** Returns the normalised value, or null when the value isn't allowed. */
  parse: (raw: string) => string | null;
  /** Used when no row exists at any scope; null = nothing is assumed. */
  fallback: string | null;
  hint: string;
};

const oneOf = (...allowed: string[]) => (raw: string) => (allowed.includes(raw.trim().toUpperCase()) ? raw.trim().toUpperCase() : null);
const bool = (raw: string) => (raw.trim().toLowerCase() === 'true' ? 'true' : raw.trim().toLowerCase() === 'false' ? 'false' : null);
const intIn = (min: number, max: number) => (raw: string) => {
  const t = raw.trim();
  if (!/^\d{1,3}$/.test(t)) return null;
  const n = Number(t);
  return n >= min && n <= max ? String(n) : null;
};

export const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
/** "SUN", "SAT,SUN" (one or two distinct days, in week order) or "ROTATIONAL" (read from the attendance sheet). */
function weeklyOff(raw: string): string | null {
  const t = raw.trim().toUpperCase();
  if (t === 'ROTATIONAL') return t;
  const days = t.split(',').map((d) => d.trim());
  if (days.length > 2 || !days.every((d) => (WEEKDAYS as readonly string[]).includes(d)) || new Set(days).size !== days.length) return null;
  return [...days].sort((a, b) => WEEKDAYS.indexOf(a as never) - WEEKDAYS.indexOf(b as never)).join(',');
}

const ALL: readonly Scope[] = ['COMPANY', 'CLIENT', 'SITE'];
const COMPANY_CLIENT: readonly Scope[] = ['COMPANY', 'CLIENT'];
const CLIENT_ONLY: readonly Scope[] = ['CLIENT'];
/** 1..28 so the date exists in every month. */
const dayOfMonth = intIn(1, 28);

export const KEYS = {
  // M2-SET-02 / M2-SET-10 AC1
  PAID_DAYS_BASIS: { scopes: ALL, parse: oneOf('ACTUAL', '30', '26'), fallback: 'ACTUAL', hint: 'ACTUAL, 30 or 26' },
  OT_BASE: { scopes: ALL, parse: oneOf('STATUTORY', 'GROSS'), fallback: 'STATUTORY', hint: 'STATUTORY or GROSS' },
  OT_DIVISOR: { scopes: ALL, parse: oneOf('26', '30'), fallback: '26', hint: '26 or 30' },
  OT_HOURS_PER_DAY: { scopes: ALL, parse: intIn(1, 24), fallback: '8', hint: 'hours, 1 to 24' },
  // M2-SET-03
  WEEKLY_OFF_DAYS: { scopes: ALL, parse: weeklyOff, fallback: 'SUN', hint: 'e.g. SUN, SAT,SUN or ROTATIONAL' },
  WEEKLY_OFF_PAID: { scopes: ALL, parse: bool, fallback: 'true', hint: 'true or false' },
  // M2-SET-01: the pay period is the client's (one run has one period, M2-SET-10 AC3)
  PAY_PERIOD_START_DAY: { scopes: CLIENT_ONLY, parse: dayOfMonth, fallback: '1', hint: 'day of month the period starts, 1 to 28 (1 = calendar month)' },
  ATTENDANCE_DUE_DAY: { scopes: CLIENT_ONLY, parse: dayOfMonth, fallback: null, hint: 'day of the next month attendance is due, 1 to 28' },
  SALARY_PAY_DAY: { scopes: CLIENT_ONLY, parse: dayOfMonth, fallback: null, hint: 'day of the next month salary is paid, 1 to 28' },
  // M2-SET-06
  PF_APPLICABLE: { scopes: COMPANY_CLIENT, parse: bool, fallback: 'true', hint: 'true or false' },
  ESI_APPLICABLE: { scopes: COMPANY_CLIENT, parse: bool, fallback: 'true', hint: 'true or false' },
  PT_APPLICABLE: { scopes: COMPANY_CLIENT, parse: bool, fallback: 'true', hint: 'true or false' },
  LWF_APPLICABLE: { scopes: COMPANY_CLIENT, parse: bool, fallback: 'true', hint: 'true or false' },
  BONUS_APPLICABLE: { scopes: COMPANY_CLIENT, parse: bool, fallback: 'true', hint: 'true or false' },
  PF_WAGE_BASIS: { scopes: COMPANY_CLIENT, parse: oneOf('CEILING', 'FULL'), fallback: 'CEILING', hint: 'CEILING (restrict to the wage ceiling) or FULL' },
  // M2-SET-04: value is a salary template id; per designation the key is SALARY_TEMPLATE:<DESIGNATION>
  SALARY_TEMPLATE: {
    scopes: CLIENT_ONLY,
    parse: (raw) => (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw.trim()) ? raw.trim().toLowerCase() : null),
    fallback: null,
    hint: 'a salary template id',
  },
} as const satisfies Record<string, KeyDef>;

export type SettingKey = keyof typeof KEYS;
export const KEY_NAMES = Object.keys(KEYS) as SettingKey[];
export const isKey = (k: string): k is SettingKey => Object.hasOwn(KEYS, k);

/** The keys the resolved view shows (the template key has its own view). */
export const RESOLVED_KEYS = KEY_NAMES.filter((k) => k !== 'SALARY_TEMPLATE');

export const TEMPLATE_PREFIX = 'SALARY_TEMPLATE:';
export const DESIGNATION = /^[A-Z0-9][A-Z0-9 &./-]{0,39}$/;
/** "  site  supervisor " → "SITE SUPERVISOR". */
export const normaliseDesignation = (raw: string) => raw.trim().replace(/\s+/g, ' ').toUpperCase();
export const storedKey = (key: SettingKey, designation?: string) => (key === 'SALARY_TEMPLATE' && designation ? TEMPLATE_PREFIX + designation : key);
