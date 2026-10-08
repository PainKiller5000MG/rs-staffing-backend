import { asClass } from 'awilix';
import { Module } from '../../core/module.ts';
import { SitesController } from './sites.controller.ts';
import { SitesRepository } from './sites.repository.ts';
import { SitesService } from './sites.service.ts';

export class SitesModule extends Module {
  readonly name = 'sites';
  readonly providers = {
    sitesRepository: asClass(SitesRepository).scoped(),
    sitesService: asClass(SitesService).scoped(),
  };
  readonly controllers = [SitesController];
}
