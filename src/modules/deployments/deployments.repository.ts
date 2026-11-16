// Queries only, through the request's executor (its transaction on writes).
import type { Scalars } from '@prisma/orm-postgres/family-contract/types';
import type { Executor } from '../../core/context.ts';
import type { Models } from '../../prisma/contract.d.ts';

type DepRow = Scalars<Models.app_Deployment>;
type EmpRow = Scalars<Models.app_Employee>;

export type DeployEmployee = {
  id: string;
  code: string;
  status: EmpRow['status'];
  staffType: EmpRow['staffType'];
  joinDate: string | null;
};

export type DeploySite = {
  id: string;
  code: string;
  name: string;
  stateCode: string;
  zone: string | null;
  status: string;
  clientId: string;
  clientName: string;
  clientStatus: string;
};

export type Deployment = {
  id: string;
  employeeId: string;
  siteId: string;
  designation: string;
  skillLevel: DepRow['skillLevel'];
  templateId: string | null;
  monthlyCtcPaise: bigint;
  kind: 'DEPLOY' | 'REDEPLOY' | 'REVISION';
  reason: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
};

export type NewDeployment = Omit<Deployment, 'id'> & { createdBy: string };
export type MinWageRow = { basicPaise: bigint; vdaPaise: bigint; per: 'DAY' | 'MONTH'; zone: string };

const toDep = (r: DepRow): Deployment => ({
  id: r.id,
  employeeId: r.employeeId,
  siteId: r.siteId,
  designation: r.designation,
  skillLevel: r.skillLevel,
  templateId: r.templateId ?? null,
  monthlyCtcPaise: BigInt(r.monthlyCtcPaise as never),
  kind: r.kind as Deployment['kind'],
  reason: r.reason ?? null,
  effectiveFrom: r.effectiveFrom.toString(),
  effectiveTo: r.effectiveTo ? r.effectiveTo.toString() : null,
});

export class DeploymentsRepository {
  readonly #executor: Executor;

  constructor({ executor }: { executor: Executor }) {
    this.#executor = executor;
  }

  get #deps() {
    return this.#executor.orm.app.Deployment;
  }

  async employee(id: string): Promise<DeployEmployee | null> {
    const r = await this.#executor.orm.app.Employee.where({ id: id as EmpRow['id'] }).first();
    return r && { id: r.id, code: r.code, status: r.status, staffType: r.staffType, joinDate: r.joinDate ? r.joinDate.toString() : null };
  }

  async setEmployeePosition(id: string, p: { designation?: string; skillLevel?: DepRow['skillLevel']; staffType?: EmpRow['staffType'] }, by: string) {
    await this.#executor.orm.app.Employee.where({ id: id as EmpRow['id'] }).update({ ...p, updatedBy: by } as never);
  }

  async site(id: string): Promise<DeploySite | null> {
    const s = await this.#executor.orm.app.Site.where({ id: id as never }).first();
    if (!s) return null;
    const c = await this.#executor.orm.app.Client.where({ id: s.clientId as never }).first();
    if (!c) return null;
    return {
      id: s.id,
      code: s.code,
      name: s.name,
      stateCode: s.stateCode,
      zone: s.minWageZone ?? null,
      status: s.status,
      clientId: c.id,
      clientName: c.name,
      clientStatus: c.status,
    };
  }

  async sites(ids: string[]): Promise<Map<string, DeploySite>> {
    const out = new Map<string, DeploySite>();
    for (const id of new Set(ids)) {
      const s = await this.site(id);
      if (s) out.set(id, s);
    }
    return out;
  }

  async template(id: string): Promise<{ id: string; status: string; clientId: string | null } | null> {
    const t = await this.#executor.orm.app.SalaryTemplate.where({ id: id as never }).first();
    return t && { id: t.id, status: t.status, clientId: t.clientId ?? null };
  }

  /** Newest first within the employee; oldest first when `asc`. */
  async forEmployee(employeeId: string): Promise<Deployment[]> {
    const rows = await this.#deps.where({ employeeId: employeeId as DepRow['employeeId'] }).orderBy((d) => d.effectiveFrom.asc()).all();
    return rows.map(toDep);
  }

  async create(d: NewDeployment): Promise<Deployment> {
    const row = await this.#deps.create({
      ...d,
      effectiveFrom: Temporal.PlainDate.from(d.effectiveFrom),
      effectiveTo: d.effectiveTo ? Temporal.PlainDate.from(d.effectiveTo) : null,
    } as never);
    return toDep(row);
  }

  async end(id: string, effectiveTo: string): Promise<Deployment> {
    const row = await this.#deps.where({ id: id as DepRow['id'] }).update({ effectiveTo: Temporal.PlainDate.from(effectiveTo) } as never);
    if (!row) throw new Error(`deployment ${id} vanished during update`);
    return toDep(row);
  }

  /** The minimum wage in force on `day` for the state, zone and skill; the latest start wins. */
  async minWage(stateCode: string, zone: string, skill: DepRow['skillLevel'], day: string): Promise<MinWageRow | null> {
    const rows = await this.#executor.orm.app.MinWage.where({ stateCode: stateCode as never, zone: zone as never, skillLevel: skill as never }).all();
    const live = rows
      .filter((r) => r.effectiveFrom.toString() <= day && (!r.effectiveTo || r.effectiveTo.toString() >= day))
      .sort((a, b) => b.effectiveFrom.toString().localeCompare(a.effectiveFrom.toString()))[0];
    return live ? { basicPaise: BigInt(live.basicPaise as never), vdaPaise: BigInt(live.vdaPaise as never), per: live.per as 'DAY' | 'MONTH', zone: live.zone } : null;
  }

  /** End date of a locked or published payroll run of one of these clients that covers `date`, or null. */
  async lockedRunEnd(date: string, clientIds: string[]): Promise<string | null> {
    const runs = await this.#executor.orm.app.PayrollRun.where((r) => r.status.in(['LOCKED', 'PUBLISHED'] as never)).all();
    let end: string | null = null;
    for (const r of runs) {
      if (!clientIds.includes(r.clientId as string)) continue;
      const from = r.periodFrom.toString();
      const to = r.periodTo.toString();
      if (from <= date && to >= date && (!end || to > end)) end = to;
    }
    return end;
  }
}
