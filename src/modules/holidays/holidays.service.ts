// Holiday rules (M14-HOL-01..05) and the shared calendar functions other modules call
// (holidaysFor, isWorkingDay, addWorkingDays). Throws AppErrors; audit() on every write.
import { audit } from '../../core/audit.ts';
import type { Ctx } from '../../core/context.ts';
import type { EventBuffer } from '../../core/events.ts';
import { addWorkingDays, isWorkingDay, mergeSiteHolidays, weeklyOffDays, type HolidayLevel, type SiteHoliday } from '../../engine/calendar.ts';
import { parseDate } from '../../lib/dates.ts';
import type { SettingsService } from '../settings/settings.service.ts';
import { calendarCache, type SiteYear } from './calendar-cache.ts';
import * as errors from './holidays.errors.ts';
import type { Holiday, HolidayFields, HolidaysRepository, Replacement } from './holidays.repository.ts';
import {
  ImportHolidayRow,
  type CreateHolidayBody,
  type CreateReplacementBody,
  type ImpactBody,
  type ImportHolidaysBody,
  type ListHolidaysQuery,
  type ListReplacementsQuery,
  type SiteHolidaysQuery,
  type UpdateHolidayBody,
} from './holidays.schemas.ts';

type Deps = { holidaysRepository: HolidaysRepository; settingsService: SettingsService; ctx: Ctx; events: EventBuffer };
type RowError = { path: string; message: string };

/** What a change touches: the dates, and the active sites whose calendar moves. */
type Change = { dates: string[]; siteIds: string[] };

const LOCKED = ['LOCKED', 'PUBLISHED'];
const OPEN = ['COMPUTED', 'CHECKED'];

export const holidayView = (h: Holiday) => ({ id: h.id, date: h.date, year: h.year, name: h.name, level: h.level, scopeKey: h.scopeKey, paid: h.paid, type: h.optional ? ('OPTIONAL' as const) : ('FIXED' as const), half: h.half });
const replacementView = (r: Replacement) => ({ id: r.id, clientId: r.clientId, holidayId: r.holidayId, replacementDate: r.replacementDate, status: 'REPLACED' as const });

export class HolidaysService {
  readonly #repo: HolidaysRepository;
  readonly #settings: SettingsService;
  readonly #ctx: Ctx;
  readonly #events: EventBuffer;

  constructor({ holidaysRepository, settingsService, ctx, events }: Deps) {
    this.#repo = holidaysRepository;
    this.#settings = settingsService;
    this.#ctx = ctx;
    this.#events = events;
  }

  // --- reads ----------------------------------------------------------------

  async list(q: ListHolidaysQuery) {
    const rows = await this.#repo.list({ ...q, limit: q.limit + 1 });
    const page = rows.slice(0, q.limit);
    return { items: page.map(holidayView), nextCursor: rows.length > q.limit ? page[page.length - 1]!.id : null };
  }

  async listReplacements(q: ListReplacementsQuery) {
    const rows = await this.#repo.liveReplacements({ clientId: q.clientId, cursor: q.cursor, limit: q.limit + 1 });
    const page = rows.slice(0, q.limit);
    return { items: page.map(replacementView), nextCursor: rows.length > q.limit ? page[page.length - 1]!.id : null };
  }

  /** M14-HOL-03: the merged calendar of one site for a year. */
  async siteCalendar(siteId: string, { year }: SiteHolidaysQuery) {
    const items = await this.holidaysFor(siteId, parseDate(`${year}-01-01`), parseDate(`${year}-12-31`));
    return { siteId, year, items: items.map(({ date, name, levels, half, replacesDate }) => ({ date, name, levels, half, replacesDate })) };
  }

  // --- the shared calendar functions (M14-HOL-03) -----------------------------

  /** Paid holidays of a site between two dates, inclusive. Optional ones only when the employee chose them. */
  async holidaysFor(siteId: string, from: Temporal.PlainDate, to: Temporal.PlainDate, opts: { chosenOptional?: ReadonlySet<string> } = {}): Promise<SiteHoliday[]> {
    if (Temporal.PlainDate.compare(to, from) < 0) return [];
    const out: SiteHoliday[] = [];
    for (let year = from.year; year <= to.year; year++) {
      const data = await this.#siteYear(siteId, year);
      out.push(...mergeSiteHolidays({ ...data, from: from.toString(), to: to.toString(), chosenOptional: opts.chosenOptional }));
    }
    return out;
  }

  /** Not a weekly off (client/site setting) and not a paid holiday. */
  async isWorkingDay(siteId: string, date: Temporal.PlainDate): Promise<boolean> {
    const holidays = await this.holidaysFor(siteId, date, date);
    return isWorkingDay(date, await this.#weeklyOff(siteId, date), new Map(holidays.map((h) => [h.date, h])));
  }

  /** The n-th working day after `date` (used by the F&F due date). The weekly off is the one in force on `date`. */
  async addWorkingDays(siteId: string, date: Temporal.PlainDate, n: number): Promise<Temporal.PlainDate> {
    const off = await this.#weeklyOff(siteId, date);
    // Load every year the walk might touch up front, then walk synchronously.
    const marks = new Map<string, SiteHoliday>();
    for (let year = date.year; year <= date.year + 3; year++) {
      for (const h of await this.holidaysFor(siteId, parseDate(`${year}-01-01`), parseDate(`${year}-12-31`))) marks.set(h.date, h);
    }
    return addWorkingDays(date, n, (d) => isWorkingDay(d, off, marks));
  }

  async #siteYear(siteId: string, year: number): Promise<SiteYear> {
    const hit = calendarCache.get(siteId, year);
    if (hit) return hit;
    const site = await this.#repo.site(siteId);
    if (!site) throw errors.siteNotFound();
    const holidays = await this.#repo.reaching(site, year);
    const reps = await this.#repo.liveReplacements({ clientId: site.clientId });
    const ids = new Set(holidays.map((h) => h.id));
    const value: SiteYear = {
      site: { siteId: site.siteId, clientId: site.clientId, stateCode: site.stateCode },
      holidays,
      replacements: reps.filter((r) => ids.has(r.holidayId)).map((r) => ({ clientId: r.clientId, holidayId: r.holidayId, replacementDate: r.replacementDate })),
    };
    calendarCache.set(siteId, year, value);
    return value;
  }

  async #weeklyOff(siteId: string, date: Temporal.PlainDate) {
    const { settings } = await this.#settings.forSite(siteId, date.toString());
    return weeklyOffDays(settings.find((s) => s.key === 'WEEKLY_OFF_DAYS')?.value ?? null);
  }

  // --- writes ---------------------------------------------------------------

  /** M14-HOL-01. */
  async create(body: CreateHolidayBody) {
    const fields = this.#fields(body);
    await this.#assertParent(fields.level, fields.scopeKey);
    if (await this.#repo.liveAt(fields.level, fields.scopeKey, fields.date)) throw errors.duplicate();
    await this.#assertNotLocked(await this.#changeOf(fields.level, fields.scopeKey, [fields.date]));
    const created = await this.#repo.insert(fields, this.#ctx.user.id);
    await audit(this.#ctx, 'holiday.create', 'holiday', null, holidayView(created));
    await this.#announce('ADD', await this.#changeOf(created.level, created.scopeKey, [created.date]), created.id);
    return holidayView(created);
  }

  async update(id: string, body: UpdateHolidayBody) {
    const before = await this.#live(id);
    const patch = {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.paid !== undefined ? { paid: body.paid } : {}),
      ...(body.type !== undefined ? { optional: body.type === 'OPTIONAL' } : {}),
      ...(body.half !== undefined ? { half: body.half } : {}),
    };
    const merged = { paid: patch.paid ?? before.paid, optional: patch.optional ?? before.optional, half: patch.half ?? before.half };
    if (before.level === 'NATIONAL' && (!merged.paid || merged.optional || merged.half)) throw errors.nationalFixed();
    const changesPay = merged.paid !== before.paid || merged.optional !== before.optional || merged.half !== before.half;
    const change = await this.#changeOf(before.level, before.scopeKey, await this.#datesOf(before));
    if (changesPay) await this.#assertNotLocked(change);
    const after = await this.#repo.update(id, patch);
    await audit(this.#ctx, 'holiday.update', 'holiday', holidayView(before), holidayView(after));
    if (changesPay) await this.#announce('UPDATE', change, id);
    return holidayView(after);
  }

  /** No hard deletes: the row is marked removed (and its client replacements with it). */
  async remove(id: string) {
    const before = await this.#live(id);
    const reps = await this.#repo.liveReplacements({ holidayId: id });
    const change = await this.#changeOf(before.level, before.scopeKey, [before.date, ...reps.map((r) => r.replacementDate)]);
    await this.#assertNotLocked(change);
    for (const r of reps) {
      const gone = await this.#repo.removeReplacement(r.id, this.#ctx.user.id);
      await audit(this.#ctx, 'holiday_replacement.remove', 'holiday_replacement', replacementView(r), replacementView(gone));
    }
    const after = await this.#repo.remove(id, this.#ctx.user.id);
    await audit(this.#ctx, 'holiday.remove', 'holiday', holidayView(before), { ...holidayView(after), removed: true });
    await this.#announce('REMOVE', change, id);
    return holidayView(after);
  }

  /** M14-HOL-02 AC1: the client works the state holiday and gives another day instead. */
  async replace(body: CreateReplacementBody) {
    const client = await this.#repo.client(body.clientId);
    if (!client) throw errors.unknownClient();
    if (client.status !== 'ACTIVE') throw errors.clientInactive();
    const holiday = await this.#live(body.holidayId);
    if (holiday.level === 'NATIONAL') throw errors.nationalNotReplaceable();
    if (holiday.level !== 'STATE') throw errors.notStateHoliday();
    if (body.replacementDate === holiday.date) throw errors.replacementSameDay();
    if (Number(body.replacementDate.slice(0, 4)) !== holiday.year) throw errors.replacementOtherYear();
    if ((await this.#repo.liveReplacements({ clientId: body.clientId, holidayId: holiday.id })).length > 0) throw errors.alreadyReplaced();
    const change = await this.#replacementChange(body.clientId, holiday, body.replacementDate);
    await this.#assertNotLocked(change);
    const created = await this.#repo.insertReplacement(body, this.#ctx.user.id);
    await audit(this.#ctx, 'holiday_replacement.create', 'holiday_replacement', null, replacementView(created));
    await this.#announce('REPLACE', change, holiday.id);
    return replacementView(created);
  }

  async unreplace(id: string) {
    const before = await this.#repo.replacementById(id);
    if (!before || before.removedAt) throw errors.replacementNotFound();
    const holiday = (await this.#repo.findById(before.holidayId))!;
    const change = await this.#replacementChange(before.clientId, holiday, before.replacementDate);
    await this.#assertNotLocked(change);
    const after = await this.#repo.removeReplacement(id, this.#ctx.user.id);
    await audit(this.#ctx, 'holiday_replacement.remove', 'holiday_replacement', replacementView(before), { ...replacementView(after), removed: true });
    await this.#announce('UNREPLACE', change, holiday.id);
    return replacementView(after);
  }

  // --- M14-HOL-05: what a change affects ----------------------------------------

  async impact(body: ImpactBody) {
    let change: Change;
    if (body.action === 'ADD') {
      const f = this.#fields(body.holiday);
      await this.#assertParent(f.level, f.scopeKey);
      change = await this.#changeOf(f.level, f.scopeKey, [f.date]);
    } else if (body.action === 'REMOVE') {
      const h = await this.#live(body.holidayId);
      const reps = await this.#repo.liveReplacements({ holidayId: h.id });
      change = await this.#changeOf(h.level, h.scopeKey, [h.date, ...reps.map((r) => r.replacementDate)]);
    } else if (body.action === 'REPLACE') {
      const h = await this.#live(body.replacement.holidayId);
      if (h.level !== 'STATE') throw h.level === 'NATIONAL' ? errors.nationalNotReplaceable() : errors.notStateHoliday();
      change = await this.#replacementChange(body.replacement.clientId, h, body.replacement.replacementDate);
    } else {
      const r = await this.#repo.replacementById(body.replacementId);
      if (!r || r.removedAt) throw errors.replacementNotFound();
      change = await this.#replacementChange(r.clientId, (await this.#repo.findById(r.holidayId))!, r.replacementDate);
    }
    const [lockedRuns, openRuns, employees] = await Promise.all([
      this.#repo.runsTouching(change.siteIds, change.dates, LOCKED),
      this.#repo.runsTouching(change.siteIds, change.dates, OPEN),
      this.#repo.employeesDeployed(change.siteIds, change.dates),
    ]);
    return {
      dates: change.dates,
      sites: change.siteIds.length,
      employees: employees.length,
      leaveRequests: await this.#repo.approvedLeaveOver(employees, change.dates),
      computedRuns: openRuns.length,
      lockedRuns,
      blocked: lockedRuns.length > 0,
    };
  }

  // --- M14-HOL-04: Excel import -------------------------------------------------

  /** Every row is checked; a valid row is saved unless `preview`. Dates outside the year and duplicates are flagged. */
  async importMany({ year, preview, rows }: ImportHolidaysBody) {
    const results: { row: number; status: 'OK' | 'CREATED' | 'REJECTED'; id: string | null; errors: RowError[] }[] = [];
    const seen = new Set<string>();
    for (const [i, raw] of rows.entries()) {
      const row = i + 1;
      const reject = (errs: RowError[]) => results.push({ row, status: 'REJECTED', id: null, errors: errs });
      const parsed = ImportHolidayRow.safeParse(raw);
      if (!parsed.success) {
        reject(parsed.error.issues.map((e) => ({ path: e.path.join('.') || 'row', message: e.message })));
        continue;
      }
      const r = parsed.data;
      const problems: RowError[] = [];
      if (Number(r.date.slice(0, 4)) !== year) problems.push({ path: 'date', message: `Date is outside ${year}` });
      let scopeKey: string | null = null;
      if (r.level === 'STATE') {
        scopeKey = r.stateCode!;
        if (!(await this.#repo.stateExists(scopeKey))) problems.push({ path: 'stateCode', message: 'Unknown state' });
      } else if (r.level === 'CLIENT') {
        const client = await this.#repo.clientByCode(r.clientCode!);
        if (!client) problems.push({ path: 'clientCode', message: 'Unknown client code' });
        else if (client.status !== 'ACTIVE') problems.push({ path: 'clientCode', message: 'This client is not active' });
        else scopeKey = client.id;
      } else if (r.level === 'SITE') {
        const site = await this.#repo.siteByCode(r.siteCode!);
        if (!site) problems.push({ path: 'siteCode', message: 'Unknown site code' });
        else if (site.status !== 'ACTIVE') problems.push({ path: 'siteCode', message: 'This site is closed' });
        else scopeKey = site.id;
      }
      if (problems.length === 0) {
        const dupKey = `${r.level}|${scopeKey ?? ''}|${r.date}`;
        if (seen.has(dupKey) || (await this.#repo.liveAt(r.level, scopeKey, r.date))) problems.push({ path: 'date', message: 'Duplicate: a holiday already exists on this date for this level and key' });
        seen.add(dupKey);
      }
      if (problems.length) {
        reject(problems);
        continue;
      }
      const fields: HolidayFields = { level: r.level, scopeKey, date: r.date, year, name: r.name, paid: r.paid, optional: r.type === 'OPTIONAL', half: r.half };
      const change = await this.#changeOf(fields.level, fields.scopeKey, [fields.date]);
      const locked = await this.#repo.runsTouching(change.siteIds, change.dates, LOCKED);
      if (locked.length) {
        reject([{ path: 'date', message: 'Payroll for this month is locked for the affected sites. Use an adjustment run.' }]);
        continue;
      }
      if (preview) {
        results.push({ row, status: 'OK', id: null, errors: [] });
        continue;
      }
      const created = await this.#repo.insert(fields, this.#ctx.user.id);
      await audit(this.#ctx, 'holiday.create', 'holiday', null, holidayView(created));
      await this.#announce('ADD', change, created.id);
      results.push({ row, status: 'CREATED', id: created.id, errors: [] });
    }
    const rejected = results.filter((r) => r.status === 'REJECTED').length;
    return { preview, year, created: results.filter((r) => r.status === 'CREATED').length, rejected, results };
  }

  // --- helpers --------------------------------------------------------------

  #fields(b: CreateHolidayBody): HolidayFields {
    return { level: b.level, scopeKey: b.level === 'NATIONAL' ? null : (b.scopeKey ?? null), date: b.date, year: Number(b.date.slice(0, 4)), name: b.name, paid: b.paid, optional: b.type === 'OPTIONAL', half: b.half };
  }

  async #live(id: string): Promise<Holiday> {
    const h = await this.#repo.findById(id);
    if (!h || h.removedAt) throw errors.notFound();
    return h;
  }

  /** The key must exist, and a client or site must still be active. */
  async #assertParent(level: HolidayLevel, key: string | null): Promise<void> {
    if (level === 'STATE' && !(await this.#repo.stateExists(key!))) throw errors.unknownState();
    if (level === 'CLIENT') {
      const c = await this.#repo.client(key!);
      if (!c) throw errors.unknownClient();
      if (c.status !== 'ACTIVE') throw errors.clientInactive();
    }
    if (level === 'SITE') {
      const s = await this.#repo.site(key!);
      if (!s) throw errors.unknownSite();
      if (s.status !== 'ACTIVE') throw errors.siteClosed();
    }
  }

  /** The dates a holiday's row moves: its own day, plus the replacement days clients gave for it. */
  async #datesOf(h: Holiday): Promise<string[]> {
    const reps = h.level === 'STATE' ? await this.#repo.liveReplacements({ holidayId: h.id }) : [];
    return [h.date, ...reps.map((r) => r.replacementDate)];
  }

  async #changeOf(level: HolidayLevel, key: string | null, dates: string[]): Promise<Change> {
    return { dates: [...new Set(dates)].sort(), siteIds: await this.#repo.activeSiteIds(level, key) };
  }

  /** A client's swap moves the holiday's own day and the replacement day, for that client's sites in that state. */
  async #replacementChange(clientId: string, holiday: Holiday, replacementDate: string): Promise<Change> {
    return { dates: [...new Set([holiday.date, replacementDate])].sort(), siteIds: await this.#repo.activeSiteIds('CLIENT', clientId, holiday.scopeKey!) };
  }

  /** M14-HOL-05 AC1. */
  async #assertNotLocked(change: Change): Promise<void> {
    const locked = await this.#repo.runsTouching(change.siteIds, change.dates, LOCKED);
    if (locked.length) throw errors.monthLocked(locked);
  }

  /** After the change is saved: other modules (attendance, leave, payroll) react to this once committed; the calendar cache clears. */
  async #announce(action: string, change: Change, holidayId: string): Promise<void> {
    this.#events.emit('holiday.changed', { action, holidayId, dates: change.dates, siteIds: change.siteIds });
  }
}
