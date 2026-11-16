import { asClass } from 'awilix';
import { Module } from '../../core/module.ts';
import { DeploymentsController } from './deployments.controller.ts';
import { DeploymentsRepository } from './deployments.repository.ts';
import { DeploymentsService } from './deployments.service.ts';

export class DeploymentsModule extends Module {
  readonly name = 'deployments';
  readonly providers = {
    deploymentsRepository: asClass(DeploymentsRepository).scoped(),
    deploymentsService: asClass(DeploymentsService).scoped(),
  };
  readonly controllers = [DeploymentsController];
}
