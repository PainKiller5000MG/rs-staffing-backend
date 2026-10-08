import { defineRoutes } from '../../core/routes.ts';
import { DlrResult, Msg91DlrBody } from './webhooks.schemas.ts';
import type { WebhooksService } from './webhooks.service.ts';

export class WebhooksController {
  readonly service: WebhooksService;

  constructor({ webhooksService }: { webhooksService: WebhooksService }) {
    this.service = webhooksService;
  }

  static readonly routes = defineRoutes<WebhooksController>([
    {
      method: 'post',
      path: '/webhooks/msg91/dlr',
      summary: 'MSG91 SMS delivery reports (M16-SMS-02). Authenticated by the x-rs-webhook-secret header.',
      roles: 'public',
      body: Msg91DlrBody,
      response: DlrResult,
      audit: 'delivery.status',
      auditOnChange: true,
      handler: (c, ctx) => c.service.msg91Dlr(ctx.body()),
    },
  ]);
}
