// HTTP only: each route declares roles, schemas and (writes) an audit tag,
// and calls one service method.
import { defineRoutes } from '../../core/routes.ts';
import { rolesWith } from '../../lib/permissions.ts';
import { HQ } from '../../lib/roles.ts';
import {
  AsOfQuery,
  ClientIdParam,
  ListSettingsQuery,
  ProposeSettingBody,
  ResolvedSettingsSchema,
  SalaryDefaultsSchema,
  SettingIdParam,
  SettingListSchema,
  SettingSchema,
  SiteIdParam,
} from './settings.schemas.ts';
import type { SettingsService } from './settings.service.ts';

/** Settings are HQ data (supervisors and employees get 403); the Auditor reads. */
const READERS = HQ;
const WRITERS = rolesWith('sites.write');

export class SettingsController {
  readonly service: SettingsService;

  constructor({ settingsService }: { settingsService: SettingsService }) {
    this.service = settingsService;
  }

  static readonly routes = defineRoutes<SettingsController>([
    {
      method: 'get',
      path: '/settings',
      summary: 'Setting rows with their history and status, for one scope (M2-SET-09, M2-SET-10)',
      roles: READERS,
      query: ListSettingsQuery,
      response: SettingListSchema,
      handler: (c, ctx) => c.service.list(ctx.query()),
    },
    {
      method: 'post',
      path: '/settings',
      summary: 'Propose a dated setting value; pending until a second person approves (M2-SET-01..04, 06, 10)',
      roles: WRITERS,
      body: ProposeSettingBody,
      response: SettingSchema,
      status: 201,
      audit: 'setting.propose',
      handler: (c, ctx) => c.service.propose(ctx.body()),
    },
    {
      method: 'post',
      path: '/settings/{id}/approve',
      summary: 'Approve a pending setting (maker-checker) (M2-SET-10)',
      roles: WRITERS,
      params: SettingIdParam,
      response: SettingSchema,
      audit: 'setting.approve',
      handler: (c, ctx) => c.service.approve(ctx.param('id')),
    },
    {
      method: 'get',
      path: '/clients/{clientId}/settings',
      summary: "A client's settings as of a day (client, else company) (M2-SET-09)",
      roles: READERS,
      params: ClientIdParam,
      query: AsOfQuery,
      response: ResolvedSettingsSchema,
      handler: (c, ctx) => c.service.forClient(ctx.param('clientId'), ctx.query<AsOfQuery>().asOf),
    },
    {
      method: 'get',
      path: '/clients/{clientId}/salary-defaults',
      summary: "A client's default salary template and one per designation (M2-SET-04)",
      roles: READERS,
      params: ClientIdParam,
      query: AsOfQuery,
      response: SalaryDefaultsSchema,
      handler: (c, ctx) => c.service.salaryDefaults(ctx.param('clientId'), ctx.query<AsOfQuery>().asOf),
    },
    {
      method: 'get',
      path: '/sites/{siteId}/settings',
      summary: "A site's settings as of a day (site, else client, else company) (M2-SET-10)",
      roles: READERS,
      params: SiteIdParam,
      query: AsOfQuery,
      response: ResolvedSettingsSchema,
      handler: (c, ctx) => c.service.forSite(ctx.param('siteId'), ctx.query<AsOfQuery>().asOf),
    },
  ]);
}
