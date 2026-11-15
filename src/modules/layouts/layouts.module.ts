import { asClass } from 'awilix';
import { Module } from '../../core/module.ts';
import { LayoutsController } from './layouts.controller.ts';
import { LayoutsRepository } from './layouts.repository.ts';
import { LayoutsService } from './layouts.service.ts';

export class LayoutsModule extends Module {
  readonly name = 'layouts';
  readonly providers = {
    layoutsRepository: asClass(LayoutsRepository).scoped(),
    layoutsService: asClass(LayoutsService).scoped(),
  };
  readonly controllers = [LayoutsController];
}
