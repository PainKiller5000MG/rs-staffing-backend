import { asClass } from 'awilix';
import { BetterAuthIdentity } from '../../auth/identity.ts';
import { Module } from '../../core/module.ts';
import { UsersController } from './users.controller.ts';
import { UsersRepository } from './users.repository.ts';
import { UsersService } from './users.service.ts';

export class UsersModule extends Module {
  readonly name = 'users';
  readonly providers = {
    usersRepository: asClass(UsersRepository).scoped(),
    usersService: asClass(UsersService).scoped(),
    identity: asClass(BetterAuthIdentity).singleton(),
  };
  readonly controllers = [UsersController];
}
