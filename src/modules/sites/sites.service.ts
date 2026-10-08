// Read-only for now: just enough of Module 2 for supervisor scoping
// (M1-SCP-02). Creating and editing sites arrives with Module 2.
import type { Ctx } from '../../core/context.ts';
import { NotFoundError } from '../../core/errors.ts';
import type { SitesRepository } from './sites.repository.ts';

export class SitesService {
  readonly #sites: SitesRepository;
  readonly #ctx: Ctx;

  constructor({ sitesRepository, ctx }: { sitesRepository: SitesRepository; ctx: Ctx }) {
    this.#sites = sitesRepository;
    this.#ctx = ctx;
  }

  /** HQ sees every site; a supervisor sees only their approved, current scopes. */
  async list() {
    const { role, siteIds } = this.#ctx.user;
    return { items: await this.#sites.list(role === 'SUPERVISOR' ? siteIds : undefined) };
  }

  async get(id: string) {
    const site = await this.#sites.findById(id);
    if (!site) throw new NotFoundError('Site');
    return site;
  }
}
