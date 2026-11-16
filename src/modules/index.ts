// Every module the API mounts. Add a new module here (see README: "Adding a module").
import { LookupsModule } from './lookups/lookups.module.ts';
import { SitesModule } from './sites/sites.module.ts';
import { UsersModule } from './users/users.module.ts';
import { WebhooksModule } from './webhooks/webhooks.module.ts';
import { LayoutsModule } from './layouts/layouts.module.ts';
import { SettingsModule } from './settings/settings.module.ts';
import { HolidaysModule } from './holidays/holidays.module.ts';
import { ClientsModule } from './clients/clients.module.ts';
import { EmployeesModule } from './employees/employees.module.ts';
import { BankAccountsModule } from './bank-accounts/bank-accounts.module.ts';

export const modules = [new UsersModule(), new SitesModule(), new LookupsModule(), new WebhooksModule(), new ClientsModule(), new SettingsModule(), new LayoutsModule(), new EmployeesModule(), new BankAccountsModule(), new HolidaysModule()];
