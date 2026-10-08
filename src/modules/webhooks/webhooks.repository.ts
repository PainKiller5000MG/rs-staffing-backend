import type { Executor } from '../../core/context.ts';
import type { Models } from '../../prisma/contract.d.ts';

type D = Models.app_Delivery;
export type DeliveryStatus = D['status'];

export class WebhooksRepository {
  readonly #executor: Executor;

  constructor({ executor }: { executor: Executor }) {
    this.#executor = executor;
  }

  async findDelivery(providerMsgId: string, toMobile: string) {
    const row = await this.#executor.orm.app.Delivery.select('id', 'status', 'reason')
      .where({ providerMsgId: providerMsgId as D['providerMsgId'], toMobile: toMobile as D['toMobile'] })
      .first();
    return row && { id: row.id, status: row.status, reason: row.reason };
  }

  async setStatus(id: string, status: DeliveryStatus, reason: string | null) {
    const now = Temporal.Now.instant();
    await this.#executor.orm.app.Delivery.where({ id: id as D['id'] }).update({
      status,
      reason: reason as D['reason'],
      ...(status === 'DELIVERED' ? { deliveredAt: now as D['deliveredAt'] } : {}),
      ...(status === 'SUBMITTED' ? { submittedAt: now as D['submittedAt'] } : {}),
    });
  }
}
