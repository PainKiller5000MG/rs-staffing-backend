import type { Scalars } from '@prisma/orm-postgres/family-contract/types';
import type { Executor } from '../../core/context.ts';
import type { Models } from '../../prisma/contract.d.ts';

type SiteRow = Scalars<Models.app_Site>;

export type Site = {
  id: string;
  clientId: string;
  code: string;
  name: string;
  stateCode: string;
  minWageZone: string | null;
  status: SiteRow['status'];
};

const toSite = (r: SiteRow): Site => ({
  id: r.id,
  clientId: r.clientId,
  code: r.code,
  name: r.name,
  stateCode: r.stateCode,
  minWageZone: r.minWageZone,
  status: r.status,
});

export class SitesRepository {
  readonly #executor: Executor;

  constructor({ executor }: { executor: Executor }) {
    this.#executor = executor;
  }

  async findById(id: string): Promise<Site | null> {
    const row = await this.#executor.orm.app.Site.first({ id: id as SiteRow['id'] });
    return row && toSite(row);
  }

  /** All sites, or only `ids` when given (a supervisor's reach). */
  async list(ids?: readonly string[]): Promise<Site[]> {
    let query = this.#executor.orm.app.Site.orderBy((s) => s.code.asc());
    if (ids) query = query.where((s) => s.id.in(ids as SiteRow['id'][]));
    return (await query.all()).map(toSite);
  }
}
