// Settings rules (M2-SET-01..04, 06, 09, 10). Throws AppErrors; never touches HTTP or the ORM
// directly. Every row is dated and goes through maker-checker: a pending row grants nothing.
import { audit } from '../../core/audit.ts';
import type { Ctx } from '../../core/context.ts';
import { NotFoundError, makerChecker } from '../../core/errors.ts';
import { firstDay, parseDate, today, wageMonthOf } from '../../lib/dates.ts';
import * as errors from './settings.errors.ts';
import { KEYS, TEMPLATE_PREFIX, normaliseDesignation, storedKey, type SettingKey } from './settings.keys.ts';
import { isLive, resolveSettings } from './settings.resolve.ts';
import type { Setting, SettingsRepository } from './settings.repository.ts';
import type { ListSettingsQuery, ProposeSettingBody } from './settings.schemas.ts';

type Deps = { settingsRepository: SettingsRepository; ctx: Ctx };

const withStatus = (s: Setting) => {
  const t = today().toString();
  const status = !s.approved ? ('PENDING' as const) : s.effectiveFrom > t ? ('SCHEDULED' as const) : s.effectiveTo !== null && s.effectiveTo < t ? ('ENDED' as const) : ('ACTIVE' as const);
  const designation = s.key.startsWith(TEMPLATE_PREFIX) ? s.key.slice(TEMPLATE_PREFIX.length) : null;
  const { approved: _a, ...rest } = s;
  return { ...rest, key: designation ? 'SALARY_TEMPLATE' : s.key, designation, status };
};

export class SettingsService {
  readonly #repo: SettingsRepository;
  readonly #ctx: Ctx;

  constructor({ settingsRepository, ctx }: Deps) {
    this.#repo = settingsRepository;
    this.#ctx = ctx;
  }

  /** M2-SET-10 AC4 / M2-SET-01 AC3: maker records a dated, pending value. */
  async propose(body: ProposeSettingBody) {
    this.#guardScope(body.scope);
    const key = storedKey(body.key, body.designation && normaliseDesignation(body.designation));
    const value = KEYS[body.key].parse(body.value)!;
    const scopeId = body.scope === 'COMPANY' ? null : body.scopeId!;
    await this.#assertParent(body.scope, scopeId, body.key, value);

    const earliest = firstDay(wageMonthOf(today())).toString();
    if (body.effectiveFrom < earliest) throw errors.effectiveInPast(earliest);
    await this.#assertAfterLatest(body.scope, scopeId, key, body.effectiveFrom);

    const row = await this.#repo.create({ scope: body.scope, scopeId, key, value, effectiveFrom: body.effectiveFrom, createdBy: this.#ctx.user.id });
    const view = withStatus(row);
    await audit(this.#ctx, 'setting.propose', 'pay_setting', null, view);
    return view;
  }

  /** Checker: a second person approves; the value it replaces ends the day before. */
  async approve(id: string) {
    const before = await this.#repo.findById(id);
    if (!before) throw new NotFoundError('Setting');
    this.#guardScope(before.scope);
    if (before.approved) throw errors.alreadyApproved();
    if (before.createdBy === this.#ctx.user.id) throw makerChecker();

    const latest = await this.#assertAfterLatest(before.scope, before.scopeId, before.key, before.effectiveFrom);
    if (latest) await this.#repo.endOn(latest.id, parseDate(before.effectiveFrom).subtract({ days: 1 }).toString());
    const after = await this.#repo.approve(id, this.#ctx.user.id);
    const view = withStatus(after);
    await audit(this.#ctx, 'setting.approve', 'pay_setting', withStatus(before), { ...view, replaced: latest?.id ?? null });
    return view;
  }

  async list(query: ListSettingsQuery) {
    const { status, ...filters } = query;
    const rows = (await this.#repo.list({ ...filters, limit: query.limit + 1 })).map(withStatus);
    const page = rows.slice(0, query.limit);
    return { items: status ? page.filter((r) => r.status === status) : page, nextCursor: rows.length > query.limit ? page[page.length - 1]!.id : null };
  }

  /** M2-SET-09: what applied to this client on `asOf` (company → client). */
  async forClient(clientId: string, asOf?: string) {
    const client = await this.#repo.client(clientId);
    if (!client) throw new NotFoundError('Client');
    const day = asOf ?? today().toString();
    const rows = await this.#repo.reaching(clientId);
    const settings = this.#withLegacyPeriod(resolveSettings(rows, day, { clientId }), client.payPeriodStartDay);
    return { asOf: day, clientId, siteId: null, settings };
  }

  /** M2-SET-10 AC2: site → client → company. */
  async forSite(siteId: string, asOf?: string) {
    const site = await this.#repo.site(siteId);
    if (!site) throw new NotFoundError('Site');
    const client = (await this.#repo.client(site.clientId))!;
    const day = asOf ?? today().toString();
    const rows = await this.#repo.reaching(site.clientId, siteId);
    const settings = this.#withLegacyPeriod(resolveSettings(rows, day, { clientId: site.clientId, siteId }), client.payPeriodStartDay);
    return { asOf: day, clientId: site.clientId, siteId, settings };
  }

  /** M2-SET-04: the client's default salary template and one per designation. */
  async salaryDefaults(clientId: string, asOf?: string) {
    if (!(await this.#repo.client(clientId))) throw new NotFoundError('Client');
    const day = asOf ?? today().toString();
    const live = (await this.#repo.reaching(clientId)).filter((r) => r.scope === 'CLIENT' && isLive(r, day) && (r.key === 'SALARY_TEMPLATE' || r.key.startsWith(TEMPLATE_PREFIX)));
    const own = live.find((r) => r.key === 'SALARY_TEMPLATE');
    return {
      asOf: day,
      clientId,
      default: own ? { templateId: own.value, effectiveFrom: own.effectiveFrom } : null,
      designations: live
        .filter((r) => r.key.startsWith(TEMPLATE_PREFIX))
        .map((r) => ({ designation: r.key.slice(TEMPLATE_PREFIX.length), templateId: r.value, effectiveFrom: r.effectiveFrom }))
        .sort((a, b) => a.designation.localeCompare(b.designation)),
    };
  }

  // --- rules -----------------------------------------------------------

  /** Company-wide values change what every client pays, so only an Admin proposes or approves them. */
  #guardScope(scope: string) {
    if (scope === 'COMPANY' && this.#ctx.user.role !== 'ADMIN') throw errors.companyAdminOnly();
  }

  /** The pay period start lived on the client row before settings existed; it stays the value until a dated row replaces it. */
  #withLegacyPeriod<T extends { key: SettingKey; source: string; value: string | null }>(settings: T[], start: number): T[] {
    return settings.map((s) => (s.key === 'PAY_PERIOD_START_DAY' && s.source === 'DEFAULT' ? { ...s, value: String(start), source: 'CLIENT' } : s));
  }

  async #assertParent(scope: string, scopeId: string | null, key: SettingKey, value: string) {
    if (scope === 'CLIENT') {
      const client = await this.#repo.client(scopeId!);
      if (!client) throw errors.unknownClient();
      if (client.status !== 'ACTIVE') throw errors.clientInactive();
    }
    if (scope === 'SITE') {
      const site = await this.#repo.site(scopeId!);
      if (!site) throw errors.unknownSite();
      if (site.status !== 'ACTIVE') throw errors.siteClosed();
    }
    if (key === 'SALARY_TEMPLATE') {
      const template = await this.#repo.template(value);
      if (!template) throw errors.unknownTemplate();
      if (template.status !== 'ACTIVE') throw errors.templateUnusable('This salary template is not active');
      if (template.clientId !== null && template.clientId !== scopeId) throw errors.templateUnusable("This salary template belongs to another client");
    }
  }

  /** A new value must start after the newest approved one (no overlap, no rewriting history). Returns that row. */
  async #assertAfterLatest(scope: Setting['scope'], scopeId: string | null, key: string, from: string) {
    const latest = await this.#repo.latestApproved(scope, scopeId, key);
    if (latest && (latest.effectiveFrom >= from || (latest.effectiveTo !== null && latest.effectiveTo >= from))) throw errors.overlap(latest.effectiveFrom);
    return latest;
  }
}

