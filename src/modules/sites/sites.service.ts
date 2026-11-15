// Site rules (M2-SIT-01..08). Throws AppErrors; never touches HTTP or the ORM
// directly. audit() on every write.
import { audit } from '../../core/audit.ts';
import type { Ctx } from '../../core/context.ts';
import { NotFoundError, ValidationError } from '../../core/errors.ts';
import { today } from '../../lib/dates.ts';
import * as clientErrors from '../clients/clients.errors.ts';
import * as errors from './sites.errors.ts';
import type { Assignment, Candidate, Site, SiteFields, SitesRepository } from './sites.repository.ts';
import { ImportSiteRow, type AssignSupervisorBody, type CreateSiteBody, type ImportSitesBody, type ListSitesQuery, type UpdateSiteBody } from './sites.schemas.ts';

type Deps = { sitesRepository: SitesRepository; ctx: Ctx };
type RowError = { path: string; message: string };

/**
 * What goes into the audit log. The audit layer drops any key named `code`
 * (it hides OTP codes), so the site code is logged as `siteCode`.
 */
const auditView = ({ code, ...rest }: Site) => ({ siteCode: code, ...rest });

export const assignmentStatus = (a: Pick<Assignment, 'endedAt' | 'approvedBy'>) => (a.endedAt ? ('ENDED' as const) : a.approvedBy ? ('ACTIVE' as const) : ('PENDING' as const));

export class SitesService {
  readonly #repo: SitesRepository;
  readonly #ctx: Ctx;

  constructor({ sitesRepository, ctx }: Deps) {
    this.#repo = sitesRepository;
    this.#ctx = ctx;
  }

  /** HQ sees every site; a supervisor sees only their approved, current scopes. */
  get #reach(): string[] | undefined {
    return this.#ctx.user.role === 'SUPERVISOR' ? this.#ctx.user.siteIds : undefined;
  }

  async get(id: string) {
    return this.#mustFind(id);
  }

  /** M2-SIT-04: filters, search, headcount and current primary supervisor on every row. */
  async list(query: ListSitesQuery) {
    const day = today();
    let ids = this.#reach;
    if (query.supervisorId) {
      const theirs = await this.#repo.siteIdsOfSupervisor(query.supervisorId, day);
      ids = ids ? ids.filter((id) => theirs.includes(id)) : theirs;
    }
    const rows = ids?.length === 0 ? [] : await this.#repo.list({ ...query, limit: query.limit + 1, ids });
    const page = rows.slice(0, query.limit);
    const siteIds = page.map((s) => s.id);

    const headcount = new Map<string, Set<string>>();
    for (const d of await this.#repo.deployments(siteIds, day)) {
      if (!headcount.has(d.siteId)) headcount.set(d.siteId, new Set());
      headcount.get(d.siteId)!.add(d.employeeId);
    }
    const primary = new Map<string, { userId: string; name: string }>();
    for (const a of await this.#repo.currentAssignments(siteIds, day)) {
      if (a.isPrimary) primary.set(a.siteId, { userId: a.userId, name: a.name });
    }
    return {
      items: page.map((s) => ({ ...s, activeHeadcount: headcount.get(s.id)?.size ?? 0, primarySupervisor: primary.get(s.id) ?? null })),
      nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  /** M2-SIT-01, M2-SIT-02. */
  async create(body: CreateSiteBody) {
    const site = await this.#insert(body);
    await audit(this.#ctx, 'site.create', 'site', null, auditView(site));
    return site;
  }

  /** M2-SIT-03, M2-SIT-02. */
  async update(id: string, body: UpdateSiteBody) {
    const before = await this.#mustFind(id);
    if (before.status !== 'ACTIVE') throw errors.siteClosed();

    if (body.stateCode !== undefined && body.stateCode !== before.stateCode) {
      if (!(await this.#repo.stateExists(body.stateCode))) throw errors.unknownState();
      if (await this.#repo.hasPayrollRun(id)) throw errors.stateLocked();
    }
    // The body alone can't see the stored values: lat and lng must stay a pair.
    const lat = body.lat !== undefined ? body.lat : before.lat;
    const lng = body.lng !== undefined ? body.lng : before.lng;
    if ((lat == null) !== (lng == null)) {
      throw new ValidationError('Invalid request', [
        { path: lat == null ? 'lat' : 'lng', message: 'Give both latitude and longitude, or neither' },
      ]);
    }

    const { name, stateCode, district, pincode, address, minWageZone, sphere, inchargeName, inchargePhone, shiftStart, shiftEnd } = body;
    const after = await this.#repo.update(id, {
      name, stateCode, district, pincode, address, minWageZone, sphere, lat: body.lat, lng: body.lng, inchargeName, inchargePhone, shiftStart, shiftEnd,
      updatedBy: this.#ctx.user.id,
    });
    await audit(this.#ctx, 'site.update', 'site', auditView(before), auditView(after));
    return after;
  }

  /**
   * M2-SIT-05. History and past payroll stay readable: only the status changes
   * and open supervisor assignments end today.
   */
  async close(id: string) {
    const before = await this.#mustFind(id);
    if (before.status === 'INACTIVE') throw errors.alreadyClosed();

    const day = today();
    const open = await this.#repo.deployments([id], day, true);
    if (open.length > 0) {
      const people = await this.#repo.employees([...new Set(open.map((d) => d.employeeId))]);
      const listed = open.slice(0, 50).map((d) => ({
        employeeId: d.employeeId,
        employeeCode: people.get(d.employeeId)?.code ?? '',
        employeeName: people.get(d.employeeId)?.name ?? '',
        effectiveFrom: d.effectiveFrom.toString(),
        effectiveTo: d.effectiveTo ? d.effectiveTo.toString() : null,
      }));
      throw errors.hasActiveDeployments(id, open.length, listed);
    }

    const ended: string[] = [];
    for (const a of await this.#repo.liveAssignments(id, day)) {
      // A future-dated assignment ends on its own start day (a one-day row), never before it starts.
      const from = Temporal.PlainDate.from(a.effectiveFrom.toString());
      await this.#repo.endAssignment(a.id, this.#ctx.user.id, Temporal.PlainDate.compare(day, from) < 0 ? from : day);
      ended.push(a.id);
    }
    const after = await this.#repo.update(id, { status: 'INACTIVE', updatedBy: this.#ctx.user.id });
    await audit(this.#ctx, 'site.close', 'site', auditView(before), { ...auditView(after), endedAssignments: ended });
    return after;
  }

  // --- supervisors (M2-SIT-06) ---------------------------------------------

  async listSupervisors(siteId: string) {
    await this.#mustFind(siteId);
    const rows = await this.#repo.assignmentsOf(siteId);
    return { items: rows.map(toSupervisorDto) };
  }

  /**
   * Maker: records a pending assignment. It grants nothing until someone else
   * approves it at /site-scopes/{id}/approve; approving a primary ends the
   * previous primary the day before (M2-SIT-06 AC3).
   */
  async assignSupervisor(siteId: string, body: AssignSupervisorBody) {
    const site = await this.#mustFind(siteId);
    if (site.status !== 'ACTIVE') throw errors.siteClosed();
    const candidate = await this.#repo.candidate(body.userId);
    if (!candidate) throw new NotFoundError('User');
    assertAssignable(candidate);

    const assignment = await this.#repo.createAssignment({
      userId: body.userId,
      siteId,
      isPrimary: body.role === 'PRIMARY',
      effectiveFrom: body.effectiveFrom ?? today().toString(),
      effectiveTo: body.effectiveTo ?? null,
      createdBy: this.#ctx.user.id,
    });
    const named = { ...assignment, name: candidate.name };
    await audit(this.#ctx, 'site_supervisor.assign', 'site_supervisor', null, named);
    return toSupervisorDto(named);
  }

  /** M2-SIT-07. */
  async mySites() {
    const rows = await this.#repo.mySites(this.#ctx.user.id, today());
    const names = await this.#repo.clientNames([...new Set(rows.map((r) => r.site.clientId))]);
    return {
      items: rows
        .map(({ isPrimary, site }) => ({
          siteId: site.id,
          code: site.code,
          name: site.name,
          clientId: site.clientId,
          clientName: names.get(site.clientId) ?? '',
          address: site.address,
          district: site.district,
          shiftStart: site.shiftStart,
          shiftEnd: site.shiftEnd,
          role: isPrimary ? ('PRIMARY' as const) : ('BACKUP' as const),
        }))
        .sort((a, b) => a.code.localeCompare(b.code)),
    };
  }

  // --- bulk import (M2-SIT-08) ---------------------------------------------

  /** Each row is checked on its own; valid rows are saved even if others fail. */
  async importMany({ rows }: ImportSitesBody) {
    const results: { row: number; status: 'CREATED' | 'REJECTED'; id: string | null; errors: RowError[] }[] = [];
    const seen = new Set<string>();

    for (const [i, raw] of rows.entries()) {
      const row = i + 1;
      const reject = (errs: RowError[]) => results.push({ row, status: 'REJECTED', id: null, errors: errs });
      const parsed = ImportSiteRow.safeParse(raw);
      if (!parsed.success) {
        reject(parsed.error.issues.map((e) => ({ path: e.path.join('.'), message: e.message })));
        continue;
      }
      const { clientCode, primarySupervisorEmployeeCode, ...body } = parsed.data;
      const problems: RowError[] = [];
      const client = await this.#repo.clientByCode(clientCode);
      if (!client) problems.push({ path: 'clientCode', message: 'Unknown client short code' });
      else if (client.status !== 'ACTIVE') problems.push({ path: 'clientCode', message: 'This client is not active' });
      if (seen.has(body.code) || (await this.#repo.findByCode(body.code))) problems.push({ path: 'code', message: 'Duplicate site code' });
      if (!(await this.#repo.stateExists(body.stateCode))) problems.push({ path: 'stateCode', message: 'Unknown state' });
      let supervisorUserId: string | null = null;
      if (primarySupervisorEmployeeCode) {
        supervisorUserId = await this.#repo.userIdOfEmployeeCode(primarySupervisorEmployeeCode);
        const candidate = supervisorUserId ? await this.#repo.candidate(supervisorUserId) : null;
        if (!candidate) problems.push({ path: 'primarySupervisorEmployeeCode', message: 'No supervisor login for this employee code' });
        else {
          try {
            assertAssignable(candidate);
          } catch (err) {
            problems.push({ path: 'primarySupervisorEmployeeCode', message: (err as Error).message });
          }
        }
      }
      if (problems.length || !client) {
        reject(problems);
        continue;
      }

      const site = await this.#insert({ ...body, clientId: client.id });
      await audit(this.#ctx, 'site.create', 'site', null, auditView(site));
      if (supervisorUserId) {
        const a = await this.#repo.createAssignment({ userId: supervisorUserId, siteId: site.id, isPrimary: true, effectiveFrom: today().toString(), effectiveTo: null, createdBy: this.#ctx.user.id });
        await audit(this.#ctx, 'site_supervisor.assign', 'site_supervisor', null, a);
      }
      seen.add(site.code);
      results.push({ row, status: 'CREATED', id: site.id, errors: [] });
    }

    const created = results.filter((r) => r.status === 'CREATED').length;
    await audit(this.#ctx, 'site.import', 'site_import', null, { rows: rows.length, created, rejected: rows.length - created });
    return { created, rejected: rows.length - created, results };
  }

  // --- internals ---------------------------------------------------------

  async #insert(body: CreateSiteBody): Promise<Site> {
    const client = await this.#repo.clientById(body.clientId);
    if (!client) throw errors.unknownClient();
    if (client.status !== 'ACTIVE') throw clientErrors.clientInactive();
    if (await this.#repo.findByCode(body.code)) throw errors.duplicateCode();
    if (!(await this.#repo.stateExists(body.stateCode))) throw errors.unknownState();

    const fields: SiteFields = {
      clientId: body.clientId,
      code: body.code,
      name: body.name,
      address: body.address ?? null,
      stateCode: body.stateCode,
      district: body.district,
      pincode: body.pincode,
      minWageZone: body.minWageZone ?? null,
      sphere: body.sphere ?? null,
      lat: body.lat ?? null,
      lng: body.lng ?? null,
      inchargeName: body.inchargeName ?? null,
      inchargePhone: body.inchargePhone ?? null,
      shiftStart: body.shiftStart ?? null,
      shiftEnd: body.shiftEnd ?? null,
    };
    return this.#repo.create({ ...fields, createdBy: this.#ctx.user.id });
  }

  async #mustFind(id: string): Promise<Site> {
    const found = await this.#repo.findById(id);
    if (!found) throw new NotFoundError('Site');
    return found;
  }
}

/** M2-SIT-06 AC1: an active internal employee whose login has supervisor access. */
export function assertAssignable(c: Candidate) {
  if (c.role !== 'SUPERVISOR') throw errors.notAssignable('This user does not have supervisor access');
  if (c.userStatus !== 'ACTIVE') throw errors.notAssignable('This supervisor account is not active');
  if (!c.employeeId || c.employeeStatus !== 'ACTIVE') throw errors.notAssignable('This supervisor is not an active employee');
  if (c.staffType !== 'SUPERVISOR' && c.staffType !== 'HQ') throw errors.notAssignable('Only internal staff can be assigned as a site supervisor');
}

function toSupervisorDto(a: Assignment) {
  return {
    id: a.id,
    userId: a.userId,
    name: a.name,
    role: a.isPrimary ? ('PRIMARY' as const) : ('BACKUP' as const),
    effectiveFrom: a.effectiveFrom,
    effectiveTo: a.effectiveTo,
    status: assignmentStatus(a),
  };
}
