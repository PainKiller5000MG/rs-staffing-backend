// Domain events (employee.created, run.locked, …). Services emit into the
// request's buffer; the route registry delivers them only after the
// transaction commits, so a rolled-back write never announces itself.
// Listeners (notifications, jobs) subscribe here and stay out of services.
import type { Logger } from './logger.ts';

export type DomainEvent = { name: string; payload: Record<string, unknown> };
type Listener = (event: DomainEvent) => void | Promise<void>;

export class EventBus {
  readonly #listeners = new Map<string, Listener[]>();
  readonly #logger: Logger;

  constructor({ logger }: { logger: Logger }) {
    this.#logger = logger;
  }

  on(name: string, listener: Listener): void {
    this.#listeners.set(name, [...(this.#listeners.get(name) ?? []), listener]);
  }

  async deliver(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      for (const listener of this.#listeners.get(event.name) ?? []) {
        try {
          await listener(event);
        } catch (err) {
          this.#logger.error({ err, event: event.name }, 'event listener failed');
        }
      }
    }
  }
}

/** Per-request buffer services emit into. */
export class EventBuffer {
  readonly events: DomainEvent[] = [];

  emit(name: string, payload: Record<string, unknown>): void {
    this.events.push({ name, payload });
  }
}
