// HTTP only: each route declares roles, schemas and (writes) an audit tag,
// and calls one service method.
import { defineRoutes } from '../../core/routes.ts';
import { rolesWith } from '../../lib/permissions.ts';
import { HQ } from '../../lib/roles.ts';
import {
  AssignSupervisorBody,
  CreateSiteBody,
  ImportResultSchema,
  ImportSitesBody,
  ListSitesQuery,
  MySitesSchema,
  SiteIdParam,
  SiteListSchema,
  SiteSchema,
  SiteSupervisorListSchema,
  SiteSupervisorSchema,
  UpdateSiteBody,
} from './sites.schemas.ts';
import type { SitesService } from './sites.service.ts';

const READERS = rolesWith('sites.read');
const WRITERS = rolesWith('sites.write');
/** M2-SIT-05: "HQ Admin" closes. */
const ADMIN_ONLY = ['ADMIN'] as const;

export class SitesController {
  readonly service: SitesService;

  constructor({ sitesService }: { sitesService: SitesService }) {
    this.service = sitesService;
  }

  static readonly routes = defineRoutes<SitesController>([
    {
      method: 'get',
      path: '/sites',
      summary: 'List and search sites (supervisors: only their own) (M2-SIT-04)',
      roles: READERS,
      query: ListSitesQuery,
      response: SiteListSchema,
      handler: (c, ctx) => c.service.list(ctx.query()),
    },
    {
      method: 'post',
      path: '/sites',
      summary: 'Create a site (M2-SIT-01)',
      roles: WRITERS,
      body: CreateSiteBody,
      response: SiteSchema,
      status: 201,
      audit: 'site.create',
      handler: (c, ctx) => c.service.create(ctx.body()),
    },
    {
      method: 'post',
      path: '/sites/import',
      summary: 'Bulk-create sites; valid rows are saved, bad rows reported (M2-SIT-08)',
      roles: WRITERS,
      body: ImportSitesBody,
      response: ImportResultSchema,
      audit: 'site.import',
      handler: (c, ctx) => c.service.importMany(ctx.body()),
    },
    {
      method: 'get',
      path: '/sites/{siteId}',
      summary: 'Get a site (supervisors: only their own)',
      roles: READERS,
      scope: ({ params }) => [params['siteId'] ?? ''],
      params: SiteIdParam,
      response: SiteSchema,
      handler: (c, ctx) => c.service.get(ctx.param('siteId')),
    },
    {
      method: 'patch',
      path: '/sites/{siteId}',
      summary: 'Edit a site, including its minimum-wage zone and sphere (M2-SIT-03, M2-SIT-02)',
      roles: WRITERS,
      params: SiteIdParam,
      body: UpdateSiteBody,
      response: SiteSchema,
      audit: 'site.update',
      handler: (c, ctx) => c.service.update(ctx.param('siteId'), ctx.body()),
    },
    {
      method: 'post',
      path: '/sites/{siteId}/close',
      summary: 'Close a site (M2-SIT-05)',
      roles: ADMIN_ONLY,
      params: SiteIdParam,
      response: SiteSchema,
      audit: 'site.close',
      handler: (c, ctx) => c.service.close(ctx.param('siteId')),
    },
    {
      method: 'get',
      path: '/sites/{siteId}/supervisors',
      summary: 'A site\'s supervisor assignments (M2-SIT-06)',
      roles: HQ,
      params: SiteIdParam,
      response: SiteSupervisorListSchema,
      handler: (c, ctx) => c.service.listSupervisors(ctx.param('siteId')),
    },
    {
      method: 'post',
      path: '/sites/{siteId}/supervisors',
      summary: 'Assign a primary or backup supervisor; pending until a second person approves (M2-SIT-06)',
      roles: WRITERS,
      params: SiteIdParam,
      body: AssignSupervisorBody,
      response: SiteSupervisorSchema,
      status: 201,
      audit: 'site_supervisor.assign',
      handler: (c, ctx) => c.service.assignSupervisor(ctx.param('siteId'), ctx.body()),
    },
    {
      method: 'get',
      path: '/me/sites',
      summary: 'The sites I cover today (M2-SIT-07)',
      roles: ['SUPERVISOR'],
      response: MySitesSchema,
      handler: (c) => c.service.mySites(),
    },
  ]);
}
