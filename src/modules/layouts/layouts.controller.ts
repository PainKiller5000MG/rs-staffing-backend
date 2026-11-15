// HTTP only: each route declares roles, schemas and (writes) an audit tag.
import { defineRoutes } from '../../core/routes.ts';
import { HQ, HQ_WRITERS } from '../../lib/roles.ts';
import {
  ClientIdParam,
  CreateLayoutBody,
  LayoutKeyParam,
  LayoutListSchema,
  LayoutSchema,
  LayoutVersionParam,
  LayoutVersionsSchema,
  ListLayoutsQuery,
  NewVersionBody,
} from './layouts.schemas.ts';
import type { LayoutsService } from './layouts.service.ts';

/** Layouts are HQ master data: supervisors enter attendance but never see or change how a client's sheet is read. */
const READERS = HQ;
const WRITERS = HQ_WRITERS;

export class LayoutsController {
  readonly service: LayoutsService;

  constructor({ layoutsService }: { layoutsService: LayoutsService }) {
    this.service = layoutsService;
  }

  static readonly routes = defineRoutes<LayoutsController>([
    {
      method: 'get',
      path: '/clients/{clientId}/attendance-layouts',
      summary: "A client's attendance layouts, newest version of each (M2-SET-05)",
      roles: READERS,
      params: ClientIdParam,
      query: ListLayoutsQuery,
      response: LayoutListSchema,
      handler: (c, ctx) => c.service.listForClient(ctx.param('clientId'), ctx.query()),
    },
    {
      method: 'post',
      path: '/clients/{clientId}/attendance-layouts',
      summary: 'Save a confirmed attendance layout for a client (M2-SET-05)',
      roles: WRITERS,
      params: ClientIdParam,
      body: CreateLayoutBody,
      response: LayoutSchema,
      status: 201,
      audit: 'attendance_layout.create',
      handler: (c, ctx) => c.service.create(ctx.param('clientId'), ctx.body()),
    },
    {
      method: 'get',
      path: '/attendance-layouts/{layoutKey}/versions',
      summary: "Every version of a layout, newest first (M2-SET-05)",
      roles: READERS,
      params: LayoutKeyParam,
      response: LayoutVersionsSchema,
      handler: (c, ctx) => c.service.versions(ctx.param('layoutKey')),
    },
    {
      method: 'post',
      path: '/attendance-layouts/{layoutKey}/versions',
      summary: 'Edit a layout: saves a new version, earlier ones stay (M2-SET-05)',
      roles: WRITERS,
      params: LayoutKeyParam,
      body: NewVersionBody,
      response: LayoutSchema,
      status: 201,
      audit: 'attendance_layout.version',
      handler: (c, ctx) => c.service.newVersion(ctx.param('layoutKey'), ctx.body()),
    },
    {
      method: 'get',
      path: '/attendance-layouts/{layoutKey}/versions/{version}',
      summary: 'One version of a layout, as past imports used it (M2-SET-05)',
      roles: READERS,
      params: LayoutVersionParam,
      response: LayoutSchema,
      handler: (c, ctx) => c.service.version(ctx.param('layoutKey'), Number(ctx.param('version'))),
    },
  ]);
}
