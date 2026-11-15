import { asClass } from 'awilix';
import { Module } from '../../core/module.ts';
import { SettingsController } from './settings.controller.ts';
import { SettingsRepository } from './settings.repository.ts';
import { SettingsService } from './settings.service.ts';

export class SettingsModule extends Module {
  readonly name = 'settings';
  readonly providers = {
    settingsRepository: asClass(SettingsRepository).scoped(),
    settingsService: asClass(SettingsService).scoped(),
  };
  readonly controllers = [SettingsController];
}
