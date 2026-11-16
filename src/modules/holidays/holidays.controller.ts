// HTTP only: each route declares roles, schemas and (writes) an audit tag, and calls one service method.
import { defineRoutes } from '../../core/routes.ts';
import { rolesWith } from '../../lib/permissions.ts';
import { HQ } from '../../lib/roles.ts';
import {
  CreateHolidayBody,
  CreateReplacementBody,
  HolidayIdParam,
  HolidayListSchema,
  HolidaySchema,
  ImpactBody,
  ImpactSchema,
  ImportHolidaysBody,
  ImportHolidaysResult,
  ListHolidaysQuery,
  ListReplacementsQuery,
  ReplacementListSchema,
  ReplacementSchema,
  SiteHolidaysQuery,
  SiteHolidaysSchema,
  SiteIdParam,
  UpdateHolidayBody,
} from './holidays.schemas.ts';
import type { HolidaysService } from './holidays.service.ts';

/** Payroll/HR (and Admin) manage holidays; HQ and the Auditor read them. */
const WRITERS = rolesWith('sites.write');

export class HolidaysController {
  readonly service: HolidaysService;

  constructor({ holidaysService }: { holidaysService: HolidaysService }) {
    this.service = holidaysService;
  }

  static readonly routes = defineRoutes<HolidaysController>([
    {
      method: 'get',
      path: '/holidays',
      summary: 'List holidays by year, level and key (M14-HOL-01)',
      roles: HQ,
      query: ListHolidaysQuery,
      response: HolidayListSchema,
      handler: (c, ctx) => c.service.list(ctx.query()),
    },
    {
      method: 'post',
      path: '/holidays',
      summary: 'Add a holiday (M14-HOL-01)',
      roles: WRITERS,
      body: CreateHolidayBody,
      response: HolidaySchema,
      status: 201,
      audit: 'holiday.create',
      handler: (c, ctx) => c.service.create(ctx.body()),
    },
    {
      method: 'post',
      path: '/holidays/impact',
      summary: 'Preview what adding, removing or replacing a holiday affects (M14-HOL-05)',
      roles: WRITERS,
      body: ImpactBody,
      response: ImpactSchema,
      // A read in disguise: nothing is written, so there is nothing to audit.
      auditOnChange: true,
      audit: 'holiday.impact',
      handler: (c, ctx) => c.service.impact(ctx.body()),
    },
    {
      method: 'post',
      path: '/holidays/import',
      summary: 'Load a year of holidays from spreadsheet rows; preview flags bad rows (M14-HOL-04)',
      roles: WRITERS,
      body: ImportHolidaysBody,
      response: ImportHolidaysResult,
      auditOnChange: true,
      audit: 'holiday.import',
      handler: (c, ctx) => c.service.importMany(ctx.body()),
    },
    {
      method: 'get',
      path: '/holidays/replacements',
      summary: 'List client replacements of state holidays (M14-HOL-02)',
      roles: HQ,
      query: ListReplacementsQuery,
      response: ReplacementListSchema,
      handler: (c, ctx) => c.service.listReplacements(ctx.query()),
    },
    {
      method: 'post',
      path: '/holidays/replacements',
      summary: 'A client swaps a state holiday for another day (M14-HOL-02)',
      roles: WRITERS,
      body: CreateReplacementBody,
      response: ReplacementSchema,
      status: 201,
      audit: 'holiday_replacement.create',
      handler: (c, ctx) => c.service.replace(ctx.body()),
    },
    {
      method: 'delete',
      path: '/holidays/replacements/{id}',
      summary: 'Undo a client replacement (soft: the row is marked removed) (M14-HOL-02)',
      roles: WRITERS,
      params: HolidayIdParam,
      response: ReplacementSchema,
      audit: 'holiday_replacement.remove',
      handler: (c, ctx) => c.service.unreplace(ctx.param('id')),
    },
    {
      method: 'patch',
      path: '/holidays/{id}',
      summary: 'Change a holiday’s name, paid flag, type or half-day flag (M14-HOL-01)',
      roles: WRITERS,
      params: HolidayIdParam,
      body: UpdateHolidayBody,
      response: HolidaySchema,
      audit: 'holiday.update',
      handler: (c, ctx) => c.service.update(ctx.param('id'), ctx.body()),
    },
    {
      method: 'delete',
      path: '/holidays/{id}',
      summary: 'Remove a holiday (soft: the row is marked removed) (M14-HOL-05)',
      roles: WRITERS,
      params: HolidayIdParam,
      response: HolidaySchema,
      audit: 'holiday.remove',
      handler: (c, ctx) => c.service.remove(ctx.param('id')),
    },
    {
      method: 'get',
      path: '/sites/{siteId}/holidays',
      summary: 'The merged holiday list of a site for a year (supervisors: own sites) (M14-HOL-03)',
      roles: [...HQ, 'SUPERVISOR'],
      scope: ({ params }) => [params['siteId'] ?? ''],
      params: SiteIdParam,
      query: SiteHolidaysQuery,
      response: SiteHolidaysSchema,
      handler: (c, ctx) => c.service.siteCalendar(ctx.param('siteId'), ctx.query()),
    },
  ]);
}
