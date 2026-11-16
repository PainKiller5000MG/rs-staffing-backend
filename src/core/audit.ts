// audit(ctx, action, entity, before, after): one append-only row in
// audit.audit_log, written through the request's executor so it commits or
// rolls back with the change (M1-AUD-01). Updates store changed fields only;
// sensitive values are masked; bigint paise become strings.
import type { Models } from '../prisma/contract.d.ts';
import type { Ctx } from './context.ts';

type Row = Models.audit_AuditLog;
type Plain = Record<string, unknown>;

const MASK: Record<string, (v: string) => string> = {
  aadhaar: (v) => `XXXX XXXX ${v.slice(-4)}`,
  aadhaarNumber: (v) => `XXXX XXXX ${v.slice(-4)}`,
  accountNumber: (v) => `XXXXXX${v.slice(-4)}`,
  dob: (v) => `${v.slice(0, 4)}-XX-XX`,
  pan: (v) => `${v.slice(0, 2)}XXXXX${v.slice(-2)}`,
};
const DROP = new Set(['password', 'otp', 'code', 'token', 'accountEnc', 'aadhaarEnc', 'lookupHmac']);

function toJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)));
}

function clean(obj: Plain): Plain {
  const out: Plain = {};
  for (const [k, v] of Object.entries(obj)) {
    if (DROP.has(k)) continue;
    const mask = MASK[k];
    out[k] = mask && typeof v === 'string' ? mask(v) : v;
  }
  return out;
}

/** For an update, keep only the fields whose value changed. */
function changedOnly(before: Plain, after: Plain): [Plain, Plain] {
  const b: Plain = {};
  const a: Plain = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      b[key] = before[key];
      a[key] = after[key];
    }
  }
  return [b, a];
}

const isPlain = (v: unknown): v is Plain => typeof v === 'object' && v !== null && !Array.isArray(v);

export async function audit(
  ctx: Ctx,
  action: string,
  entity: string,
  before: unknown,
  after: unknown,
  opts: { entityId?: string; reason?: string; actorId?: string | null } = {},
): Promise<void> {
  let b = isPlain(before) ? clean(toJson(before) as Plain) : null;
  let a = isPlain(after) ? clean(toJson(after) as Plain) : null;
  // Before the diff: an id never changes, so changedOnly() drops it.
  const entityId = opts.entityId ?? (a?.['id'] as string | undefined) ?? (b?.['id'] as string | undefined) ?? null;
  if (b && a) [b, a] = changedOnly(b, a);

  await ctx.executor.orm.audit.AuditLog.create({
    actorId: (opts.actorId !== undefined ? opts.actorId : ctx.maybeUser?.id ?? null) as Row['actorId'],
    action: action as Row['action'],
    entity: entity as Row['entity'],
    entityId: entityId as Row['entityId'],
    before: b as Row['before'],
    after: a as Row['after'],
    reason: opts.reason ?? null,
    ip: ctx.ip as Row['ip'],
  });
  ctx.audited = true;
}

/** An audit row written by the system itself (login bookkeeping, lockouts), outside a request. */
export async function auditSystem(
  executor: Pick<Ctx['executor'], 'orm'>,
  entry: { action: string; entity: string; entityId: string | null; before?: unknown; after?: unknown; reason?: string; ip?: string | null; actorId?: string | null },
): Promise<void> {
  await executor.orm.audit.AuditLog.create({
    actorId: (entry.actorId ?? null) as Row['actorId'],
    action: entry.action as Row['action'],
    entity: entry.entity as Row['entity'],
    entityId: entry.entityId as Row['entityId'],
    before: (isPlain(entry.before) ? clean(toJson(entry.before) as Plain) : null) as Row['before'],
    after: (isPlain(entry.after) ? clean(toJson(entry.after) as Plain) : null) as Row['after'],
    reason: entry.reason ?? null,
    ip: (entry.ip ?? null) as Row['ip'],
  });
}
