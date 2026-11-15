// Queries only, through the request's executor (its transaction on writes).
// Returns plain objects; no business rules here.
import { and, or } from '@prisma/orm-postgres/orm-client';
import type { Scalars } from '@prisma/orm-postgres/family-contract/types';
import type { Executor } from '../../core/context.ts';
import type { Models } from '../../prisma/contract.d.ts';

type ClientRow = Scalars<Models.app_Client>;
type ContactRow = Scalars<Models.app_ClientContact>;
type Status = ClientRow['status'];

export type Client = {
  id: string;
  code: string;
  name: string;
  stateCode: string;
  gstin: string | null;
  pan: string | null;
  registeredAddress: string | null;
  billingAddress: string | null;
  contractStart: string | null;
  contractEnd: string | null;
  workOrderNumber: string | null;
  pfEstablishmentId: string;
  esiEstablishmentId: string;
  status: Status;
  createdAt: string;
};

export type ClientRowWithCounts = Client & { siteCount: number; activeEmployees: number };

export type Contact = {
  id: string;
  clientId: string;
  name: string;
  role: ContactRow['role'];
  email: string | null;
  phone: string | null;
  isAttendanceSender: boolean;
  status: Status;
};

/** Fields written on create/update; dates are ISO strings, null clears. */
export type ClientFields = {
  code: string;
  name: string;
  stateCode: string;
  gstin: string | null;
  pan: string | null;
  registeredAddress: string | null;
  billingAddress: string | null;
  contractStart: string | null;
  contractEnd: string | null;
  workOrderNumber: string | null;
  pfEstablishmentId: string;
  esiEstablishmentId: string;
};

export type ClientFilters = { q?: string; stateCode?: string; status?: Status; cursor?: string; limit: number };

const iso = (v: { toString(): string } | null | undefined) => (v == null ? null : v.toString());
const date = (s: string | null | undefined) => (s ? (Temporal.PlainDate.from(s) as ClientRow['contractStart']) : null);

const toClient = (r: ClientRow): Client => ({
  id: r.id,
  code: r.code,
  name: r.name,
  stateCode: r.stateCode,
  gstin: r.gstin,
  pan: r.pan,
  registeredAddress: r.registeredAddress,
  billingAddress: r.billingAddress,
  contractStart: iso(r.contractStart),
  contractEnd: iso(r.contractEnd),
  workOrderNumber: r.workOrderNumber,
  pfEstablishmentId: r.pfEstablishmentId,
  esiEstablishmentId: r.esiEstablishmentId,
  status: r.status,
  createdAt: r.createdAt.toString(),
});

const toContact = (r: ContactRow): Contact => ({
  id: r.id,
  clientId: r.clientId,
  name: r.name,
  role: r.role,
  email: r.email,
  phone: r.phone,
  isAttendanceSender: r.isAttendanceSender,
  status: r.status,
});

/** Escapes LIKE wildcards in user input. */
const likeTerm = (q: string) => `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;

/** Prisma data object from a partial field set (undefined = leave alone). */
function toData(f: Partial<ClientFields>) {
  return {
    ...(f.code !== undefined ? { code: f.code as ClientRow['code'] } : {}),
    ...(f.name !== undefined ? { name: f.name as ClientRow['name'] } : {}),
    ...(f.stateCode !== undefined ? { stateCode: f.stateCode as ClientRow['stateCode'] } : {}),
    ...(f.gstin !== undefined ? { gstin: f.gstin as ClientRow['gstin'] } : {}),
    ...(f.pan !== undefined ? { pan: f.pan as ClientRow['pan'] } : {}),
    ...(f.registeredAddress !== undefined ? { registeredAddress: f.registeredAddress as ClientRow['registeredAddress'] } : {}),
    ...(f.billingAddress !== undefined ? { billingAddress: f.billingAddress as ClientRow['billingAddress'] } : {}),
    ...(f.contractStart !== undefined ? { contractStart: date(f.contractStart) } : {}),
    ...(f.contractEnd !== undefined ? { contractEnd: date(f.contractEnd) } : {}),
    ...(f.workOrderNumber !== undefined ? { workOrderNumber: f.workOrderNumber as ClientRow['workOrderNumber'] } : {}),
    ...(f.pfEstablishmentId !== undefined ? { pfEstablishmentId: f.pfEstablishmentId as ClientRow['pfEstablishmentId'] } : {}),
    ...(f.esiEstablishmentId !== undefined ? { esiEstablishmentId: f.esiEstablishmentId as ClientRow['esiEstablishmentId'] } : {}),
  };
}

export class ClientsRepository {
  readonly #executor: Executor;

  constructor({ executor }: { executor: Executor }) {
    this.#executor = executor;
  }

  get #clients() {
    return this.#executor.orm.app.Client;
  }

  get #contacts() {
    return this.#executor.orm.app.ClientContact;
  }

  async findById(id: string): Promise<Client | null> {
    const row = await this.#clients.first({ id: id as ClientRow['id'] });
    return row && toClient(row);
  }

  async findByCode(code: string): Promise<Client | null> {
    const row = await this.#clients.where({ code: code as ClientRow['code'] }).first();
    return row && toClient(row);
  }

  async findByGstin(gstin: string): Promise<Client | null> {
    const row = await this.#clients.where({ gstin: gstin as ClientRow['gstin'] }).first();
    return row && toClient(row);
  }

  async stateExists(code: string): Promise<boolean> {
    const row = await this.#executor.orm.app.State.where({ code: code as Scalars<Models.app_State>['code'] }).first();
    return row !== null;
  }

  async establishmentActive(id: string, type: 'PF' | 'ESI'): Promise<boolean> {
    const row = await this.#executor.orm.app.Establishment.where({ id: id as Scalars<Models.app_Establishment>['id'], type, status: 'ACTIVE' }).first();
    return row !== null;
  }

  async defaultEstablishment(type: 'PF' | 'ESI'): Promise<string | null> {
    const row = await this.#executor.orm.app.Establishment.where({ type, isDefault: true, status: 'ACTIVE' }).first();
    return row?.id ?? null;
  }

  async create(data: ClientFields & { createdBy: string }): Promise<Client> {
    const row = await this.#clients.create({
      ...(toData(data) as { code: ClientRow['code']; name: ClientRow['name']; stateCode: ClientRow['stateCode']; pfEstablishmentId: ClientRow['pfEstablishmentId']; esiEstablishmentId: ClientRow['esiEstablishmentId'] }),
      gstin: data.gstin as ClientRow['gstin'],
      pan: data.pan as ClientRow['pan'],
      registeredAddress: data.registeredAddress as ClientRow['registeredAddress'],
      billingAddress: data.billingAddress as ClientRow['billingAddress'],
      contractStart: date(data.contractStart),
      contractEnd: date(data.contractEnd),
      workOrderNumber: data.workOrderNumber as ClientRow['workOrderNumber'],
      status: 'ACTIVE',
      createdBy: data.createdBy as ClientRow['createdBy'],
      updatedBy: data.createdBy as ClientRow['updatedBy'],
    });
    return toClient(row);
  }

  async update(id: string, patch: Partial<ClientFields> & { status?: Status; updatedBy: string }): Promise<Client> {
    const row = await this.#clients.where({ id: id as ClientRow['id'] }).update({
      ...toData(patch),
      ...(patch.status ? { status: patch.status } : {}),
      updatedBy: patch.updatedBy as ClientRow['updatedBy'],
    });
    if (!row) throw new Error(`client ${id} vanished during update`);
    return toClient(row);
  }

  /** Cursor-paged, ordered by id (uuid v7 = creation order). */
  async list({ q, stateCode, status, cursor, limit }: ClientFilters): Promise<Client[]> {
    let query = this.#clients.orderBy((c) => c.id.asc());
    if (stateCode) query = query.where({ stateCode: stateCode as ClientRow['stateCode'] });
    if (status) query = query.where({ status });
    if (q) {
      const term = likeTerm(q);
      query = query.where((c) => or(c.name.ilike(term), c.code.ilike(term), c.gstin.ilike(term)));
    }
    if (cursor) query = query.where((c) => c.id.gt(cursor as ClientRow['id']));
    return (await query.limit(limit).all()).map(toClient);
  }

  /** Site count and employees with a deployment running on `day`, per client id. */
  async counts(clientIds: string[], day: Temporal.PlainDate): Promise<Map<string, { siteCount: number; activeEmployees: number }>> {
    const out = new Map(clientIds.map((id) => [id, { siteCount: 0, activeEmployees: 0 }]));
    if (clientIds.length === 0) return out;
    const sites = await this.#executor.orm.app.Site
      .select('id', 'clientId')
      .where((s) => s.clientId.in(clientIds as ClientRow['id'][]))
      .all();
    const clientOfSite = new Map<string, string>();
    for (const s of sites) {
      clientOfSite.set(s.id, s.clientId);
      out.get(s.clientId)!.siteCount++;
    }
    if (clientOfSite.size === 0) return out;
    const deployments = await this.#activeDeployments([...clientOfSite.keys()], day);
    for (const d of deployments) out.get(clientOfSite.get(d.siteId)!)!.activeEmployees++;
    return out;
  }

  async #activeDeployments(siteIds: string[], day: Temporal.PlainDate) {
    type D = Scalars<Models.app_Deployment>;
    return this.#executor.orm.app.Deployment
      .select('siteId', 'employeeId')
      .where((d) =>
        and(
          d.siteId.in(siteIds as D['siteId'][]),
          d.effectiveFrom.lte(day as D['effectiveFrom']),
          or(d.effectiveTo.isNull(), d.effectiveTo.gte(day as D['effectiveFrom'])),
        ),
      )
      .all();
  }

  /** Active deployments grouped by site, for the deactivation error. */
  async activeDeploymentLoad(clientId: string, day: Temporal.PlainDate): Promise<{ siteId: string; siteCode: string; deployments: number }[]> {
    const sites = await this.#executor.orm.app.Site
      .select('id', 'code')
      .where({ clientId: clientId as Scalars<Models.app_Site>['clientId'] })
      .orderBy((s) => s.code.asc())
      .all();
    if (sites.length === 0) return [];
    const deployments = await this.#activeDeployments(sites.map((s) => s.id), day);
    const perSite = new Map<string, number>();
    for (const d of deployments) perSite.set(d.siteId, (perSite.get(d.siteId) ?? 0) + 1);
    return sites.flatMap((s) => (perSite.has(s.id) ? [{ siteId: s.id, siteCode: s.code, deployments: perSite.get(s.id)! }] : []));
  }

  /** Has any payroll run (beyond a DRAFT) been created for this client? */
  async hasPayrollRun(clientId: string): Promise<boolean> {
    const row = await this.#executor.orm.app.PayrollRun
      .select('id')
      .where((r) => and(r.clientId.eq(clientId as Scalars<Models.app_PayrollRun>['clientId']), r.status.neq('DRAFT')))
      .first();
    return row !== null;
  }

  /** Active clients whose contract ends between `from` and `to` (inclusive), soonest first. */
  async contractsEndingBetween(from: Temporal.PlainDate, to: Temporal.PlainDate): Promise<Client[]> {
    const rows = await this.#clients
      .where((c) =>
        and(
          c.status.eq('ACTIVE'),
          c.contractEnd.gte(from as ClientRow['contractStart'] & {}),
          c.contractEnd.lte(to as ClientRow['contractStart'] & {}),
        ),
      )
      .orderBy([(c) => c.contractEnd.asc(), (c) => c.id.asc()])
      .all();
    return rows.map(toClient);
  }

  // --- contacts -----------------------------------------------------------

  async findContact(clientId: string, id: string): Promise<Contact | null> {
    const row = await this.#contacts.where({ id: id as ContactRow['id'], clientId: clientId as ContactRow['clientId'] }).first();
    return row && toContact(row);
  }

  async listContacts(clientId: string): Promise<Contact[]> {
    const rows = await this.#contacts
      .where({ clientId: clientId as ContactRow['clientId'] })
      .orderBy([(c) => c.createdAt.asc(), (c) => c.id.asc()])
      .all();
    return rows.map(toContact);
  }

  async createContact(data: { clientId: string; name: string; role: ContactRow['role']; email: string | null; phone: string | null; isAttendanceSender: boolean; createdBy: string }): Promise<Contact> {
    const row = await this.#contacts.create({
      clientId: data.clientId as ContactRow['clientId'],
      name: data.name as ContactRow['name'],
      role: data.role,
      email: data.email as ContactRow['email'],
      phone: data.phone as ContactRow['phone'],
      isAttendanceSender: data.isAttendanceSender,
      status: 'ACTIVE',
      createdBy: data.createdBy as ContactRow['createdBy'],
      updatedBy: data.createdBy as ContactRow['updatedBy'],
    });
    return toContact(row);
  }

  async updateContact(
    id: string,
    patch: { name?: string; role?: ContactRow['role']; email?: string | null; phone?: string | null; isAttendanceSender?: boolean; status?: Status; updatedBy: string },
  ): Promise<Contact> {
    const row = await this.#contacts.where({ id: id as ContactRow['id'] }).update({
      ...(patch.name !== undefined ? { name: patch.name as ContactRow['name'] } : {}),
      ...(patch.role !== undefined ? { role: patch.role } : {}),
      ...(patch.email !== undefined ? { email: patch.email as ContactRow['email'] } : {}),
      ...(patch.phone !== undefined ? { phone: patch.phone as ContactRow['phone'] } : {}),
      ...(patch.isAttendanceSender !== undefined ? { isAttendanceSender: patch.isAttendanceSender } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      updatedBy: patch.updatedBy as ContactRow['updatedBy'],
    });
    if (!row) throw new Error(`contact ${id} vanished during update`);
    return toContact(row);
  }
}
