// Client rules against in-memory fakes (no database).
import { beforeEach, describe, expect, test } from 'vitest';
import type { Ctx } from '../../src/core/context.ts';
import { today } from '../../src/lib/dates.ts';
import { gstinCheckChar } from '../../src/lib/tax-ids.ts';
import type { Client, ClientFields, ClientsRepository, Contact } from '../../src/modules/clients/clients.repository.ts';
import { CreateClientBody, CreateContactBody, UpdateClientBody } from '../../src/modules/clients/clients.schemas.ts';
import { ClientsService } from '../../src/modules/clients/clients.service.ts';

const gstinOf = (first14: string) => first14 + gstinCheckChar(first14);
const GSTIN_A = gstinOf('27AABCT1234F1Z');
const GSTIN_B = gstinOf('23AAPFU0939F1Z');

let seq = 0;
const id = () => `00000000-0000-7000-8000-${String(++seq).padStart(12, '0')}`;

class FakeClients {
  clients = new Map<string, Client>();
  contacts = new Map<string, Contact>();
  states = new Set(['MP', 'RJ', 'MH']);
  payrollRunFor = new Set<string>();
  load: { siteId: string; siteCode: string; deployments: number }[] = [];
  auditLog: unknown[] = [];

  async findById(i: string) { return this.clients.get(i) ?? null; }
  async findByCode(c: string) { return [...this.clients.values()].find((x) => x.code === c) ?? null; }
  async findByGstin(g: string) { return [...this.clients.values()].find((x) => x.gstin === g) ?? null; }
  async stateExists(c: string) { return this.states.has(c); }
  async establishmentActive() { return true; }
  async defaultEstablishment() { return 'est-default'; }
  async create(d: ClientFields & { createdBy: string }) {
    const c: Client = { ...d, id: id(), status: 'ACTIVE', createdAt: '2026-11-16T00:00:00Z' };
    this.clients.set(c.id, c);
    return c;
  }
  async update(i: string, p: Partial<Client> & { updatedBy: string }) {
    const { updatedBy: _u, ...rest } = p;
    const c = { ...this.clients.get(i)!, ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) } as Client;
    this.clients.set(i, c);
    return c;
  }
  async hasPayrollRun(i: string) { return this.payrollRunFor.has(i); }
  async activeDeploymentLoad() { return this.load; }
  async contractsEndingBetween(from: Temporal.PlainDate, to: Temporal.PlainDate) {
    return [...this.clients.values()].filter((c) => c.status === 'ACTIVE' && c.contractEnd && c.contractEnd >= from.toString() && c.contractEnd <= to.toString());
  }
  async counts() { return new Map(); }
  async list() { return [...this.clients.values()]; }
  async findContact(cl: string, i: string) { const c = this.contacts.get(i); return c && c.clientId === cl ? c : null; }
  async listContacts(cl: string) { return [...this.contacts.values()].filter((c) => c.clientId === cl); }
  async createContact(d: Omit<Contact, 'id' | 'status'> & { createdBy: string }) {
    const c: Contact = { id: id(), clientId: d.clientId, name: d.name, role: d.role, email: d.email, phone: d.phone, isAttendanceSender: d.isAttendanceSender, status: 'ACTIVE' };
    this.contacts.set(c.id, c);
    return c;
  }
  async updateContact(i: string, p: Partial<Contact> & { updatedBy: string }) {
    const { updatedBy: _u, ...rest } = p;
    const c = { ...this.contacts.get(i)!, ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) } as Contact;
    this.contacts.set(i, c);
    return c;
  }
}

const audits: { action: string }[] = [];
function make() {
  const repo = new FakeClients();
  const ctx = {
    user: { id: 'u-hr', role: 'HR', siteIds: [] },
    maybeUser: { id: 'u-hr' },
    ip: null,
    audited: false,
    executor: { orm: { audit: { AuditLog: { create: async (r: { action: string }) => void audits.push(r) } } } },
  } as unknown as Ctx;
  return { repo, service: new ClientsService({ clientsRepository: repo as unknown as ClientsRepository, ctx }) };
}

const create = (service: ClientsService, over: Record<string, unknown> = {}) =>
  service.create(CreateClientBody.parse({ code: 'TATA-PUNE', name: 'Tata Motors Pune', stateCode: 'MH', ...over }));

beforeEach(() => void (audits.length = 0));

describe('M2-CLI-01 create', () => {
  test('M2-CLI-01 AC1 AC5: creates with the default PF/ESI establishments and audits it', async () => {
    const { service } = make();
    const c = await create(service);
    expect(c).toMatchObject({ code: 'TATA-PUNE', stateCode: 'MH', status: 'ACTIVE', pfEstablishmentId: 'est-default' });
    expect(audits.map((a) => a.action)).toEqual(['client.create']);
  });

  test('M2-CLI-01 AC1: unknown state → REFERENCE_MISSING', async () => {
    const { service } = make();
    await expect(create(service, { stateCode: 'ZZ' })).rejects.toMatchObject({ status: 409, code: 'REFERENCE_MISSING' });
  });

  test('M2-CLI-01 AC1 AC4: duplicate short code → DUPLICATE', async () => {
    const { service } = make();
    await create(service);
    await expect(create(service, { gstin: GSTIN_A })).rejects.toMatchObject({ status: 409, code: 'DUPLICATE', details: { fields: ['code'] } });
  });

  test('M2-CLI-01 AC3: duplicate GSTIN → DUPLICATE', async () => {
    const { service } = make();
    await create(service, { gstin: GSTIN_A });
    await expect(create(service, { code: 'OTHER', gstin: GSTIN_A })).rejects.toMatchObject({ code: 'DUPLICATE', details: { fields: ['gstin'] } });
  });
});

describe('M2-CLI-03 edit', () => {
  test('M2-CLI-03 AC1: short code is editable until payroll has run, then locked', async () => {
    const { service, repo } = make();
    const c = await create(service);
    expect((await service.update(c.id, UpdateClientBody.parse({ code: 'TATA-PUNE-2' }))).code).toBe('TATA-PUNE-2');
    repo.payrollRunFor.add(c.id);
    await expect(service.update(c.id, UpdateClientBody.parse({ code: 'TATA-X' }))).rejects.toMatchObject({ status: 422, code: 'CODE_LOCKED' });
    // Other fields stay editable, and sending the same code is not a change.
    expect(await service.update(c.id, UpdateClientBody.parse({ code: 'TATA-PUNE-2', name: 'Renamed' }))).toMatchObject({ name: 'Renamed' });
  });

  test('M2-CLI-03 AC1: a new code that belongs to another client → DUPLICATE', async () => {
    const { service } = make();
    await create(service);
    const other = await create(service, { code: 'OTHER' });
    await expect(service.update(other.id, UpdateClientBody.parse({ code: 'TATA-PUNE' }))).rejects.toMatchObject({ code: 'DUPLICATE' });
  });

  test('M2-CLI-03 AC1: contract dates are checked against the stored value', async () => {
    const { service } = make();
    const c = await create(service, { contractStart: '2026-04-01' });
    await expect(service.update(c.id, UpdateClientBody.parse({ contractEnd: '2026-03-01' }))).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: [{ path: 'contractEnd' }],
    });
  });

  test('M2-CLI-03 AC1: PAN is checked against the stored GSTIN', async () => {
    const { service } = make();
    const c = await create(service, { gstin: GSTIN_A });
    await expect(service.update(c.id, UpdateClientBody.parse({ pan: 'AAPFU0939F' }))).rejects.toMatchObject({ details: [{ path: 'pan' }] });
  });

  test('M2-CLI-03 AC2: an edit is audited', async () => {
    const { service } = make();
    const c = await create(service);
    await service.update(c.id, UpdateClientBody.parse({ name: 'New name' }));
    expect(audits.map((a) => a.action)).toEqual(['client.create', 'client.update']);
  });
});

describe('M2-CLI-05 deactivate', () => {
  test('M2-CLI-05 AC1: blocked while deployments are active; the error counts them per site', async () => {
    const { service, repo } = make();
    const c = await create(service);
    repo.load = [
      { siteId: 's1', siteCode: 'A-1', deployments: 3 },
      { siteId: 's2', siteCode: 'A-2', deployments: 2 },
    ];
    await expect(service.deactivate(c.id)).rejects.toMatchObject({
      status: 422,
      code: 'ACTIVE_DEPLOYMENTS',
      details: { activeDeployments: 5, sites: [{ id: 's1', deployments: 3, href: '/sites/s1' }, { id: 's2', deployments: 2 }] },
    });
    expect((await service.get(c.id)).status).toBe('ACTIVE');
  });

  test('M2-CLI-05 AC1 AC2: with none left it deactivates, audits, and the client is then refused by assertActive', async () => {
    const { service } = make();
    const c = await create(service);
    expect((await service.deactivate(c.id)).status).toBe('INACTIVE');
    expect(audits.map((a) => a.action)).toContain('client.deactivate');
    await expect(service.assertActive(c.id)).rejects.toMatchObject({ code: 'CLIENT_INACTIVE' });
    await expect(service.deactivate(c.id)).rejects.toMatchObject({ code: 'ALREADY_INACTIVE' });
  });

  test('M2-CLI-05 AC3: an inactive client is still readable', async () => {
    const { service } = make();
    const c = await create(service);
    await service.deactivate(c.id);
    expect(await service.get(c.id)).toMatchObject({ id: c.id, status: 'INACTIVE' });
  });
});

describe('M2-CLI-02 contacts', () => {
  test('M2-CLI-02 AC1: several contacts per client', async () => {
    const { service } = make();
    const c = await create(service);
    await service.createContact(c.id, CreateContactBody.parse({ name: 'Asha', role: 'HR', email: 'asha@x.test' }));
    await service.createContact(c.id, CreateContactBody.parse({ name: 'Ravi', role: 'ACCOUNTS', phone: '9876543210' }));
    expect((await service.listContacts(c.id)).items).toHaveLength(2);
  });

  test('M2-CLI-02 AC2: only one attendance sender; marking another moves the mark', async () => {
    const { service } = make();
    const c = await create(service);
    const a = await service.createContact(c.id, CreateContactBody.parse({ name: 'Asha', role: 'HR', email: 'asha@x.test', isAttendanceSender: true }));
    const b = await service.createContact(c.id, CreateContactBody.parse({ name: 'Ravi', role: 'OTHER', email: 'ravi@x.test' }));
    await service.updateContact(c.id, b.id, { isAttendanceSender: true });
    const all = (await service.listContacts(c.id)).items;
    expect(all.filter((x) => x.isAttendanceSender).map((x) => x.id)).toEqual([b.id]);
    expect(all.find((x) => x.id === a.id)!.isAttendanceSender).toBe(false);
  });

  test('M2-CLI-02 AC2: a contact without an email cannot be the sender; removing the sender ends the mark', async () => {
    const { service } = make();
    const c = await create(service);
    const noMail = await service.createContact(c.id, CreateContactBody.parse({ name: 'Ravi', role: 'OTHER' }));
    await expect(service.updateContact(c.id, noMail.id, { isAttendanceSender: true })).rejects.toMatchObject({ code: 'SENDER_NEEDS_EMAIL' });
    const sender = await service.createContact(c.id, CreateContactBody.parse({ name: 'Asha', role: 'HR', email: 'a@x.test', isAttendanceSender: true }));
    expect(await service.updateContact(c.id, sender.id, { status: 'INACTIVE' })).toMatchObject({ status: 'INACTIVE', isAttendanceSender: false });
  });

  test('M2-CLI-02 AC1: a contact of another client → NOT_FOUND', async () => {
    const { service } = make();
    const c1 = await create(service);
    const c2 = await create(service, { code: 'OTHER' });
    const contact = await service.createContact(c1.id, CreateContactBody.parse({ name: 'Asha', role: 'HR' }));
    await expect(service.updateContact(c2.id, contact.id, { name: 'X' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('M2-CLI-06 import', () => {
  test('M2-CLI-06 AC2 AC3: valid rows are saved; duplicate code/GSTIN, bad rows and unknown states are rejected with a reason', async () => {
    const { service } = make();
    await create(service, { code: 'EXISTING', gstin: GSTIN_B });
    const res = await service.importMany({
      rows: [
        { code: 'GOOD-ONE', name: 'Good One', stateCode: 'MP', gstin: GSTIN_A },
        { code: 'GOOD-ONE', name: 'Same code again', stateCode: 'MP' },
        { code: 'GST-DUP', name: 'Dup GSTIN in file', stateCode: 'MP', gstin: GSTIN_A },
        { code: 'EXISTING', name: 'Existing code', stateCode: 'MP' },
        { code: 'GST-OLD', name: 'Existing GSTIN', stateCode: 'MP', gstin: GSTIN_B },
        { code: 'bad', name: '', stateCode: 'MP' },
        { code: 'NO-STATE', name: 'No state', stateCode: 'ZZ' },
        { code: 'GOOD-TWO', name: 'Good Two', stateCode: 'RJ' },
      ],
    });
    expect(res.created).toBe(2);
    expect(res.rejected).toBe(6);
    expect(res.results.map((r) => r.status)).toEqual(['CREATED', 'REJECTED', 'REJECTED', 'REJECTED', 'REJECTED', 'REJECTED', 'REJECTED', 'CREATED']);
    expect(res.results[1]!.errors).toEqual([{ path: 'code', message: 'Duplicate short code' }]);
    expect(res.results[2]!.errors).toEqual([{ path: 'gstin', message: 'Duplicate GSTIN' }]);
    expect(res.results[5]!.errors.map((e) => e.path).sort()).toEqual(['code', 'name']);
    expect(await service.get(res.results[7]!.id!)).toMatchObject({ code: 'GOOD-TWO' });
  });
});

describe('M2-CLI-07 contract expiry', () => {
  test('M2-CLI-07 AC1: 7 and 30 day alert levels, nothing outside the window', async () => {
    const { service } = make();
    const in_ = (n: number) => today().add({ days: n }).toString();
    await create(service, { code: 'IN-5', contractEnd: in_(5) });
    await create(service, { code: 'IN-7', contractEnd: in_(7) });
    await create(service, { code: 'IN-8', contractEnd: in_(8) });
    await create(service, { code: 'IN-30', contractEnd: in_(30) });
    await create(service, { code: 'IN-31', contractEnd: in_(31) });
    const { items } = await service.expiring({ withinDays: 30 });
    expect(items.map((i) => [i.code, i.daysLeft, i.alert])).toEqual([
      ['IN-5', 5, 'D7'],
      ['IN-7', 7, 'D7'],
      ['IN-8', 8, 'D30'],
      ['IN-30', 30, 'D30'],
    ]);
  });
});
