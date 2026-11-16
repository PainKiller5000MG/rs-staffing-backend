import { asClass } from 'awilix';
import { Module } from '../../core/module.ts';
import { HolidaysController } from './holidays.controller.ts';
import { HolidaysRepository } from './holidays.repository.ts';
import { HolidaysService } from './holidays.service.ts';

export class HolidaysModule extends Module {
  readonly name = 'holidays';
  readonly providers = {
    holidaysRepository: asClass(HolidaysRepository).scoped(),
    holidaysService: asClass(HolidaysService).scoped(),
  };
  readonly controllers = [HolidaysController];
}
