import { z } from '@hono/zod-openapi';
import { defineRoutes } from '../../core/routes.ts';
import type { LookupsService } from './lookups.service.ts';

const OptionSchema = z.object({ value: z.string(), label: z.string() }).openapi('LookupOption');

export const LookupsSchema = z
  .object({
    enums: z.record(z.string(), z.array(OptionSchema)).openapi({ description: 'Every enum the API uses, by name (Role, DayCode, PaymentMode…)' }),
    states: z.array(
      z.object({ code: z.string(), name: z.string(), ptApplies: z.boolean(), lwfApplies: z.boolean(), rulesCompleteThrough: z.string().nullable() }),
    ),
    permissions: z.array(z.string()),
    ruleCodes: z.array(z.string()),
  })
  .openapi('Lookups');

export class LookupsController {
  readonly service: LookupsService;

  constructor({ lookupsService }: { lookupsService: LookupsService }) {
    this.service = lookupsService;
  }

  static readonly routes = defineRoutes<LookupsController>([
    {
      method: 'get',
      path: '/lookups',
      summary: 'Every enum and value list the API uses',
      roles: 'authenticated',
      response: LookupsSchema,
      handler: (c) => c.service.all(),
    },
  ]);
}
