import { z } from '@hono/zod-openapi';
import { defineRoutes } from '../../core/routes.ts';
import { rolesWith } from '../../lib/permissions.ts';
import type { SitesService } from './sites.service.ts';

const SITE_READERS = rolesWith('sites.read');

const SiteSchema = z
  .object({
    id: z.uuid(),
    clientId: z.uuid(),
    code: z.string(),
    name: z.string(),
    stateCode: z.string(),
    minWageZone: z.string().nullable(),
    status: z.enum(['ACTIVE', 'INACTIVE']),
  })
  .openapi('Site');

const SiteIdParam = z.object({ siteId: z.uuid().openapi({ param: { name: 'siteId', in: 'path' } }) });

export class SitesController {
  readonly service: SitesService;

  constructor({ sitesService }: { sitesService: SitesService }) {
    this.service = sitesService;
  }

  static readonly routes = defineRoutes<SitesController>([
    {
      method: 'get',
      path: '/sites',
      summary: 'List sites (supervisors: only their own)',
      roles: SITE_READERS,
      response: z.object({ items: z.array(SiteSchema) }),
      handler: (c) => c.service.list(),
    },
    {
      method: 'get',
      path: '/sites/{siteId}',
      summary: 'Get a site (supervisors: only their own)',
      roles: SITE_READERS,
      scope: ({ params }) => [params['siteId'] ?? ''],
      params: SiteIdParam,
      response: SiteSchema,
      handler: (c, ctx) => c.service.get(ctx.param('siteId')),
    },
  ]);
}
