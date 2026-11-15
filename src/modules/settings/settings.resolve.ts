// Resolution of inherited settings (M2-SET-10 AC2, M2-SET-09): the site's own value, else the
// client's, else the company's, else the built-in default. Pure; the payroll run stores the result
// (value + source) in its snapshot. Only approved rows count: a pending row grants nothing.
import { KEYS, RESOLVED_KEYS, type Scope, type SettingKey } from './settings.keys.ts';

export type SettingRow = {
  scope: Scope;
  scopeId: string | null;
  key: string;
  value: string;
  effectiveFrom: string; // ISO date
  effectiveTo: string | null;
  approved: boolean;
};

export type Resolved = {
  key: SettingKey;
  value: string | null;
  source: Scope | 'DEFAULT' | 'NONE';
  effectiveFrom: string | null;
};

const PRECEDENCE: Scope[] = ['SITE', 'CLIENT', 'COMPANY'];

export const isLive = (r: Pick<SettingRow, 'effectiveFrom' | 'effectiveTo' | 'approved'>, asOf: string) =>
  r.approved && r.effectiveFrom <= asOf && (r.effectiveTo === null || r.effectiveTo >= asOf);

export function resolveSettings(rows: SettingRow[], asOf: string, reach: { clientId?: string; siteId?: string }, keys: readonly SettingKey[] = RESOLVED_KEYS): Resolved[] {
  return keys.map((key) => {
    for (const scope of PRECEDENCE) {
      if (!(KEYS[key].scopes as readonly Scope[]).includes(scope)) continue;
      const scopeId = scope === 'SITE' ? reach.siteId : scope === 'CLIENT' ? reach.clientId : null;
      if (scope !== 'COMPANY' && !scopeId) continue;
      const hit = rows.find((r) => r.key === key && r.scope === scope && (r.scopeId ?? null) === (scopeId ?? null) && isLive(r, asOf));
      if (hit) return { key, value: hit.value, source: scope, effectiveFrom: hit.effectiveFrom };
    }
    const fallback = KEYS[key].fallback;
    return { key, value: fallback, source: fallback === null ? 'NONE' : 'DEFAULT', effectiveFrom: null };
  });
}
