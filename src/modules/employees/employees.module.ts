import { asClass } from 'awilix';
import { Module } from '../../core/module.ts';
import { EmployeesController } from './employees.controller.ts';
import { EmployeesRepository } from './employees.repository.ts';
import { EmployeesService } from './employees.service.ts';

export class EmployeesModule extends Module {
  readonly name = 'employees';
  readonly providers = {
    employeesRepository: asClass(EmployeesRepository).scoped(),
    employeesService: asClass(EmployeesService).scoped(),
  };
  readonly controllers = [EmployeesController];
}
