// Seeds an empty, migrated database (run by `npm run seed:reset`, or alone
// with `npm run seed`). Deterministic: a fixed-seed RNG drives every "random"
// choice. All app rows go in one transaction; Better Auth identities first.
import { createHash } from 'node:crypto';
import type { Scalars } from '@prisma/orm-postgres/family-contract/types';
import { createAuth, createAuthPool } from '../src/auth/auth.ts';
import { BetterAuthIdentity } from '../src/auth/identity.ts';
import { config } from '../src/core/config.ts';
import type { Tx } from '../src/core/context.ts';
import { encrypt, KEY_VERSION, last4, lookupHmac } from '../src/lib/crypto.ts';
import { parseDate } from '../src/lib/dates.ts';
import type { Models } from '../src/prisma/contract.d.ts';
import { db } from '../src/prisma/db.ts';
import * as D from './data.ts';

// Seed rows are written with plain strings; branded column types (Varchar<N>,
// Numeric…) are relaxed here while field names stay type-checked.
type Loosen<T> = { [K in keyof T]: T[K] extends string ? string : T[K] extends string | null ? string | null : T[K] };
type Input<M> = Partial<Loosen<Scalars<M>>>;
const row = <M>(r: Input<M>) => r as never;

const date = (iso: string) => parseDate(iso);
const instant = (iso: string) => Temporal.Instant.from(iso.includes('T') ? iso : `${iso}T10:00:00+05:30`);
const paise = (rupees: number) => BigInt(Math.round(rupees * 100));
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** mulberry32: small, fast, deterministic. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type SeedResult = {
  users: Record<D.UserKey, { id: string; mobile: string }>;
  sites: Record<D.SiteCode, string>;
  counts: Record<string, number>;
};

export async function seed(): Promise<SeedResult> {
  const cfg = config();
  const pool = createAuthPool(cfg.DATABASE_URL);
  const auth = createAuth({
    config: cfg,
    logger: { error: console.error } as never,
    sms: { balancePaise: async () => null, sendOtp: async () => {}, sendTemplate: async () => ({ providerMsgId: null }) },
    otpGate: { decide: async () => 'UNKNOWN' as const },
    pool,
  });
  const identity = new BetterAuthIdentity({ auth });
  const authIds = {} as Record<D.UserKey, string>;
  for (const u of D.USERS) authIds[u.key] = (await identity.ensure(u.name, u.mobile)).authUserId;
  await pool.end();

  const result = await db.transaction((tx) => seedApp(tx, authIds));
  return result;
}

async function seedApp(tx: Tx, authIds: Record<D.UserKey, string>): Promise<SeedResult> {
  const o = tx.orm.app;
  const random = rng(20260930);
  const counts: Record<string, number> = {};
  const bump = (k: string, n = 1) => (counts[k] = (counts[k] ?? 0) + n);

  // --- IFSC lookup table (M3-BNK-01): a small slice of the Razorpay dataset ---
  for (const [ifsc, bankName, branch] of D.IFSC_ROWS) await o.IfscCode.create(row<Models.app_IfscCode>({ ifsc, bankName, branch }));
  bump('ifsc_codes');

  // --- Company, establishments, states, clients, sites ---------------------
  await o.Company.create(row<Models.app_Company>({ ...D.COMPANY, logoKey: null }));
  const pf = await o.Establishment.create(row<Models.app_Establishment>({ type: 'PF', ...D.ESTABLISHMENTS.pf, isDefault: true }));
  const esi = await o.Establishment.create(row<Models.app_Establishment>({ type: 'ESI', ...D.ESTABLISHMENTS.esi, isDefault: true }));
  for (const s of D.STATES) {
    await o.State.create(
      row<Models.app_State>({ code: s.code, name: s.name, ptApplies: s.ptApplies, lwfApplies: s.lwfApplies, rulesCompleteThrough: s.rulesCompleteThrough ? date(s.rulesCompleteThrough) : null }),
    );
  }
  const clients = {} as Record<D.ClientCode, string>;
  for (const c of D.CLIENTS) {
    const created = await o.Client.create(row<Models.app_Client>({ ...c, pfEstablishmentId: pf.id, esiEstablishmentId: esi.id, payPeriodStartDay: 1 }));
    clients[c.code] = created.id;
  }
  const sites = {} as Record<D.SiteCode, string>;
  for (const s of D.SITES) {
    const created = await o.Site.create(
      row<Models.app_Site>({ clientId: clients[s.client], code: s.code, name: s.name, address: s.address, stateCode: s.state, district: s.district, pincode: s.pincode, minWageZone: s.zone, wageSphere: 'STATE' }),
    );
    sites[s.code] = created.id;
  }
  bump('sites', D.SITES.length);

  // --- HQ users (employee-linked logins come after employees) --------------
  const users = {} as SeedResult['users'];
  const createUser = async (u: (typeof D.USERS)[number], createdBy: string | null, employeeId: string | null) => {
    const created = await o.User.create(
      row<Models.app_User>({
        name: u.name,
        mobile: u.mobile,
        email: u.email,
        role: u.role,
        status: 'ACTIVE',
        authUserId: authIds[u.key],
        employeeId,
        expiresAt: 'expiresAt' in u ? instant(u.expiresAt) : null,
        createdBy,
        updatedBy: createdBy,
      }),
    );
    users[u.key] = { id: created.id, mobile: u.mobile };
  };
  for (const u of D.USERS) if (!('employee' in u)) await createUser(u, u.key === 'admin' ? null : users.admin?.id ?? null, null);
  const admin = users.admin.id;
  const payroll = users.payroll.id;
  const hr = users.hr.id;

  // --- Counters, components, templates --------------------------------------
  const specs = D.employeeSpecs();
  await o.CodeCounter.create(row<Models.app_CodeCounter>({ name: 'EMPLOYEE', prefix: 'RS', width: 6, nextValue: BigInt(specs.length + 1) }));
  await o.CodeCounter.create(row<Models.app_CodeCounter>({ name: 'DAILY_WORKER', prefix: 'DW', width: 5, nextValue: BigInt(D.DAILY_WORKERS.length + 1) }));

  const components = {} as Record<string, string>;
  for (const c of D.COMPONENTS) {
    const created = await o.SalaryComponent.create(
      row<Models.app_SalaryComponent>({
        code: c.code,
        name: c.name,
        kind: c.kind,
        inWages: 'inWages' in c ? c.inWages : false,
        inEsiGross: 'inEsiGross' in c ? c.inEsiGross : false,
        inPfWages: 'inPfWages' in c ? c.inPfWages : false,
        taxable: c.kind === 'EARNING',
        displayOrder: c.order,
      }),
    );
    components[c.code] = created.id;
  }
  const templates = {} as Record<string, string>;
  for (const t of D.TEMPLATES) {
    const created = await o.SalaryTemplate.create(row<Models.app_SalaryTemplate>({ code: t.code, name: t.name, clientId: null, createdBy: payroll }));
    templates[t.code] = created.id;
    let order = 0;
    for (const l of t.lines) {
      await o.SalaryTemplateLine.create(
        row<Models.app_SalaryTemplateLine>({
          templateId: created.id,
          componentId: components[l.component],
          calc: l.calc,
          value: 'value' in l ? l.value : null,
          baseComponentId: 'base' in l ? components[l.base] : null,
          order: ++order,
        }),
      );
    }
  }

  // --- Statutory rules (maker: Payroll, checker: Admin) ---------------------
  for (const r of D.RULES) {
    await o.StatutoryRule.create(
      row<Models.app_StatutoryRule>({
        code: r.code,
        value: r.value,
        effectiveFrom: date(r.from),
        effectiveTo: r.to ? date(r.to) : null,
        note: r.note ?? null,
        createdBy: payroll,
        approvedBy: admin,
        approvedAt: instant('2026-09-01'),
      }),
    );
  }
  bump('statutory_rules', D.RULES.length);
  for (const s of D.PT_SLABS_MP) {
    await o.PtSlab.create(
      row<Models.app_PtSlab>({
        stateCode: 'MP',
        gender: null,
        fromPaise: paise(s.from),
        toPaise: s.to === null ? null : paise(s.to),
        amountPaise: paise(s.amount),
        monthOverride: 'monthOverride' in s ? s.monthOverride : null,
        effectiveFrom: date('2026-04-01'),
        note: D.VERIFY_NOTE,
        createdBy: admin,
      }),
    );
  }
  await o.LwfRate.create(
    row<Models.app_LwfRate>({
      stateCode: 'MP',
      eePaise: paise(D.LWF_MP.ee),
      erPaise: paise(D.LWF_MP.er),
      frequency: D.LWF_MP.frequency,
      deductMonths: [...D.LWF_MP.deductMonths],
      effectiveFrom: date('2026-04-01'),
      note: D.VERIFY_NOTE,
      createdBy: admin,
    }),
  );
  for (const m of D.MIN_WAGES_MP) {
    await o.MinWage.create(
      row<Models.app_MinWage>({
        stateCode: 'MP',
        zone: m.zone,
        skillLevel: m.skill,
        basicPaise: paise(m.basic),
        vdaPaise: paise(m.vda),
        per: 'MONTH',
        effectiveFrom: date(m.from),
        effectiveTo: 'to' in m ? date(m.to) : null,
        sourceUrl: null,
        note: D.VERIFY_NOTE,
        createdBy: admin,
      }),
    );
  }

  // --- Pay settings: company defaults (approved) + one pending change -------
  for (const s of D.PAY_SETTINGS) {
    await o.PaySetting.create(
      row<Models.app_PaySetting>({ scope: 'COMPANY', scopeId: null, key: s.key, value: s.value, effectiveFrom: date('2026-04-01'), createdBy: payroll, approvedBy: admin, approvedAt: instant('2026-04-01') }),
    );
  }
  // HR asks for a 26-day basis at Vindhya Hospital; waits for a checker.
  await o.PaySetting.create(
    row<Models.app_PaySetting>({ scope: 'CLIENT', scopeId: clients.VHC, key: 'PAID_DAYS_BASIS', value: '26', effectiveFrom: date('2026-10-01'), createdBy: hr }),
  );

  // --- Holidays ---------------------------------------------------------------
  // M14-HOL-01 AC2: the national days (2000..2100) come from the migration, not from here.
  const holidays = [] as { level: string; scopeKey: string | null; date: string; name: string }[];
  holidays.push({ level: 'CLIENT', scopeKey: clients[D.CLIENT_HOLIDAY.client], date: D.CLIENT_HOLIDAY.date, name: D.CLIENT_HOLIDAY.name });
  for (const h of holidays) {
    await o.Holiday.create(row<Models.app_Holiday>({ ...h, date: date(h.date), year: Number(h.date.slice(0, 4)), paid: true, optional: false, half: false, createdBy: admin }));
  }

  // --- Employees --------------------------------------------------------------
  const employees = {} as Record<string, { id: string; spec: D.EmployeeSpec }>;
  let i = 0;
  for (const spec of specs) {
    i++;
    const emp = await o.Employee.create(
      row<Models.app_Employee>({
        code: spec.code,
        legacyCode: spec.staffType === 'DEPLOYED' ? `OLD-${1000 + i}` : null,
        name: spec.name,
        dob: date(spec.dob),
        gender: spec.gender,
        mobile: spec.code === 'RS000001' ? '+919000000006' : spec.code === D.SUPERVISOR_CODES['SUP-A'] ? '+919000000010' : spec.code === D.SUPERVISOR_CODES['SUP-B'] ? '+919000000011' : `+9198${String(26000000 + i * 137).padStart(8, '0')}`,
        email: null,
        staffType: spec.staffType,
        designation: spec.designation,
        skillLevel: spec.skill,
        paymentMode: spec.pay,
        upiId: spec.pay === 'UPI' ? `${spec.name.split(' ')[0]!.toLowerCase()}${i}@upi` : null,
        status: spec.status ?? 'ACTIVE',
        joinDate: date(spec.joinDate),
        exitDate: spec.exitDate ? date(spec.exitDate) : null,
        language: 'hi',
        createdBy: hr,
        updatedBy: hr,
      }),
    );
    employees[spec.code] = { id: emp.id, spec };

    const pfMember = !spec.pfExempt;
    await o.EmployeeStatutory.create(
      row<Models.app_EmployeeStatutory>({
        employeeId: emp.id,
        uan: pfMember ? `1010${String(20000000 + i * 911).slice(0, 8)}` : null,
        pfMemberFrom: pfMember ? date(spec.joinDate) : null,
        pfExempt: !!spec.pfExempt,
        pfFullWages: !!spec.pfFullWages,
        esiIpNo: spec.esi ? `31${String(10000000 + i * 733).padStart(8, '0')}` : null,
        esiFrom: spec.esi ? date(spec.joinDate) : null,
        ptExempt: false,
        pan: null,
        updatedBy: hr,
      }),
    );

    if (spec.pay === 'BANK') {
      const account = `3${String(1000000000 + i * 104729).slice(0, 10)}`;
      await o.BankAccount.create(
        row<Models.app_BankAccount>({
          employeeId: emp.id,
          accountEnc: encrypt(account),
          accountLast4: last4(account),
          ifsc: i % 2 ? 'SBIN0030112' : 'PUNB0123400',
          holderName: spec.name,
          accountHmac: lookupHmac(account),
          accountType: 'SAVINGS' as never,
          bankName: i % 2 ? 'State Bank of India' : 'Punjab National Bank',
          branch: 'Main Branch',
          verifyStatus: 'VERIFIED' as never,
          bankReturnedName: spec.name,
          nameMatchScore: 100,
          verifiedAt: instant(spec.joinDate),
          verifyRef: `PENNY-${1000 + i}`,
          isPrimary: true,
          effectiveFrom: date(spec.joinDate),
          createdBy: hr,
          approvedBy: payroll,
          approvedAt: instant(spec.joinDate),
        }),
      );
      bump('bank_accounts');
    }

    const lines = D.STRUCTURES[spec.structure] as Record<string, number>;
    const gross = Object.values(lines).reduce((a, b) => a + b, 0);
    const structure = await o.EmployeeSalaryStructure.create(
      row<Models.app_EmployeeSalaryStructure>({
        employeeId: emp.id,
        templateId: templates[spec.template],
        monthlyGrossPaise: paise(gross),
        effectiveFrom: date(spec.joinDate < '2026-04-01' ? '2026-04-01' : spec.joinDate),
        effectiveTo: null,
        createdBy: hr,
        approvedBy: payroll,
        approvedAt: instant('2026-04-01'),
      }),
    );
    for (const [component, amount] of Object.entries(lines)) {
      await o.EmployeeSalaryLine.create(
        row<Models.app_EmployeeSalaryLine>({ structureId: structure.id, componentId: components[component], amountPaise: paise(amount) }),
      );
    }

    if (spec.site) {
      await o.Deployment.create(
        row<Models.app_Deployment>({
          employeeId: emp.id,
          siteId: sites[spec.site],
          designation: spec.designation,
          skillLevel: spec.skill,
          templateId: templates[spec.template],
          monthlyCtcPaise: paise(gross),
          kind: 'DEPLOY',
          reason: null,
          effectiveFrom: date(spec.joinDate),
          effectiveTo: spec.exitDate ? date(spec.exitDate) : null,
          createdBy: hr,
        }),
      );
    }


    if (spec.staffType === 'DEPLOYED') {
      const aadhaar = `8${String(31000000000 + i * 2_654_435).slice(0, 11)}`;
      await tx.orm.vault.AadhaarRecord.create(
        row<Models.vault_AadhaarRecord>({
          employeeId: emp.id,
          dailyWorkerId: null,
          aadhaarEnc: encrypt(aadhaar),
          keyVersion: KEY_VERSION,
          lookupHmac: lookupHmac(aadhaar),
          last4: last4(aadhaar),
          createdBy: hr,
        }),
      );
      await o.Consent.create(
        row<Models.app_Consent>({ subjectType: 'EMPLOYEE', subjectId: emp.id, purpose: 'AADHAAR_KYC', version: 'v1', givenAt: instant(spec.joinDate), createdBy: hr }),
      );
    }

    await o.EmployeeEvent.create(row<Models.app_EmployeeEvent>({ employeeId: emp.id, type: 'JOIN', date: date(spec.joinDate), reason: null, createdBy: hr }));
    if (spec.noticeDate) {
      await o.EmployeeEvent.create(row<Models.app_EmployeeEvent>({ employeeId: emp.id, type: 'NOTICE', date: date(spec.noticeDate), reason: 'Resigned; 30-day notice', createdBy: hr }));
    }
    if (spec.exitDate) {
      const exit = await o.EmployeeEvent.create(row<Models.app_EmployeeEvent>({ employeeId: emp.id, type: 'EXIT', date: date(spec.exitDate), reason: 'Resigned', createdBy: hr }));
      // Last working day Fri 25 Sep → Sat 26 (day 1), Sun off, Mon 28 (day 2).
      await o.FnfCase.create(
        row<Models.app_FnfCase>({ employeeId: emp.id, exitEventId: exit.id, lastWorkingDay: date(spec.exitDate), dueBy: date('2026-09-28'), status: 'OPEN', createdBy: payroll }),
      );
    }
  }
  bump('employees', specs.length);

  // --- Employee-linked logins and supervisor scopes ---------------------------
  for (const u of D.USERS) {
    if (!('employee' in u)) continue;
    const code = u.employee === 'SUP-A' || u.employee === 'SUP-B' ? D.SUPERVISOR_CODES[u.employee] : u.employee;
    await createUser(u, admin, employees[code]!.id);
  }
  for (const s of D.SCOPES) {
    await o.UserSiteScope.create(
      row<Models.app_UserSiteScope>({
        userId: users[s.user].id,
        siteId: sites[s.site],
        isPrimary: s.primary ?? false,
        effectiveFrom: date('2026-04-01'),
        effectiveTo: null,
        createdBy: hr,
        approvedBy: s.approved ? admin : null,
        approvedAt: s.approved ? instant('2026-04-01') : null,
      }),
    );
  }
  bump('user_site_scopes', D.SCOPES.length);

  // --- Leave types and opening balances ---------------------------------------
  const leaveTypes = {} as Record<string, string>;
  for (const l of D.LEAVE_TYPES) {
    const created = await o.LeaveType.create(row<Models.app_LeaveType>({ ...l, clientId: null }));
    leaveTypes[l.code] = created.id;
  }
  const ledger: Input<Models.app_LeaveLedger>[] = [];
  for (const { id, spec } of Object.values(employees)) {
    const el = spec.code === 'RS000005' ? 6 : Math.floor(random() * 12); // F&F case carries 6 EL (F1)
    for (const [code, days] of [['EL', el], ['CL', 3], ['SL', 2]] as const) {
      if (days > 0) ledger.push({ employeeId: id, leaveTypeId: leaveTypes[code], date: date('2026-04-01'), delta: days.toFixed(1), reason: 'ADJUST', note: 'Opening balance', createdBy: hr });
    }
  }

  // --- September 2026 attendance (accepted imports, one per client) ----------
  const imports = {} as Record<D.ClientCode, string>;
  for (const c of D.CLIENTS) {
    const imp = await o.AttendanceImport.create(
      row<Models.app_AttendanceImport>({
        clientId: clients[c.code],
        month: date('2026-09-01'),
        fileKey: `seed/attendance/${c.code}-2026-09.xlsx`,
        fileSha256: sha256(`${c.code}-2026-09`),
        status: 'ACCEPTED',
        counts: null,
        createdBy: payroll,
        approvedBy: admin,
        approvedAt: instant('2026-10-02'),
      }),
    );
    imports[c.code] = imp.id;
  }

  const days: Input<Models.app_AttendanceDay>[] = [];
  const holidayDay = Number(D.CLIENT_HOLIDAY.date.slice(-2));
  for (const { id, spec } of Object.values(employees)) {
    if (!spec.site) continue;
    const site = D.SITES.find((s) => s.code === spec.site)!;
    const scripted = spec.code in { RS000001: 1, RS000002: 1, RS000003: 1, RS000004: 1, RS000005: 1, RS000010: 1, RS000011: 1 };
    for (let d = 1; d <= D.SEPTEMBER.days; d++) {
      const day = Temporal.PlainDate.from({ year: 2026, month: 9, day: d });
      if (Temporal.PlainDate.compare(day, date(spec.joinDate)) < 0) continue;
      if (spec.exitDate && Temporal.PlainDate.compare(day, date(spec.exitDate)) > 0) continue;

      let code: string = 'P';
      let ot = '0';
      const r = random();
      if (day.dayOfWeek === 7) code = 'WO';
      else if (site.client === D.CLIENT_HOLIDAY.client && d === holidayDay) code = 'PH';
      else if (spec.absentDays?.includes(d)) code = 'A';
      else if (!scripted) {
        if (r < 0.04) code = 'A';
        else if (r < 0.06) code = 'HD';
        else if (r < 0.075) code = 'CL';
        else if (r < 0.085) code = 'SL';
        else if (r < 0.095) code = 'EL';
        else if (r < 0.2) ot = '2.00';
      }
      days.push({ employeeId: id, siteId: sites[spec.site], date: day, code, otHours: ot, importId: imports[site.client], source: 'IMPORT', updatedBy: payroll });
      if (code === 'EL' || code === 'CL' || code === 'SL') {
        ledger.push({ employeeId: id, leaveTypeId: leaveTypes[code], date: day, delta: '-1.0', reason: 'TAKEN', note: 'From September attendance', createdBy: hr });
      }
    }
  }
  const createdDays = await o.AttendanceDay.createAll(days as never[]);
  bump('attendance_days', days.length);
  await o.LeaveLedger.createAll(ledger as never[]);
  bump('leave_ledger', ledger.length);

  // A supervisor's pending correction (M1-SCP-06): A → P for E3's 22 Sep.
  const e3 = employees.RS000003!.id;
  const target = createdDays.find((x) => x.employeeId === e3 && x.date.toString() === '2026-09-22');
  if (!target) throw new Error('seed: E3 attendance for 22 Sep missing');
  await o.AttendanceCorrection.create(
    row<Models.app_AttendanceCorrection>({
      attendanceDayId: target.id,
      oldCode: 'A',
      newCode: 'P',
      oldOtHours: null,
      newOtHours: null,
      reason: 'Worked a double shift covering for a colleague; register entry missed',
      status: 'PENDING',
      createdBy: users.supA.id,
    }),
  );

  // --- Advances (₹2,000 and ₹6,000: the F1 / F2 amounts) ----------------------
  for (const [code, amount, instalment, given, mode] of [
    ['RS000007', 2_000, 1_000, '2026-09-05', 'CASH'],
    ['RS000015', 6_000, 2_000, '2026-08-20', 'BANK'],
  ] as const) {
    await o.Advance.create(
      row<Models.app_Advance>({
        employeeId: employees[code]!.id,
        amountPaise: paise(amount),
        instalmentPaise: paise(instalment),
        balancePaise: paise(amount),
        givenOn: date(given),
        mode,
        status: 'ACTIVE',
        createdBy: payroll,
        approvedBy: admin,
        approvedAt: instant(given),
      }),
    );
  }

  // --- Daily-wage workers and the closed cash release -------------------------
  const ujjain = sites[D.CASH_RELEASE.site];
  const supB = employees[D.SUPERVISOR_CODES['SUP-B']]!.id;
  const batchTotal = D.DAILY_WORKERS.reduce((sum, w) => sum + w.wage * w.days, 0);
  const batch = await o.DailyPayoutBatch.create(
    row<Models.app_DailyPayoutBatch>({
      siteId: ujjain,
      periodFrom: date('2026-09-01'),
      periodTo: date('2026-09-15'),
      totalPaise: paise(batchTotal),
      status: 'PAID',
      createdBy: payroll,
      approvedBy: admin,
      approvedAt: instant('2026-09-16'),
    }),
  );
  const release = await o.CashRelease.create(
    row<Models.app_CashRelease>({
      siteId: ujjain,
      runId: null,
      dailyPayoutBatchId: batch.id,
      supervisorId: supB,
      amountPaise: paise(batchTotal),
      releasedOn: date(D.CASH_RELEASE.releasedOn),
      status: 'CLOSED',
      closedAt: instant(D.CASH_RELEASE.returnedOn),
      createdBy: payroll,
      approvedBy: admin,
      approvedAt: instant(D.CASH_RELEASE.releasedOn),
    }),
  );

  let returned = 0;
  let w = 0;
  for (const spec of D.DAILY_WORKERS) {
    w++;
    const code = `DW${String(w).padStart(5, '0')}`;
    const dw = await o.DailyWorker.create(
      row<Models.app_DailyWorker>({
        code,
        name: spec.name,
        mobile: w % 3 === 0 ? null : `+9197${String(54000000 + w * 211).padStart(8, '0')}`,
        paymentMode: 'CASH',
        blocklisted: 'blocklisted' in spec,
        blocklistReason: 'blocklisted' in spec ? spec.blocklisted : null,
        convertedEmployeeId: null,
        createdBy: users.supB.id,
        updatedBy: users.supB.id,
      }),
    );
    if (spec.aadhaar) {
      await tx.orm.vault.AadhaarRecord.create(
        row<Models.vault_AadhaarRecord>({
          employeeId: null,
          dailyWorkerId: dw.id,
          aadhaarEnc: encrypt(spec.aadhaar),
          keyVersion: KEY_VERSION,
          lookupHmac: lookupHmac(spec.aadhaar),
          last4: last4(spec.aadhaar),
          createdBy: users.supB.id,
        }),
      );
      await o.Consent.create(row<Models.app_Consent>({ subjectType: 'DAILY_WORKER', subjectId: dw.id, purpose: 'AADHAAR_KYC', version: 'v1', givenAt: instant('2026-09-01'), createdBy: users.supB.id }));
    }

    // Worked days 1–15 Sep (Sundays skipped), all HQ-approved, in the batch.
    let worked = 0;
    for (let d = 1; worked < spec.days; d++) {
      const day = Temporal.PlainDate.from({ year: 2026, month: 9, day: d });
      if (day.dayOfWeek === 7) continue;
      worked++;
      await o.DailyWorkEntry.create(
        row<Models.app_DailyWorkEntry>({
          dailyWorkerId: dw.id,
          siteId: ujjain,
          workDate: day,
          dailyWagePaise: paise(spec.wage),
          otHours: '0',
          status: spec.paid ? 'PAID' : 'APPROVED',
          payoutBatchId: batch.id,
          createdBy: users.supB.id,
          approvedBy: payroll,
          approvedAt: instant('2026-09-16'),
        }),
      );
    }
    // Entries a supervisor logged after the batch: pending HQ approval.
    for (let d = 0; d < ('pendingDays' in spec ? spec.pendingDays : 0); d++) {
      await o.DailyWorkEntry.create(
        row<Models.app_DailyWorkEntry>({
          dailyWorkerId: dw.id,
          siteId: sites['CCW-GWL'],
          workDate: Temporal.PlainDate.from({ year: 2026, month: 9, day: 16 + d }),
          dailyWagePaise: paise(spec.wage),
          otHours: '0',
          status: 'PENDING',
          createdBy: users.supB.id,
        }),
      );
    }

    if (spec.days > 0) {
      const amount = paise(spec.wage * spec.days);
      await o.CashPayout.create(
        row<Models.app_CashPayout>(
          spec.paid
            ? {
                cashReleaseId: release.id,
                dailyWorkerId: dw.id,
                runLineId: null,
                amountPaise: amount,
                status: 'PAID_VERIFIED',
                paidOn: date(D.CASH_RELEASE.paidOn),
                ackPhotoKey: `seed/cash-ack/${code}.jpg`,
                markedBy: users.supB.id,
                verifiedBy: payroll,
                verifiedAt: instant(D.CASH_RELEASE.returnedOn),
              }
            : { cashReleaseId: release.id, dailyWorkerId: dw.id, runLineId: null, amountPaise: amount, status: 'UNPAID' },
        ),
      );
      if (!spec.paid) returned += spec.wage * spec.days;
    }
  }
  await o.CashReturn.create(
    row<Models.app_CashReturn>({ cashReleaseId: release.id, amountPaise: paise(returned), returnedOn: date(D.CASH_RELEASE.returnedOn), receivedBy: payroll }),
  );
  bump('daily_workers', D.DAILY_WORKERS.length);
  counts['cash_release_rupees'] = batchTotal;
  counts['cash_returned_rupees'] = returned;

  return { users, sites, counts };
}

if (import.meta.main) {
  const { counts } = await seed();
  console.log('seeded:', counts);
  await db.close();
}
