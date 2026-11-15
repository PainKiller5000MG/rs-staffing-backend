// Attendance layout rules (M2-SET-05). Editing never changes a row: it adds version + 1, so an import
// that points at a version keeps reading the sheet the way it was read then.
import { randomUUID } from 'node:crypto';
import { audit } from '../../core/audit.ts';
import type { Ctx } from '../../core/context.ts';
import { NotFoundError } from '../../core/errors.ts';
import * as errors from './layouts.errors.ts';
import type { Layout, LayoutsRepository } from './layouts.repository.ts';
import type { CreateLayoutBody, ListLayoutsQuery, NewVersionBody } from './layouts.schemas.ts';

type Deps = { layoutsRepository: LayoutsRepository; ctx: Ctx };

const view = (l: Layout, latest: number) => ({ ...l, isLatest: l.version === latest });

export class LayoutsService {
  readonly #repo: LayoutsRepository;
  readonly #ctx: Ctx;

  constructor({ layoutsRepository, ctx }: Deps) {
    this.#repo = layoutsRepository;
    this.#ctx = ctx;
  }

  /** AC3: a client may have several layouts (e.g. one per site's sheet). */
  async create(clientId: string, body: CreateLayoutBody) {
    await this.#assertClient(clientId);
    if (body.siteId) await this.#assertSite(body.siteId, clientId);
    const row = await this.#repo.insert({
      layoutKey: randomUUID(),
      version: 1,
      clientId,
      siteId: body.siteId ?? null,
      name: body.name,
      definition: body.definition,
      headerFingerprint: body.headerFingerprint,
      confirmedBy: this.#ctx.user.id,
      createdBy: this.#ctx.user.id,
    });
    await audit(this.#ctx, 'attendance_layout.create', 'attendance_layout', null, row);
    return view(row, 1);
  }

  /** AC4: a new version; the earlier ones stay as they were. */
  async newVersion(layoutKey: string, body: NewVersionBody) {
    const [latest] = await this.#repo.versions(layoutKey);
    if (!latest) throw new NotFoundError('Layout');
    await this.#assertClient(latest.clientId);
    const siteId = body.siteId === undefined ? latest.siteId : body.siteId;
    if (siteId) await this.#assertSite(siteId, latest.clientId);
    const row = await this.#repo.insert({
      layoutKey,
      version: latest.version + 1,
      clientId: latest.clientId,
      siteId,
      name: body.name ?? latest.name,
      definition: body.definition ?? latest.definition,
      headerFingerprint: body.headerFingerprint ?? latest.headerFingerprint,
      confirmedBy: this.#ctx.user.id,
      createdBy: this.#ctx.user.id,
    });
    await audit(this.#ctx, 'attendance_layout.version', 'attendance_layout', latest, row);
    return view(row, row.version);
  }

  async listForClient(clientId: string, query: ListLayoutsQuery) {
    if (!(await this.#repo.client(clientId))) throw new NotFoundError('Client');
    const all = await this.#repo.latestOfClient(clientId, query.siteId);
    const after = query.cursor ? all.filter((l) => l.id > query.cursor!) : all;
    const page = after.slice(0, query.limit);
    return { items: page.map((l) => view(l, l.version)), nextCursor: after.length > query.limit ? page[page.length - 1]!.id : null };
  }

  async versions(layoutKey: string) {
    const all = await this.#repo.versions(layoutKey);
    if (all.length === 0) throw new NotFoundError('Layout');
    return { items: all.map((l) => view(l, all[0]!.version)) };
  }

  async version(layoutKey: string, version: number) {
    const [latest] = await this.#repo.versions(layoutKey);
    const row = latest && (await this.#repo.version(layoutKey, version));
    if (!row) throw new NotFoundError('Layout version');
    return view(row, latest.version);
  }

  async #assertClient(clientId: string) {
    const client = await this.#repo.client(clientId);
    if (!client) throw errors.unknownClient();
    if (client.status !== 'ACTIVE') throw errors.clientInactive();
  }

  async #assertSite(siteId: string, clientId: string) {
    const site = await this.#repo.site(siteId);
    if (!site) throw errors.unknownSite();
    if (site.clientId !== clientId) throw errors.siteNotOfClient();
    if (site.status !== 'ACTIVE') throw errors.siteClosed();
  }
}
