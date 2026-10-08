import { RuleCode, type RuleValue } from '../src/engine/rule-codes.ts';

// Deterministic test data. Same input → same rows every run (ids aside, which
// the ORM generates). Amounts are rupees here and become paise in index.ts.
//
// MP PT / LWF / minimum-wage figures are PLACEHOLDERS marked VERIFY — they
// must be confirmed by the CA before any real payroll. Statutory PF/ESI rows
// follow the stories doc (M7-RUL-01) and Decision 8 (EPS/EDLI move to ₹25,000
// from 17 Sep 2026, September split by days).

export const COMPANY = {
  legalName: 'RS Staffing Services Pvt Ltd',
  address: 'Plot 12, Zone-II, M.P. Nagar, Bhopal, Madhya Pradesh 462011',
  pan: 'AAACR1234Q',
  tan: 'BPLR01234E',
};

// RS Staffing's own registrations (Decision 4). Codes are placeholders.
export const ESTABLISHMENTS = {
  pf: { code: 'MPBPL0012345000', name: 'RS Staffing Services Pvt Ltd (PF)', region: 'Bhopal' },
  esi: { code: '18000123450001001', name: 'RS Staffing Services Pvt Ltd (ESI)', region: 'Bhopal' },
};

// Every state and UT (ER plan, Wave 1 seed). Only MP has rules, through 2026-12-31;
// every other state has none, so a site there blocks a run (Decision 5) — Kota (RJ) tests it.
const STATE_NAMES: [string, string][] = [
  ['AN', 'Andaman and Nicobar Islands'], ['AP', 'Andhra Pradesh'], ['AR', 'Arunachal Pradesh'], ['AS', 'Assam'],
  ['BR', 'Bihar'], ['CH', 'Chandigarh'], ['CG', 'Chhattisgarh'], ['DH', 'Dadra and Nagar Haveli and Daman and Diu'],
  ['DL', 'Delhi'], ['GA', 'Goa'], ['GJ', 'Gujarat'], ['HR', 'Haryana'], ['HP', 'Himachal Pradesh'],
  ['JK', 'Jammu and Kashmir'], ['JH', 'Jharkhand'], ['KA', 'Karnataka'], ['KL', 'Kerala'], ['LA', 'Ladakh'],
  ['LD', 'Lakshadweep'], ['MP', 'Madhya Pradesh'], ['MH', 'Maharashtra'], ['MN', 'Manipur'], ['ML', 'Meghalaya'],
  ['MZ', 'Mizoram'], ['NL', 'Nagaland'], ['OD', 'Odisha'], ['PY', 'Puducherry'], ['PB', 'Punjab'], ['RJ', 'Rajasthan'],
  ['SK', 'Sikkim'], ['TN', 'Tamil Nadu'], ['TS', 'Telangana'], ['TR', 'Tripura'], ['UP', 'Uttar Pradesh'],
  ['UK', 'Uttarakhand'], ['WB', 'West Bengal'],
];

export const STATES = STATE_NAMES.map(([code, name]) =>
  code === 'MP'
    ? { code, name, ptApplies: true, lwfApplies: true, rulesCompleteThrough: '2026-12-31' as string | null }
    : { code, name, ptApplies: false, lwfApplies: false, rulesCompleteThrough: null as string | null },
);

export const CLIENTS = [
  { code: 'NTX', name: 'Narmada Textiles Pvt Ltd', gstin: '23AABCN1234F1Z5', billingAddress: 'Industrial Area, Govindpura, Bhopal' },
  { code: 'VHC', name: 'Vindhya Hospital & Care', gstin: '23AACCV5678K1Z2', billingAddress: 'AB Road, Indore' },
  { code: 'CCW', name: 'Chambal Cement Works Ltd', gstin: '23AADCC9012M1Z8', billingAddress: 'Malanpur Industrial Area, Gwalior' },
] as const;

export type ClientCode = (typeof CLIENTS)[number]['code'];

export const SITES = [
  { code: 'NTX-BPL', client: 'NTX', name: 'Narmada Textiles — Bhopal Mill', address: 'Govindpura, Bhopal', state: 'MP', zone: 'A' },
  { code: 'NTX-MDP', client: 'NTX', name: 'Narmada Textiles — Mandideep Unit', address: 'Mandideep, Raisen', state: 'MP', zone: 'B' },
  { code: 'VHC-IDR', client: 'VHC', name: 'Vindhya Hospital — Indore', address: 'AB Road, Indore', state: 'MP', zone: 'A' },
  { code: 'VHC-UJN', client: 'VHC', name: 'Vindhya Hospital — Ujjain', address: 'Freeganj, Ujjain', state: 'MP', zone: 'B' },
  { code: 'CCW-GWL', client: 'CCW', name: 'Chambal Cement — Gwalior Works', address: 'Malanpur, Gwalior', state: 'MP', zone: 'B' },
  // Rajasthan has no rules seeded: tests the missing-rules gate (M7-CAL-08, Decision 5).
  { code: 'CCW-KOT', client: 'CCW', name: 'Chambal Cement — Kota Depot', address: 'Industrial Area, Kota', state: 'RJ', zone: null },
] as const;

export type SiteCode = (typeof SITES)[number]['code'];

/** Login users. Mobiles 9000000001–06 for HQ + one employee; supervisors 9000000010/11. */
export const USERS = [
  { key: 'admin', mobile: '+919000000001', name: 'Asha Verma', email: 'admin@rsstaffing.test', role: 'ADMIN' },
  { key: 'payroll', mobile: '+919000000002', name: 'Pradeep Jain', email: 'payroll@rsstaffing.test', role: 'PAYROLL' },
  { key: 'hr', mobile: '+919000000003', name: 'Neha Sharma', email: 'hr@rsstaffing.test', role: 'HR' },
  { key: 'accounts', mobile: '+919000000004', name: 'Rakesh Gupta', email: 'accounts@rsstaffing.test', role: 'ACCOUNTS' },
  // Outside auditor whose access ends with the audit (M1-USR-09).
  { key: 'auditor', mobile: '+919000000005', name: 'CA Meera Iyer', email: 'audit@rsstaffing.test', role: 'AUDITOR', expiresAt: '2026-12-31T23:59:59+05:30' },
  { key: 'employee', mobile: '+919000000006', name: 'Ramesh Yadav', email: null, role: 'EMPLOYEE', employee: 'RS000001' },
  { key: 'supA', mobile: '+919000000010', name: 'Suresh Patel', email: null, role: 'SUPERVISOR', employee: 'SUP-A' },
  { key: 'supB', mobile: '+919000000011', name: 'Mahesh Thakur', email: null, role: 'SUPERVISOR', employee: 'SUP-B' },
] as const;

export type UserKey = (typeof USERS)[number]['key'];

/** Supervisor reach (approved). Supervisor A covers exactly three sites. */
export const SCOPES: { user: UserKey; site: SiteCode; approved: boolean }[] = [
  { user: 'supA', site: 'NTX-BPL', approved: true },
  { user: 'supA', site: 'NTX-MDP', approved: true },
  { user: 'supA', site: 'VHC-IDR', approved: true },
  { user: 'supB', site: 'VHC-UJN', approved: true },
  { user: 'supB', site: 'CCW-GWL', approved: true },
  { user: 'supB', site: 'CCW-KOT', approved: true },
  // Pending: assigned by HR, awaiting a different HQ user's approval (M1-SCP-06).
  { user: 'supB', site: 'NTX-BPL', approved: false },
];

// ---------------------------------------------------------------------------
// Salary structures (₹/month). E1–E5 match the M7 worked examples.
// ---------------------------------------------------------------------------
export const STRUCTURES = {
  E1: { BASIC: 7_500, HRA: 3_750, SPECIAL: 3_750 }, // 15,000
  E2: { BASIC: 6_000, HRA: 8_000, SPECIAL: 6_000 }, // 20,000, 50% add-back
  E4: { BASIC: 30_000, HRA: 12_000, SPECIAL: 8_000 }, // 50,000, above both ceilings
  E5: { BASIC: 11_500, HRA: 5_750, SPECIAL: 5_750 }, // 23,000, above ESI ceiling
  MW12: { BASIC: 8_000, HRA: 2_500, SPECIAL: 1_500 }, // 12,000
  MW13: { BASIC: 8_500, HRA: 3_000, SPECIAL: 1_500 }, // 13,000
  NM18: { BASIC: 9_000, HRA: 4_500, SPECIAL: 4_500 }, // 18,000
  NM21: { BASIC: 10_500, HRA: 5_250, SPECIAL: 5_250 }, // 21,000
  NM24: { BASIC: 12_000, HRA: 6_000, SPECIAL: 6_000 }, // 24,000
  HQ22: { BASIC: 11_000, HRA: 4_400, CONV: 1_600, SPECIAL: 5_000 }, // 22,000
  HQ28: { BASIC: 14_000, HRA: 5_600, CONV: 1_600, SPECIAL: 6_800 }, // 28,000
} as const;

export type StructureKey = keyof typeof STRUCTURES;

export type EmployeeSpec = {
  code: string; // RS000001… (SUP-A / SUP-B are resolved to codes in order)
  name: string;
  gender: 'MALE' | 'FEMALE';
  dob: string;
  staffType: 'DEPLOYED' | 'SUPERVISOR' | 'HQ';
  designation: string;
  skill: 'UNSKILLED' | 'SEMI_SKILLED' | 'SKILLED' | 'HIGHLY_SKILLED';
  site: SiteCode | null;
  structure: StructureKey;
  template: 'MIN_WAGE' | 'CONSOLIDATED' | 'HQ_STAFF';
  pay: 'BANK' | 'UPI' | 'CASH';
  joinDate: string;
  status?: 'ACTIVE' | 'ON_NOTICE' | 'EXITED';
  exitDate?: string;
  noticeDate?: string;
  pfExempt?: boolean;
  pfFullWages?: boolean;
  esi?: boolean; // has an ESI IP number (covered this period)
  /** Fixed absence days in September (E3-style LOP). */
  absentDays?: number[];
  note?: string;
};

const FIRST = ['Ramesh', 'Sunita', 'Ajay', 'Kavita', 'Vijay', 'Pooja', 'Rahul', 'Anita', 'Sanjay', 'Rekha', 'Manoj', 'Geeta', 'Deepak', 'Seema', 'Arun', 'Lata', 'Mukesh', 'Usha', 'Dinesh', 'Kiran', 'Rajesh', 'Meena', 'Sunil', 'Radha', 'Anil', 'Shobha', 'Prakash', 'Asha', 'Gopal', 'Nirmala', 'Santosh', 'Pushpa', 'Raju', 'Kamla', 'Vinod', 'Saroj', 'Ravi', 'Mamta', 'Ashok', 'Laxmi', 'Kailash', 'Savita', 'Naresh'];
const LAST = ['Yadav', 'Kushwaha', 'Malviya', 'Rajput', 'Patel', 'Sahu', 'Verma', 'Ahirwar', 'Chouhan', 'Lodhi', 'Jatav', 'Meena', 'Prajapati', 'Solanki'];
const FEMALE = new Set(['Sunita', 'Kavita', 'Pooja', 'Anita', 'Rekha', 'Geeta', 'Seema', 'Lata', 'Usha', 'Kiran', 'Meena', 'Radha', 'Shobha', 'Asha', 'Nirmala', 'Pushpa', 'Kamla', 'Saroj', 'Mamta', 'Laxmi', 'Savita']);

const DESIGNATIONS: Record<string, string> = {
  'NTX-BPL': 'Machine Helper',
  'NTX-MDP': 'Loader',
  'VHC-IDR': 'Housekeeping Attendant',
  'VHC-UJN': 'Ward Attendant',
  'CCW-GWL': 'Security Guard',
  'CCW-KOT': 'Security Guard',
};

/** Deployed headcount per site (43 in all). */
const HEADCOUNT: [SiteCode, number][] = [
  ['NTX-BPL', 9],
  ['NTX-MDP', 7],
  ['VHC-IDR', 8],
  ['VHC-UJN', 6],
  ['CCW-GWL', 7],
  ['CCW-KOT', 6],
];

/**
 * Named test cases, by the RS code they land on. Every other employee is a
 * plain MIN_WAGE worker on ₹12,000 or ₹13,000, paid through the bank.
 */
const CASES: Record<string, Partial<EmployeeSpec>> = {
  RS000001: { name: 'Ramesh Yadav', gender: 'MALE', structure: 'E1', note: 'E1 full month; has the EMPLOYEE login 9000000006' },
  RS000002: { structure: 'E2', template: 'CONSOLIDATED', note: 'E2: 50% add-back' },
  RS000003: { structure: 'E1', absentDays: [3, 4, 9, 10, 11, 15, 22, 23], note: 'E3: 8 LOP days' },
  RS000004: { structure: 'E1', joinDate: '2026-09-21', note: 'joined 21 Sep (part month)' },
  RS000010: { structure: 'E5', designation: 'Shift Incharge', skill: 'SKILLED', esi: false, note: 'above the ESI ceiling' },
  RS000011: { structure: 'E4', designation: 'Maintenance Engineer', skill: 'HIGHLY_SKILLED', esi: false, pfFullWages: true, note: 'PF on full wages opt-in (para 26(6))' },
  RS000012: { structure: 'NM18', pfExempt: true, note: 'newly mandatory PF from 17 Sep 2026 (M7-EPF-02)' },
  RS000013: { structure: 'NM21', pfExempt: true, note: 'newly mandatory PF from 17 Sep 2026 (M7-EPF-02)' },
  RS000014: { structure: 'NM24', pfExempt: true, esi: false, note: 'newly mandatory PF from 17 Sep 2026 (M7-EPF-02)' },
  RS000005: { structure: 'E1', status: 'EXITED', exitDate: '2026-09-25', note: 'exited 25 Sep, F&F open (due 28 Sep)' },
  RS000006: { structure: 'E1', status: 'ON_NOTICE', noticeDate: '2026-09-15', note: 'on notice from 15 Sep' },
};

/** Cash-paid workers (M8-CASH), on supervisor B's Ujjain site and two at Gwalior. */
const CASH = new Set(['RS000025', 'RS000026', 'RS000027', 'RS000028', 'RS000030', 'RS000031']);
const UPI = new Set(['RS000017', 'RS000020', 'RS000035']);

/** Builds the 43 deployed employees, then the 2 supervisors and 2 HQ staff (47 in all). */
export function employeeSpecs(): EmployeeSpec[] {
  const specs: EmployeeSpec[] = [];
  let n = 0;
  for (const [site, count] of HEADCOUNT) {
    for (let i = 0; i < count; i++) {
      n++;
      const code = `RS${String(n).padStart(6, '0')}`;
      const first = FIRST[(n * 7) % FIRST.length]!;
      const last = LAST[(n * 5) % LAST.length]!;
      const base: EmployeeSpec = {
        code,
        name: `${first} ${last}`,
        gender: FEMALE.has(first) ? 'FEMALE' : 'MALE',
        dob: `${1975 + (n % 25)}-${String((n % 12) + 1).padStart(2, '0')}-${String((n % 27) + 1).padStart(2, '0')}`,
        staffType: 'DEPLOYED',
        designation: DESIGNATIONS[site]!,
        skill: site.startsWith('CCW') ? 'SEMI_SKILLED' : 'UNSKILLED',
        site,
        structure: n % 3 === 0 ? 'MW13' : 'MW12',
        template: 'MIN_WAGE',
        pay: CASH.has(code) ? 'CASH' : UPI.has(code) ? 'UPI' : 'BANK',
        joinDate: `${2021 + (n % 5)}-${String((n % 12) + 1).padStart(2, '0')}-01`,
        esi: true,
      };
      specs.push({ ...base, ...CASES[code] });
    }
  }

  // Supervisors are RS Staffing's own staff (paid by RS Staffing, not clients).
  specs.push(
    { code: 'SUP-A', name: 'Suresh Patel', gender: 'MALE', dob: '1984-06-12', staffType: 'SUPERVISOR', designation: 'Field Supervisor', skill: 'SKILLED', site: null, structure: 'HQ22', template: 'HQ_STAFF', pay: 'BANK', joinDate: '2019-04-01', esi: false },
    { code: 'SUP-B', name: 'Mahesh Thakur', gender: 'MALE', dob: '1987-02-03', staffType: 'SUPERVISOR', designation: 'Field Supervisor', skill: 'SKILLED', site: null, structure: 'HQ22', template: 'HQ_STAFF', pay: 'BANK', joinDate: '2020-08-17', esi: false },
    { code: 'HQ-1', name: 'Priya Saxena', gender: 'FEMALE', dob: '1991-11-21', staffType: 'HQ', designation: 'Payroll Executive', skill: 'SKILLED', site: null, structure: 'HQ28', template: 'HQ_STAFF', pay: 'BANK', joinDate: '2022-01-10', esi: false },
    { code: 'HQ-2', name: 'Imran Qureshi', gender: 'MALE', dob: '1993-05-30', staffType: 'HQ', designation: 'Accounts Assistant', skill: 'SKILLED', site: null, structure: 'HQ22', template: 'HQ_STAFF', pay: 'BANK', joinDate: '2023-07-03', esi: false },
  );

  // Non-deployed staff take the next RS codes; codes are never reused.
  let next = n;
  for (const s of specs) if (!s.code.startsWith('RS')) s.code = `RS${String(++next).padStart(6, '0')}`;
  return specs;
}

/** RS code the supervisor placeholders resolve to (see employeeSpecs). */
export const SUPERVISOR_CODES = { 'SUP-A': 'RS000044', 'SUP-B': 'RS000045' } as const;

// ---------------------------------------------------------------------------
// Statutory rules (M7-RUL-01). Value is JSON: { percent } or { paise }.
// ---------------------------------------------------------------------------
type Rule = { code: RuleCode; value: RuleValue; from: string; to?: string; note?: string };

const R = RuleCode;
export const RULES: Rule[] = [
  { code: R.PF_EE_RATE, value: { percent: '12' }, from: '2014-09-01' },
  { code: R.PF_ER_RATE, value: { percent: '12' }, from: '2014-09-01' },
  { code: R.EPF_WAGE_CEILING, value: { paise: '1500000' }, from: '2014-09-01', to: '2026-09-16' },
  { code: R.EPF_WAGE_CEILING, value: { paise: '2500000' }, from: '2026-09-17', note: 'Decision 8: ₹25,000 from 17 Sep 2026' },
  { code: R.EPS_RATE, value: { percent: '8.33' }, from: '2014-09-01' },
  { code: R.EPS_WAGE_CEILING, value: { paise: '1500000' }, from: '2014-09-01', to: '2026-09-16' },
  { code: R.EPS_WAGE_CEILING, value: { paise: '2500000' }, from: '2026-09-17', note: 'Decision 8: EPS and EDLI move to ₹25,000 too' },
  { code: R.EDLI_RATE, value: { percent: '0.5' }, from: '2014-09-01' },
  { code: R.PF_ADMIN_RATE, value: { percent: '0.5', minPaise: '50000' }, from: '2014-09-01', note: 'min ₹500 per establishment' },
  { code: R.PF_SPLIT_METHOD, value: { method: 'PRORATE_DAYS' }, from: '2026-09-01', to: '2026-09-30', note: 'Decision 8 default; change when EPFO issues its circular' },
  { code: R.ESI_EE_RATE, value: { percent: '0.75' }, from: '2019-07-01' },
  { code: R.ESI_ER_RATE, value: { percent: '3.25' }, from: '2019-07-01' },
  { code: R.ESI_COVERAGE_CEILING, value: { paise: '2100000' }, from: '2017-01-01' },
  { code: R.ESI_COVERAGE_CEILING_PWD, value: { paise: '2500000' }, from: '2017-01-01' },
  { code: R.ESI_EE_EXEMPT_DAILY_WAGE, value: { paise: '17600' }, from: '2019-07-01', note: '≤ ₹176/day pays no employee share' },
  { code: R.ESI_CONTRIBUTION_PERIOD_START_MONTHS, value: { months: [4, 10] }, from: '2017-01-01', note: 'Apr–Sep and Oct–Mar' },
  { code: R.WAGE_RULE_EXCLUSION_CAP, value: { percent: '50' }, from: '2025-11-21' },
  { code: R.DEDUCTION_LIMIT, value: { percent: '50' }, from: '2025-11-21', note: 'Code on Wages s.18' },
  { code: R.FNF_DUE_WORKING_DAYS, value: { days: '2' }, from: '2025-11-21', note: 'Code on Wages s.17(2)' },
  { code: R.OT_MULTIPLIER, value: { factor: '2' }, from: '2025-11-21', note: 'OSH Code: twice the ordinary rate' },
  { code: R.NORMAL_HOURS_PER_DAY, value: { hours: '8' }, from: '2025-11-21' },
  { code: R.NORMAL_HOURS_PER_WEEK, value: { hours: '48' }, from: '2025-11-21' },
  { code: R.DAILY_HOURS_CAP, value: { hours: '12' }, from: '2025-11-21', note: 'VERIFY: 12 h incl. OT per the stories (M13); confirm with the CA' },
  { code: R.OT_QUARTER_CAP_HOURS, value: { hours: '144' }, from: '2025-11-21', note: 'VERIFY: pending final OSH rules (M13)' },
  { code: R.GRATUITY_CEILING, value: { paise: '200000000' }, from: '2018-03-29', note: '₹20,00,000' },
  { code: R.GRATUITY_DUE_DAYS, value: { days: '30' }, from: '2025-11-21' },
];

/** Note on every placeholder rule row; blocks a production payroll lock (A7). */
export const VERIFY_NOTE = 'VERIFY: placeholder figure, confirm with the CA before go-live';

// MP placeholders — VERIFY with the CA (Section 9). Monthly gross slabs in ₹.
export const PT_SLABS_MP = [
  { from: 0, to: 18_750, amount: 0 },
  { from: 18_751, to: 25_000, amount: 125 },
  { from: 25_001, to: 33_333, amount: 167 },
  { from: 33_334, to: null, amount: 208 },
  { from: 33_334, to: null, amount: 212, monthOverride: 3 },
];

export const LWF_MP = { ee: 10, er: 30, frequency: 'HALF_YEARLY', deductMonths: [6, 12] } as const;

/** Minimum wages (₹/month). The Oct 2025 rows are older than 7 months on purpose (flag test). */
export const MIN_WAGES_MP = [
  { zone: 'A', skill: 'UNSKILLED', basic: 11_800, vda: 0, from: '2025-10-01', to: '2026-03-31' },
  { zone: 'A', skill: 'UNSKILLED', basic: 12_150, vda: 0, from: '2026-04-01' },
  { zone: 'A', skill: 'SEMI_SKILLED', basic: 13_100, vda: 0, from: '2026-04-01' },
  { zone: 'A', skill: 'SKILLED', basic: 14_700, vda: 0, from: '2026-04-01' },
  { zone: 'A', skill: 'HIGHLY_SKILLED', basic: 16_200, vda: 0, from: '2026-04-01' },
  { zone: 'B', skill: 'UNSKILLED', basic: 11_400, vda: 0, from: '2026-04-01' },
  { zone: 'B', skill: 'SEMI_SKILLED', basic: 12_300, vda: 0, from: '2026-04-01' },
  { zone: 'B', skill: 'SKILLED', basic: 13_800, vda: 0, from: '2026-04-01' },
  { zone: 'B', skill: 'HIGHLY_SKILLED', basic: 15_300, vda: 0, from: '2026-04-01' },
] as const;

/** Company-level pay settings (Decisions 9, 10), resolved site → client → company. */
export const PAY_SETTINGS = [
  { key: 'PAID_DAYS_BASIS', value: 'ACTUAL' },
  { key: 'OT_BASE', value: 'STATUTORY' },
  { key: 'OT_DIVISOR', value: '26' },
  { key: 'OT_HOURS_PER_DAY', value: '8' },
  { key: 'WEEKLY_OFF_PAID', value: 'true' },
];

// M7-STR-01: the locked component library.
export const COMPONENTS = [
  { code: 'BASIC', name: 'Basic', kind: 'EARNING', inWages: true, inEsiGross: true, inPfWages: true, order: 10 },
  { code: 'DA', name: 'Dearness Allowance', kind: 'EARNING', inWages: true, inEsiGross: true, inPfWages: true, order: 20 },
  { code: 'HRA', name: 'House Rent Allowance', kind: 'EARNING', inWages: false, inEsiGross: true, inPfWages: false, order: 30 },
  { code: 'CONV', name: 'Conveyance', kind: 'EARNING', inWages: false, inEsiGross: true, inPfWages: false, order: 40 },
  { code: 'SPECIAL', name: 'Special Allowance', kind: 'EARNING', inWages: false, inEsiGross: true, inPfWages: false, order: 50 },
  { code: 'OT', name: 'Overtime', kind: 'EARNING', inWages: false, inEsiGross: true, inPfWages: false, order: 60 },
  { code: 'ARREARS', name: 'Arrears', kind: 'EARNING', inWages: false, inEsiGross: true, inPfWages: false, order: 70 },
  { code: 'PF_EE', name: 'PF (employee)', kind: 'DEDUCTION', order: 110 },
  { code: 'ESI_EE', name: 'ESI (employee)', kind: 'DEDUCTION', order: 120 },
  { code: 'PT', name: 'Professional Tax', kind: 'DEDUCTION', order: 130 },
  { code: 'LWF_EE', name: 'LWF (employee)', kind: 'DEDUCTION', order: 140 },
  { code: 'ADVANCE_RECOVERY', name: 'Advance recovery', kind: 'DEDUCTION', order: 150 },
  { code: 'PF_ER_EPF', name: 'PF (employer, EPF)', kind: 'EMPLOYER', order: 210 },
  { code: 'PF_ER_EPS', name: 'Pension (EPS)', kind: 'EMPLOYER', order: 220 },
  { code: 'EDLI', name: 'EDLI', kind: 'EMPLOYER', order: 230 },
  { code: 'PF_ADMIN', name: 'PF admin charges', kind: 'EMPLOYER', order: 240 },
  { code: 'ESI_ER', name: 'ESI (employer)', kind: 'EMPLOYER', order: 250 },
  { code: 'LWF_ER', name: 'LWF (employer)', kind: 'EMPLOYER', order: 260 },
] as const;

// M7-TPL-01: three standard templates. value: percent for PCT_OF, paise for FIXED.
export const TEMPLATES = [
  {
    code: 'MIN_WAGE',
    name: 'Minimum-wage based',
    lines: [
      { component: 'BASIC', calc: 'MIN_WAGE' },
      { component: 'HRA', calc: 'PCT_OF', value: '25', base: 'BASIC' },
      { component: 'SPECIAL', calc: 'BALANCE' },
    ],
  },
  {
    code: 'CONSOLIDATED',
    name: 'Consolidated gross',
    lines: [
      { component: 'BASIC', calc: 'PCT_OF', value: '50' },
      { component: 'HRA', calc: 'PCT_OF', value: '25' },
      { component: 'SPECIAL', calc: 'BALANCE' },
    ],
  },
  {
    code: 'HQ_STAFF',
    name: 'HQ staff',
    lines: [
      { component: 'BASIC', calc: 'PCT_OF', value: '50' },
      { component: 'HRA', calc: 'PCT_OF', value: '40', base: 'BASIC' },
      { component: 'CONV', calc: 'FIXED', value: '160000' },
      { component: 'SPECIAL', calc: 'BALANCE' },
    ],
  },
] as const;

export const LEAVE_TYPES = [
  { code: 'EL', name: 'Earned Leave', accrualRule: { per: 20, days: 1, eligibleAfterDays: 180 }, carryForwardMax: '30', encashable: true },
  { code: 'CL', name: 'Casual Leave', accrualRule: { perYear: 7 }, carryForwardMax: null, encashable: false },
  { code: 'SL', name: 'Sick Leave', accrualRule: { perYear: 7 }, carryForwardMax: null, encashable: false },
] as const;

// ---------------------------------------------------------------------------
// Daily-wage workers and the closed cash release (M4, M8-CASH).
// Release ₹16,550 = ₹13,000 paid (4 workers) + ₹3,550 returned (1 unpaid).
// ---------------------------------------------------------------------------
export const DAILY_WORKERS = [
  { name: 'Bhagwan Das', wage: 500, days: 7, paid: true, aadhaar: '934512781201' },
  { name: 'Kamal Singh', wage: 500, days: 7, paid: true, aadhaar: '934512781202' },
  { name: 'Phoolwati Bai', wage: 500, days: 6, paid: true, aadhaar: '934512781203' },
  { name: 'Hiralal Kewat', wage: 500, days: 6, paid: true, aadhaar: '934512781204' },
  { name: 'Shankar Lal (electrician)', wage: 710, days: 5, paid: false, aadhaar: '934512781205' },
  { name: 'Rambai Ahirwar', wage: 500, days: 0, paid: false, aadhaar: '934512781206', pendingDays: 3 },
  { name: 'Gudda Kushwaha', wage: 500, days: 0, paid: false, aadhaar: null, pendingDays: 2 },
  { name: 'Babulal Jatav', wage: 500, days: 0, paid: false, aadhaar: '934512781208', blocklisted: 'Theft reported at site, Aug 2026' },
] as const;

export const CASH_RELEASE = { site: 'VHC-UJN' as SiteCode, releasedOn: '2026-09-17', paidOn: '2026-09-18', returnedOn: '2026-09-20' };

export const SEPTEMBER = { year: 2026, month: 9, days: 30 };
/** Client holiday: Vishwakarma Puja at Narmada Textiles. */
export const CLIENT_HOLIDAY = { client: 'NTX' as ClientCode, date: '2026-09-17', name: 'Vishwakarma Puja' };
