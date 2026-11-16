// Deployment rules (M3-DEP-01..05). Throws AppErrors; never touches HTTP.
// A deployment row is one stretch of one employee at one site on one pay. A move or a pay revision
// closes the running row the day before and opens a new one, so history is never edited in place.
import { audit } from '../../core/audit.ts';
import type { Ctx } from '../../core/context.ts';
import { NotFoundError } from '../../core/errors.ts';
import { parseDate, today } from '../../lib/dates.ts';
import type { SettingsService } from '../settings/settings.service.ts';
import * as errors from './deployments.errors.ts';
import type { DeployEmployee, DeploySite, Deployment, DeploymentsRepository } from './deployments.repository.ts';
import type { DeployBody, ReviseBody, StaffTypeBody } from './deployments.schemas.ts';

type Deps = { deploymentsRepository: DeploymentsRepository; settingsService: SettingsService; ctx: Ctx };

export const INTERNAL_COST_CENTRE = 'RS Staffing';
/** Staff types that are RS Staffing's own people: no client deployment. */
export const INTERNAL_TYPES = ['SUPERVISOR', 'HQ'] as const;
/** A daily minimum wage is compared monthly on 26 paid days (open call in DECISIONS.md). */
export const MIN_WAGE_DAYS_PER_MONTH = 26n;

export const isInternal = (t: string) => (INTERNAL_TYPES as readonly string[]).includes(t);

const dayBefore = (d: string) => parseDate(d).subtract({ days: 1 }).toString();

export function statusOf(d: Pick<Deployment, 'effectiveFrom' | 'effectiveTo'>, onDate: string): 'SCHEDULED' | 'ACTIVE' | 'ENDED' {
  if (d.effectiveFrom > onDate) return 'SCHEDULED';
  if (d.effectiveTo != null && d.effectiveTo < onDate) return 'ENDED';
  return 'ACTIVE';
}

/** The row running on `day`, if any. */
export const coveringOn = (rows: Deployment[], day: string) =>
  rows.find((d) => d.effectiveFrom <= day && (d.effectiveTo == null || d.effectiveTo >= day)) ?? null;

export function monthlyMinimum(w: { basicPaise: bigint; vdaPaise: bigint; per: 'DAY' | 'MONTH' }): bigint {
  const total = w.basicPaise + w.vdaPaise;
  return w.per === 'DAY' ? total * MIN_WAGE_DAYS_PER_MONTH : total;
}

export class DeploymentsService {
  readonly #repo: DeploymentsRepository;
  readonly #settings: SettingsService;
  readonly #ctx: Ctx;

  constructor({ deploymentsRepository, settingsService, ctx }: Deps) {
    this.#repo = deploymentsRepository;
    this.#settings = settingsService;
    this.#ctx = ctx;
  }

  async #employee(id: string): Promise<DeployEmployee> {
    const e = await this.#repo.employee(id);
    if (!e) throw new NotFoundError('Employee');
    return e;
  }

  async #view(rows: Deployment[], onDate = today().toString()) {
    const sites = await this.#repo.sites(rows.map((r) => r.siteId));
    return rows.map((d) => {
      const s = sites.get(d.siteId)!;
      return {
        id: d.id,
        employeeId: d.employeeId,
        clientId: s.clientId,
        clientName: s.clientName,
        siteId: d.siteId,
        siteCode: s.code,
        siteName: s.name,
        designation: d.designation,
        skillLevel: d.skillLevel,
        templateId: d.templateId,
        monthlyCtcPaise: d.monthlyCtcPaise.toString(),
        kind: d.kind,
        reason: d.reason,
        effectiveFrom: d.effectiveFrom,
        effectiveTo: d.effectiveTo,
        status: statusOf(d, onDate),
      };
    });
  }

  /** M3-DEP-03: newest first; with `asOf` only the row running that day. */
  async list(employeeId: string, asOf?: string) {
    const e = await this.#employee(employeeId);
    const rows = await this.#repo.forEmployee(employeeId);
    const picked = asOf ? [coveringOn(rows, asOf)].filter((d): d is Deployment => d != null) : [...rows].reverse();
    return { employeeId, staffType: e.staffType, asOf: asOf ?? null, items: await this.#view(picked) };
  }

  /** M3-DEP-01 */
  async deploy(employeeId: string, body: DeployBody) {
    const e = await this.#employee(employeeId);
    this.#assertDeployable(e);
    const rows = await this.#repo.forEmployee(employeeId);
    const last = rows.at(-1);
    if (last && (last.effectiveTo == null || last.effectiveTo >= body.effectiveFrom)) throw errors.alreadyDeployed(last.effectiveFrom);
    const site = await this.#site(body.siteId);
    await this.#assertStart(e, body.effectiveFrom, [site.clientId]);
    const created = await this.#place(e, site, 'DEPLOY', null, body);
    await audit(this.#ctx, 'deployment.create', 'deployment', null, created, { entityId: created.id });
    return (await this.#view([created]))[0]!;
  }

  /** M3-DEP-02: end the running deployment the day before and start the next, in this one transaction. */
  async redeploy(employeeId: string, body: DeployBody) {
    const e = await this.#employee(employeeId);
    this.#assertDeployable(e);
    const current = (await this.#repo.forEmployee(employeeId)).find((d) => d.effectiveTo == null);
    if (!current) throw errors.notDeployed();
    if (body.effectiveFrom <= current.effectiveFrom) throw errors.dateNotAfterStart(current.effectiveFrom);
    if (current.siteId === body.siteId) throw errors.sameSite();
    const site = await this.#site(body.siteId);
    const from = await this.#repo.site(current.siteId);
    await this.#assertStart(e, body.effectiveFrom, [site.clientId, ...(from ? [from.clientId] : [])]);
    const ended = await this.#repo.end(current.id, dayBefore(body.effectiveFrom));
    const started = await this.#place(e, site, 'REDEPLOY', null, body);
    await audit(this.#ctx, 'deployment.redeploy', 'deployment', current, { ended, started }, { entityId: started.id });
    const [a, b] = await this.#view([ended, started]);
    return { ended: a!, started: b! };
  }

  /** M3-DEP-05: a new version of the running deployment with new pay from a date (may be back-dated: arrears are Module 7). */
  async revise(employeeId: string, body: ReviseBody) {
    const e = await this.#employee(employeeId);
    if (e.status === 'EXITED') throw errors.employeeExited();
    const current = (await this.#repo.forEmployee(employeeId)).find((d) => d.effectiveTo == null);
    if (!current) throw errors.notDeployed();
    if (body.effectiveFrom <= current.effectiveFrom) throw errors.dateNotAfterStart(current.effectiveFrom);
    const site = await this.#site(current.siteId);
    const templateId = body.templateId ?? current.templateId;
    await this.#assertTemplate(templateId, site);
    await this.#assertMinWage(site, current.skillLevel, body.monthlyCtcPaise, body.effectiveFrom);
    const ended = await this.#repo.end(current.id, dayBefore(body.effectiveFrom));
    const created = await this.#repo.create({
      employeeId,
      siteId: current.siteId,
      designation: current.designation,
      skillLevel: current.skillLevel,
      templateId,
      monthlyCtcPaise: body.monthlyCtcPaise,
      kind: 'REVISION',
      reason: body.reason,
      effectiveFrom: body.effectiveFrom,
      effectiveTo: null,
      createdBy: this.#ctx.user.id,
    });
    await audit(this.#ctx, 'deployment.revise', 'deployment', current, { ended, created }, { entityId: created.id });
    return (await this.#view([created]))[0]!;
  }

  /** M3-DEP-04 */
  async setStaffType(employeeId: string, body: StaffTypeBody) {
    const e = await this.#employee(employeeId);
    if (e.status === 'EXITED') throw errors.employeeExited();
    const day = today().toString();
    if (isInternal(body.staffType)) {
      const rows = await this.#repo.forEmployee(employeeId);
      if (rows.some((d) => d.effectiveTo == null || d.effectiveTo >= day)) throw errors.openDeployment();
    }
    if (body.staffType !== e.staffType) await this.#repo.setEmployeePosition(employeeId, { staffType: body.staffType }, this.#ctx.user.id);
    // every write route must leave an audit row, so a repeat of the same value is recorded too
    await audit(this.#ctx, 'employee.staff_type', 'employee', { staffType: e.staffType }, { staffType: body.staffType }, { entityId: employeeId });
    const internal = isInternal(body.staffType);
    let payrollCentre: string | null = INTERNAL_COST_CENTRE;
    if (!internal) {
      const cur = coveringOn(await this.#repo.forEmployee(employeeId), day);
      payrollCentre = cur ? (await this.#repo.site(cur.siteId))?.clientName ?? null : null;
    }
    return { id: employeeId, staffType: body.staffType, category: internal ? ('INTERNAL' as const) : ('DEPLOYED' as const), payrollCentre };
  }

  // --- helpers ---------------------------------------------------------

  #assertDeployable(e: DeployEmployee) {
    if (e.status === 'EXITED') throw errors.employeeExited();
    if (isInternal(e.staffType)) throw errors.internalNotDeployable();
  }

  /** Not before joining, and not inside a locked payroll run of the client(s) the move touches. */
  async #assertStart(e: DeployEmployee, from: string, clientIds: string[]) {
    if (e.joinDate && from < e.joinDate) throw errors.beforeJoining(e.joinDate);
    const locked = await this.#repo.lockedRunEnd(from, clientIds);
    if (locked) throw errors.payrollLocked(locked);
  }

  async #site(id: string): Promise<DeploySite> {
    const s = await this.#repo.site(id);
    if (!s) throw new NotFoundError('Site');
    if (s.clientStatus !== 'ACTIVE') throw errors.clientInactive();
    if (s.status !== 'ACTIVE') throw errors.siteInactive();
    return s;
  }

  async #assertTemplate(templateId: string | null, site: DeploySite) {
    if (!templateId) return;
    const t = await this.#repo.template(templateId);
    if (!t || t.status !== 'ACTIVE' || (t.clientId != null && t.clientId !== site.clientId)) throw errors.templateInvalid();
  }

  /** M3-DEP-01 AC4: monthly pay must reach the minimum wage for the site's state, zone and skill on that date. */
  async #assertMinWage(site: DeploySite, skill: DeployBody['skillLevel'], ctcPaise: bigint, from: string) {
    const w = site.zone ? await this.#repo.minWage(site.stateCode, site.zone, skill, from) : null;
    if (!w) throw errors.minWageNotConfigured(site.stateCode, site.zone, skill);
    const min = monthlyMinimum(w);
    if (ctcPaise < min) throw errors.belowMinimumWage(min, site.stateCode, w.zone, skill);
  }

  /** Salary template: the request's, else the client's default for the designation, else the client's default. */
  async #defaultTemplate(site: DeploySite, designation: string, from: string): Promise<string | null> {
    const d = await this.#settings.salaryDefaults(site.clientId, from);
    const own = d.designations.find((x) => x.designation.toLowerCase() === designation.toLowerCase());
    return own?.templateId ?? d.default?.templateId ?? null;
  }

  async #place(e: DeployEmployee, site: DeploySite, kind: 'DEPLOY' | 'REDEPLOY', reason: string | null, body: DeployBody): Promise<Deployment> {
    const templateId = body.templateId ?? (await this.#defaultTemplate(site, body.designation, body.effectiveFrom));
    await this.#assertTemplate(templateId, site);
    await this.#assertMinWage(site, body.skillLevel, body.monthlyCtcPaise, body.effectiveFrom);
    const created = await this.#repo.create({
      employeeId: e.id,
      siteId: site.id,
      designation: body.designation,
      skillLevel: body.skillLevel,
      templateId,
      monthlyCtcPaise: body.monthlyCtcPaise,
      kind,
      reason,
      effectiveFrom: body.effectiveFrom,
      effectiveTo: null,
      createdBy: this.#ctx.user.id,
    });
    await this.#repo.setEmployeePosition(e.id, { designation: body.designation, skillLevel: body.skillLevel }, this.#ctx.user.id);
    return created;
  }
}
