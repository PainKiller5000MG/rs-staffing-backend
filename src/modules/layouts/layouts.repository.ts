// Queries only. Layout rows are immutable (a trigger refuses UPDATE/DELETE): a new version is a new row.
import type { Scalars } from '@prisma/orm-postgres/family-contract/types';
import type { Executor } from '../../core/context.ts';
import type { Models } from '../../prisma/contract.d.ts';
import type { LayoutDefinition } from './layouts.schemas.ts';

type Row = Scalars<Models.app_AttendanceLayout>;

export type Layout = {
  id: string;
  layoutKey: string;
  version: number;
  clientId: string;
  siteId: string | null;
  name: string;
  definition: LayoutDefinition;
  headerFingerprint: string;
  confirmedBy: string | null;
  confirmedAt: string | null;
  createdAt: string;
};

const toLayout = (r: Row): Layout => ({
  id: r.id,
  layoutKey: r.layoutKey,
  version: r.version,
  clientId: r.clientId,
  siteId: r.siteId,
  name: r.name,
  definition: r.definition as LayoutDefinition,
  headerFingerprint: r.headerFingerprint,
  confirmedBy: r.confirmedBy,
  confirmedAt: r.confirmedAt ? r.confirmedAt.toString() : null,
  createdAt: r.createdAt.toString(),
});

export type NewLayout = Omit<Layout, 'id' | 'createdAt' | 'confirmedAt'> & { createdBy: string };

export class LayoutsRepository {
  readonly #executor: Executor;

  constructor({ executor }: { executor: Executor }) {
    this.#executor = executor;
  }

  get #layouts() {
    return this.#executor.orm.app.AttendanceLayout;
  }

  async insert(d: NewLayout): Promise<Layout> {
    const row = await this.#layouts.create({
      layoutKey: d.layoutKey as Row['layoutKey'],
      version: d.version,
      clientId: d.clientId as Row['clientId'],
      siteId: d.siteId as Row['siteId'],
      name: d.name as Row['name'],
      definition: d.definition as Row['definition'],
      headerFingerprint: d.headerFingerprint as Row['headerFingerprint'],
      confirmedBy: d.confirmedBy as Row['confirmedBy'],
      confirmedAt: d.confirmedBy ? (Temporal.Now.instant() as Row['confirmedAt']) : null,
      createdBy: d.createdBy as Row['createdBy'],
    });
    return toLayout(row);
  }

  /** Every version of one layout, newest first. */
  async versions(layoutKey: string): Promise<Layout[]> {
    const rows = await this.#layouts.where({ layoutKey: layoutKey as Row['layoutKey'] }).orderBy((l) => l.version.desc()).all();
    return rows.map(toLayout);
  }

  async version(layoutKey: string, version: number): Promise<Layout | null> {
    const row = await this.#layouts.where({ layoutKey: layoutKey as Row['layoutKey'], version }).first();
    return row && toLayout(row);
  }

  /** The newest version of each of a client's layouts. */
  async latestOfClient(clientId: string, siteId?: string): Promise<Layout[]> {
    const rows = await this.#layouts.where({ clientId: clientId as Row['clientId'] }).orderBy((l) => l.id.asc()).all();
    const latest = new Map<string, Row>();
    for (const r of rows) {
      const seen = latest.get(r.layoutKey);
      if (!seen || r.version > seen.version) latest.set(r.layoutKey, r);
    }
    return [...latest.values()].map(toLayout).filter((l) => !siteId || l.siteId === siteId).sort((a, b) => a.id.localeCompare(b.id));
  }

  async client(id: string): Promise<{ status: string } | null> {
    const c = await this.#executor.orm.app.Client.first({ id: id as Scalars<Models.app_Client>['id'] });
    return c && { status: c.status };
  }

  async site(id: string): Promise<{ status: string; clientId: string } | null> {
    const s = await this.#executor.orm.app.Site.first({ id: id as Scalars<Models.app_Site>['id'] });
    return s && { status: s.status, clientId: s.clientId };
  }
}
