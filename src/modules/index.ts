// Every module the API mounts. Add a new module here (see README: "Adding a module").
import { SitesModule } from './sites/sites.module.ts';
import { UsersModule } from './users/users.module.ts';

export const modules = [new UsersModule(), new SitesModule()];
