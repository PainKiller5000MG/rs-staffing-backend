import type { Executor } from '../../core/context.ts';

export class LookupsRepository {
  readonly #executor: Executor;

  constructor({ executor }: { executor: Executor }) {
    this.#executor = executor;
  }

  async states() {
    const rows = await this.#executor.orm.app.State.orderBy((s) => s.code.asc()).all();
    return rows.map((s) => ({
      code: s.code,
      name: s.name,
      ptApplies: s.ptApplies,
      lwfApplies: s.lwfApplies,
      rulesCompleteThrough: s.rulesCompleteThrough?.toString() ?? null,
    }));
  }
}
