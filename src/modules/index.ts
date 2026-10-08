// Every module the API mounts. Add a new module here (see README: "Adding a module").
import { LookupsModule } from './lookups/lookups.module.ts';
import { SitesModule } from './sites/sites.module.ts';
import { UsersModule } from './users/users.module.ts';
import { WebhooksModule } from './webhooks/webhooks.module.ts';

export const modules = [new UsersModule(), new SitesModule(), new LookupsModule(), new WebhooksModule()];
