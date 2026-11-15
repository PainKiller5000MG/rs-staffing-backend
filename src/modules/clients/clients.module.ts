import { asClass } from 'awilix';
import { Module } from '../../core/module.ts';
import { ClientsController } from './clients.controller.ts';
import { ClientsRepository } from './clients.repository.ts';
import { ClientsService } from './clients.service.ts';

export class ClientsModule extends Module {
  readonly name = 'clients';
  readonly providers = {
    clientsRepository: asClass(ClientsRepository).scoped(),
    clientsService: asClass(ClientsService).scoped(),
  };
  readonly controllers = [ClientsController];
}
