// HTTP only: each route declares roles, schemas and (writes) an audit tag,
// and calls one service method.
import { defineRoutes } from '../../core/routes.ts';
import { rolesWith } from '../../lib/permissions.ts';
import { HQ } from '../../lib/roles.ts';
import {
  ClientListSchema,
  ClientSchema,
  ContactIdParam,
  ContactListSchema,
  ContactSchema,
  CreateClientBody,
  CreateContactBody,
  ExpiringQuery,
  ExpiringSchema,
  IdParam,
  ImportClientsBody,
  ImportResultSchema,
  ListClientsQuery,
  UpdateClientBody,
  UpdateContactBody,
} from './clients.schemas.ts';
import type { ClientsService } from './clients.service.ts';

/** Clients are HQ data: supervisors and employees never see the client list. */
const READERS = HQ;
const WRITERS = rolesWith('sites.write');
/** M2-CLI-05: "HQ Admin" deactivates. */
const ADMIN_ONLY = ['ADMIN'] as const;

export class ClientsController {
  readonly service: ClientsService;

  constructor({ clientsService }: { clientsService: ClientsService }) {
    this.service = clientsService;
  }

  static readonly routes = defineRoutes<ClientsController>([
    {
      method: 'get',
      path: '/clients',
      summary: 'List and search clients (M2-CLI-04)',
      roles: READERS,
      query: ListClientsQuery,
      response: ClientListSchema,
      handler: (c, ctx) => c.service.list(ctx.query()),
    },
    {
      method: 'get',
      path: '/clients/expiring',
      summary: 'Clients whose contract ends soon (M2-CLI-07)',
      roles: READERS,
      query: ExpiringQuery,
      response: ExpiringSchema,
      handler: (c, ctx) => c.service.expiring(ctx.query()),
    },
    {
      method: 'post',
      path: '/clients',
      summary: 'Create a client (M2-CLI-01)',
      roles: WRITERS,
      body: CreateClientBody,
      response: ClientSchema,
      status: 201,
      audit: 'client.create',
      handler: (c, ctx) => c.service.create(ctx.body()),
    },
    {
      method: 'post',
      path: '/clients/import',
      summary: 'Bulk-create clients; valid rows are saved, bad rows reported (M2-CLI-06)',
      roles: WRITERS,
      body: ImportClientsBody,
      response: ImportResultSchema,
      audit: 'client.import',
      handler: (c, ctx) => c.service.importMany(ctx.body()),
    },
    {
      method: 'get',
      path: '/clients/{id}',
      summary: 'Get a client',
      roles: READERS,
      params: IdParam,
      response: ClientSchema,
      handler: (c, ctx) => c.service.get(ctx.param('id')),
    },
    {
      method: 'patch',
      path: '/clients/{id}',
      summary: 'Edit a client (M2-CLI-03)',
      roles: WRITERS,
      params: IdParam,
      body: UpdateClientBody,
      response: ClientSchema,
      audit: 'client.update',
      handler: (c, ctx) => c.service.update(ctx.param('id'), ctx.body()),
    },
    {
      method: 'post',
      path: '/clients/{id}/deactivate',
      summary: 'Deactivate a client (M2-CLI-05)',
      roles: ADMIN_ONLY,
      params: IdParam,
      response: ClientSchema,
      audit: 'client.deactivate',
      handler: (c, ctx) => c.service.deactivate(ctx.param('id')),
    },
    {
      method: 'post',
      path: '/clients/{id}/reactivate',
      summary: 'Reactivate a client (M2-CLI-05)',
      roles: ADMIN_ONLY,
      params: IdParam,
      response: ClientSchema,
      audit: 'client.reactivate',
      handler: (c, ctx) => c.service.reactivate(ctx.param('id')),
    },
    {
      method: 'get',
      path: '/clients/{id}/contacts',
      summary: 'List a client\'s contacts (M2-CLI-02)',
      roles: READERS,
      params: IdParam,
      response: ContactListSchema,
      handler: (c, ctx) => c.service.listContacts(ctx.param('id')),
    },
    {
      method: 'post',
      path: '/clients/{id}/contacts',
      summary: 'Add a client contact (M2-CLI-02)',
      roles: WRITERS,
      params: IdParam,
      body: CreateContactBody,
      response: ContactSchema,
      status: 201,
      audit: 'client_contact.create',
      handler: (c, ctx) => c.service.createContact(ctx.param('id'), ctx.body()),
    },
    {
      method: 'patch',
      path: '/clients/{id}/contacts/{contactId}',
      summary: 'Edit or remove a client contact; mark the attendance sender (M2-CLI-02)',
      roles: WRITERS,
      params: ContactIdParam,
      body: UpdateContactBody,
      response: ContactSchema,
      audit: 'client_contact.update',
      handler: (c, ctx) => c.service.updateContact(ctx.param('id'), ctx.param('contactId'), ctx.body()),
    },
  ]);
}
