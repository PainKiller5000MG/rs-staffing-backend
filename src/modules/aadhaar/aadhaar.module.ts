import { asClass } from 'awilix';
import { Module } from '../../core/module.ts';
import { AadhaarController } from './aadhaar.controller.ts';
import { AadhaarRepository } from './aadhaar.repository.ts';
import { AadhaarService } from './aadhaar.service.ts';

export class AadhaarModule extends Module {
  readonly name = 'aadhaar';
  readonly providers = {
    aadhaarRepository: asClass(AadhaarRepository).scoped(),
    aadhaarService: asClass(AadhaarService).scoped(),
  };
  readonly controllers = [AadhaarController];
}
