// Client rules (M2-CLI-01..07). Throws AppErrors; never touches HTTP or the ORM
// directly. audit() on every write.
import { audit } from '../../core/audit.ts';
import type { Ctx } from '../../core/context.ts';
import { NotFoundError, ValidationError } from '../../core/errors.ts';
import { checkGstin, panOfGstin } from '../../lib/tax-ids.ts';
import { today } from '../../lib/dates.ts';
import * as errors from './clients.errors.ts';
import type { Client, ClientFields, ClientsRepository, Contact } from './clients.repository.ts';
import {
  CreateClientBody,
  type CreateContactBody,
  type ExpiringQuery,
  type ImportClientsBody,
  type ListClientsQuery,
  type UpdateClientBody,
  type UpdateContactBody,
} from './clients.schemas.ts';

type Deps = { clientsRepository: ClientsRepository; ctx: Ctx };

/**
 * What goes into the audit log. The audit layer drops any key named `code`
 * (it hides OTP codes), so the short code is logged as `shortCode`.
 */
const auditView = ({ code, ...rest }: Client) => ({ shortCode: code, ...rest });

type RowError = { path: string; message: string };

export class ClientsService {
  readonly #repo: ClientsRepository;
  readonly #ctx: Ctx;

  constructor({ clientsRepository, ctx }: Deps) {
    this.#repo = clientsRepository;
    this.#ctx = ctx;
  }

  async get(id: string) {
    return this.#mustFind(id);
  }

  /** M2-CLI-05 AC2: other modules call this before a deployment, attendance import or payroll run. */
  async assertActive(id: string) {
    const client = await this.#mustFind(id);
    if (client.status !== 'ACTIVE') throw errors.clientInactive();
    return client;
  }

  /** M2-CLI-04. */
  async list(query: ListClientsQuery) {
    const rows = await this.#repo.list({ ...query, limit: query.limit + 1 });
    const page = rows.slice(0, query.limit);
    const counts = await this.#repo.counts(page.map((c) => c.id), today());
    return {
      items: page.map((c) => ({ ...c, ...(counts.get(c.id) ?? { siteCount: 0, activeEmployees: 0 }) })),
      nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  /** M2-CLI-01. */
  async create(body: CreateClientBody) {
    const client = await this.#insert(body);
    await audit(this.#ctx, 'client.create', 'client', null, auditView(client));
    return client;
  }

  /** M2-CLI-03. */
  async update(id: string, body: UpdateClientBody) {
    const before = await this.#mustFind(id);

    if (body.code !== undefined && body.code !== before.code) {
      if (await this.#repo.hasPayrollRun(id)) throw errors.codeLocked();
      const clash = await this.#repo.findByCode(body.code);
      if (clash) throw errors.duplicateCode();
    }
    if (body.gstin && body.gstin !== before.gstin) {
      const clash = await this.#repo.findByGstin(body.gstin);
      if (clash && clash.id !== id) throw errors.duplicateGstin();
    }
    if (body.stateCode !== undefined && body.stateCode !== before.stateCode && !(await this.#repo.stateExists(body.stateCode))) {
      throw errors.unknownState();
    }
    if (body.pfEstablishmentId) await this.#checkEstablishment(body.pfEstablishmentId, 'PF');
    if (body.esiEstablishmentId) await this.#checkEstablishment(body.esiEstablishmentId, 'ESI');

    // The body alone can't see the stored values: re-check the combination.
    const merged = { ...before, ...Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)) } as Client;
    const problems = crossProblems(merged);
    if (problems.length) throw new ValidationError('Invalid request', problems);

    const { code, name, stateCode, gstin, pan, registeredAddress, billingAddress, contractStart, contractEnd, workOrderNumber, pfEstablishmentId, esiEstablishmentId } = body;
    const after = await this.#repo.update(id, {
      code, name, stateCode, gstin, pan, registeredAddress, billingAddress, contractStart, contractEnd, workOrderNumber, pfEstablishmentId, esiEstablishmentId,
      updatedBy: this.#ctx.user.id,
    });
    await audit(this.#ctx, 'client.update', 'client', auditView(before), auditView(after));
    return after;
  }

  /** M2-CLI-05. Past payroll, payslips and compliance stay readable: only the status changes. */
  async deactivate(id: string) {
    const before = await this.#mustFind(id);
    if (before.status === 'INACTIVE') throw errors.alreadyInactive();
    const load = await this.#repo.activeDeploymentLoad(id, today());
    if (load.length > 0) throw errors.hasActiveDeployments(id, load);
    const after = await this.#repo.update(id, { status: 'INACTIVE', updatedBy: this.#ctx.user.id });
    await audit(this.#ctx, 'client.deactivate', 'client', auditView(before), auditView(after));
    return after;
  }

  async reactivate(id: string) {
    const before = await this.#mustFind(id);
    if (before.status === 'ACTIVE') throw errors.alreadyActive();
    const after = await this.#repo.update(id, { status: 'ACTIVE', updatedBy: this.#ctx.user.id });
    await audit(this.#ctx, 'client.reactivate', 'client', auditView(before), auditView(after));
    return after;
  }

  /**
   * M2-CLI-06: each row is checked on its own; valid rows are saved even if
   * others fail. Duplicates of existing clients or of an earlier row are rejected.
   */
  async importMany({ rows }: ImportClientsBody) {
    const results: { row: number; status: 'CREATED' | 'REJECTED'; id: string | null; errors: RowError[] }[] = [];
    const seenCodes = new Set<string>();
    const seenGstins = new Set<string>();

    for (const [i, raw] of rows.entries()) {
      const row = i + 1;
      const parsed = CreateClientBody.safeParse(raw);
      if (!parsed.success) {
        results.push({ row, status: 'REJECTED', id: null, errors: parsed.error.issues.map((e) => ({ path: e.path.join('.'), message: e.message })) });
        continue;
      }
      const body = parsed.data;
      const problems: RowError[] = [];
      if (seenCodes.has(body.code) || (await this.#repo.findByCode(body.code))) problems.push({ path: 'code', message: 'Duplicate short code' });
      if (body.gstin && (seenGstins.has(body.gstin) || (await this.#repo.findByGstin(body.gstin)))) problems.push({ path: 'gstin', message: 'Duplicate GSTIN' });
      if (!(await this.#repo.stateExists(body.stateCode))) problems.push({ path: 'stateCode', message: 'Unknown state' });
      if (problems.length) {
        results.push({ row, status: 'REJECTED', id: null, errors: problems });
        continue;
      }
      try {
        const client = await this.#insert(body);
        await audit(this.#ctx, 'client.create', 'client', null, auditView(client));
        seenCodes.add(client.code);
        if (client.gstin) seenGstins.add(client.gstin);
        results.push({ row, status: 'CREATED', id: client.id, errors: [] });
      } catch (err) {
        // Only the row's own rule errors reject the row; anything else (database down) fails the request.
        if (err instanceof Error && 'status' in err && (err as { status: number }).status < 500) {
          results.push({ row, status: 'REJECTED', id: null, errors: [{ path: '', message: err.message }] });
        } else throw err;
      }
    }

    const created = results.filter((r) => r.status === 'CREATED').length;
    await audit(this.#ctx, 'client.import', 'client_import', null, { rows: rows.length, created, rejected: rows.length - created });
    return { created, rejected: rows.length - created, results };
  }

  /** M2-CLI-07: contracts ending soon; D7 / D30 mark the 7- and 30-day alert levels. */
  async expiring({ withinDays }: ExpiringQuery) {
    const day = today();
    const rows = await this.#repo.contractsEndingBetween(day, day.add({ days: withinDays }));
    return {
      items: rows.flatMap((c) => {
        if (!c.contractEnd) return [];
        const daysLeft = day.until(Temporal.PlainDate.from(c.contractEnd), { largestUnit: 'day' }).days;
        const alert = daysLeft <= 7 ? ('D7' as const) : daysLeft <= 30 ? ('D30' as const) : null;
        return [{ id: c.id, code: c.code, name: c.name, contractEnd: c.contractEnd, daysLeft, alert }];
      }),
    };
  }

  // --- contacts (M2-CLI-02) ----------------------------------------------

  async listContacts(clientId: string) {
    await this.#mustFind(clientId);
    return { items: await this.#repo.listContacts(clientId) };
  }

  async createContact(clientId: string, body: CreateContactBody) {
    await this.#mustFind(clientId);
    // The previous sender stops being the sender in the same transaction.
    if (body.isAttendanceSender) await this.#unmarkSender(clientId);
    const contact = await this.#repo.createContact({
      clientId,
      name: body.name,
      role: body.role,
      email: body.email ?? null,
      phone: body.phone ?? null,
      isAttendanceSender: body.isAttendanceSender,
      createdBy: this.#ctx.user.id,
    });
    await audit(this.#ctx, 'client_contact.create', 'client_contact', null, contact);
    return contact;
  }

  async updateContact(clientId: string, contactId: string, body: UpdateContactBody) {
    await this.#mustFind(clientId);
    const before = await this.#repo.findContact(clientId, contactId);
    if (!before) throw new NotFoundError('Contact');

    const email = body.email !== undefined ? body.email : before.email;
    const status = body.status ?? before.status;
    // Only an active contact with an email can be the attendance sender; removing one ends the mark.
    let sender = body.isAttendanceSender ?? before.isAttendanceSender;
    if (status === 'INACTIVE') sender = false;
    if (sender && !email) throw errors.senderNeedsEmail();
    if (sender && !before.isAttendanceSender) await this.#unmarkSender(clientId);

    const after = await this.#repo.updateContact(contactId, {
      name: body.name,
      role: body.role,
      email: body.email,
      phone: body.phone,
      status: body.status,
      isAttendanceSender: sender,
      updatedBy: this.#ctx.user.id,
    });
    await audit(this.#ctx, 'client_contact.update', 'client_contact', before, after);
    return after;
  }

  // --- internals ---------------------------------------------------------

  async #unmarkSender(clientId: string) {
    const previous = await this.#repo.listContacts(clientId).then((all) => all.find((c) => c.isAttendanceSender && c.status === 'ACTIVE'));
    if (!previous) return;
    const cleared = await this.#repo.updateContact(previous.id, { isAttendanceSender: false, updatedBy: this.#ctx.user.id });
    await audit(this.#ctx, 'client_contact.update', 'client_contact', previous, cleared);
  }

  async #insert(body: CreateClientBody): Promise<Client> {
    if (await this.#repo.findByCode(body.code)) throw errors.duplicateCode();
    if (body.gstin && (await this.#repo.findByGstin(body.gstin))) throw errors.duplicateGstin();
    if (!(await this.#repo.stateExists(body.stateCode))) throw errors.unknownState();

    const pf = body.pfEstablishmentId ?? (await this.#repo.defaultEstablishment('PF'));
    const esi = body.esiEstablishmentId ?? (await this.#repo.defaultEstablishment('ESI'));
    if (!pf) throw errors.noDefaultEstablishment('PF');
    if (!esi) throw errors.noDefaultEstablishment('ESI');
    if (body.pfEstablishmentId) await this.#checkEstablishment(pf, 'PF');
    if (body.esiEstablishmentId) await this.#checkEstablishment(esi, 'ESI');

    const fields: ClientFields = {
      code: body.code,
      name: body.name,
      stateCode: body.stateCode,
      gstin: body.gstin ?? null,
      pan: body.pan ?? null,
      registeredAddress: body.registeredAddress ?? null,
      billingAddress: body.billingAddress ?? null,
      contractStart: body.contractStart ?? null,
      contractEnd: body.contractEnd ?? null,
      workOrderNumber: body.workOrderNumber ?? null,
      pfEstablishmentId: pf,
      esiEstablishmentId: esi,
    };
    return this.#repo.create({ ...fields, createdBy: this.#ctx.user.id });
  }

  async #checkEstablishment(id: string, type: 'PF' | 'ESI') {
    if (!(await this.#repo.establishmentActive(id, type))) throw errors.unknownEstablishment(type === 'PF' ? 'pfEstablishmentId' : 'esiEstablishmentId');
  }

  async #mustFind(id: string): Promise<Client> {
    const found = await this.#repo.findById(id);
    if (!found) throw new NotFoundError('Client');
    return found;
  }
}

/** GSTIN/PAN agreement and contract date order on a full client. */
function crossProblems(c: Pick<Client, 'gstin' | 'pan' | 'contractStart' | 'contractEnd'>): RowError[] {
  const out: RowError[] = [];
  if (c.gstin && c.pan && checkGstin(c.gstin) === null && panOfGstin(c.gstin) !== c.pan) out.push({ path: 'pan', message: 'PAN does not match the GSTIN' });
  if (c.contractStart && c.contractEnd && c.contractEnd < c.contractStart) out.push({ path: 'contractEnd', message: 'Contract end is before contract start' });
  return out;
}

export type { Contact };
