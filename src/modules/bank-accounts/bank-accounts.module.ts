import { asClass } from 'awilix';
import { Module } from '../../core/module.ts';
import { BankAccountsController } from './bank-accounts.controller.ts';
import { BankAccountsRepository } from './bank-accounts.repository.ts';
import { BankAccountsService } from './bank-accounts.service.ts';

export class BankAccountsModule extends Module {
  readonly name = 'bank-accounts';
  readonly providers = {
    bankAccountsRepository: asClass(BankAccountsRepository).scoped(),
    bankAccountsService: asClass(BankAccountsService).scoped(),
  };
  readonly controllers = [BankAccountsController];
}
