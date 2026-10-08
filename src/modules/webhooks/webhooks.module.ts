import { asClass } from 'awilix';
import { Module } from '../../core/module.ts';
import { WebhooksController } from './webhooks.controller.ts';
import { WebhooksRepository } from './webhooks.repository.ts';
import { WebhooksService } from './webhooks.service.ts';

export class WebhooksModule extends Module {
  readonly name = 'webhooks';
  readonly providers = {
    webhooksRepository: asClass(WebhooksRepository).scoped(),
    webhooksService: asClass(WebhooksService).scoped(),
  };
  readonly controllers = [WebhooksController];
}
