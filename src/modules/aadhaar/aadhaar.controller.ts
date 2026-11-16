// HTTP only. Store and lookup are in-process (aadhaarService); only reveal is exposed.
import { defineRoutes } from '../../core/routes.ts';
import { rolesWith } from '../../lib/permissions.ts';
import { AadhaarRefParam, RevealBody, RevealedSchema } from './aadhaar.schemas.ts';
import type { AadhaarService } from './aadhaar.service.ts';

export class AadhaarController {
  readonly service: AadhaarService;

  constructor({ aadhaarService }: { aadhaarService: AadhaarService }) {
    this.service = aadhaarService;
  }

  static readonly routes = defineRoutes<AadhaarController>([
    {
      method: 'post',
      path: '/aadhaar/{ref}/reveal',
      summary: 'Reveal a full Aadhaar number once, with a reason (M12-AAD-03)',
      roles: rolesWith('aadhaar.reveal'),
      params: AadhaarRefParam,
      body: RevealBody,
      response: RevealedSchema,
      audit: 'aadhaar.reveal',
      handler: (c, ctx) => c.service.reveal(ctx.param('ref'), ctx.body()),
    },
  ]);
}
