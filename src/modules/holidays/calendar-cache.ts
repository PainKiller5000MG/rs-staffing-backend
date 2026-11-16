// M14-HOL-03 AC3: holiday rows per site per year, kept in memory. Every holiday change emits
// `holiday.changed`, which the app turns into clear() once the transaction has committed (core/app.ts).
// A time limit backs that up, so a missed signal (another API instance) is stale for minutes at most.
import type { HolidayRow, ReplacementRow, SiteReach } from '../../engine/calendar.ts';

export type SiteYear = { site: SiteReach; holidays: HolidayRow[]; replacements: ReplacementRow[] };

const TTL_MS = 5 * 60_000;

class CalendarCache {
  readonly #entries = new Map<string, { at: number; value: SiteYear }>();

  get(siteId: string, year: number): SiteYear | undefined {
    const hit = this.#entries.get(`${siteId}:${year}`);
    if (!hit) return undefined;
    if (Date.now() - hit.at > TTL_MS) {
      this.#entries.delete(`${siteId}:${year}`);
      return undefined;
    }
    return hit.value;
  }

  set(siteId: string, year: number, value: SiteYear): void {
    this.#entries.set(`${siteId}:${year}`, { at: Date.now(), value });
  }

  clear(): void {
    this.#entries.clear();
  }

  get size(): number {
    return this.#entries.size;
  }
}

export const calendarCache = new CalendarCache();
