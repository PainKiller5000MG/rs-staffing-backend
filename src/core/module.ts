// A module bundles its providers (services, repositories — resolved per
// request) and its controllers (which declare routes). createApp() mounts them.
import type { Resolver } from 'awilix';
import type { RouteDef } from './routes.ts';

export interface ControllerClass {
  new (cradle: never): object;
  readonly routes: readonly RouteDef<never>[];
}

export abstract class Module {
  abstract readonly name: string;
  /** Registered request-scoped in the container, keyed by name (e.g. usersService). */
  abstract readonly providers: Record<string, Resolver<unknown>>;
  abstract readonly controllers: readonly ControllerClass[];
}
