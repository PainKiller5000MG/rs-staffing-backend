import { asClass } from 'awilix';
import { Module } from '../../core/module.ts';
import { LookupsController } from './lookups.controller.ts';
import { LookupsRepository } from './lookups.repository.ts';
import { LookupsService } from './lookups.service.ts';

export class LookupsModule extends Module {
  readonly name = 'lookups';
  readonly providers = {
    lookupsRepository: asClass(LookupsRepository).scoped(),
    lookupsService: asClass(LookupsService).scoped(),
  };
  readonly controllers = [LookupsController];
}
