// Ctx: what a request handler and its service see of the request — who is
// calling, the validated input, and the executor (the request's transaction
// on write routes, the plain client on reads).
import type { Context } from 'hono';
import type { Role } from '../lib/roles.ts';
import type { db } from '../prisma/db.ts';

export type Db = typeof db;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** Repositories run queries through this: the request's tx, or db outside one. */
export type Executor = Db | Tx;

export type SessionUser = {
  id: string;
  authUserId: string;
  name: string;
  role: Role;
  employeeId: string | null;
  /** Sites with an approved, current scope (supervisors only; empty for others). */
  siteIds: string[];
};

export class Ctx {
  readonly requestId: string;
  readonly ip: string | null;
  readonly userAgent: string | null;
  #user: SessionUser | null;
  #c: Context;
  #executor: Executor;
  /** Set by audit(); the route registry refuses a write that never audited. */
  audited = false;

  constructor(c: Context, user: SessionUser | null, executor: Executor) {
    this.#c = c;
    this.#user = user;
    this.#executor = executor;
    this.requestId = c.get('requestId');
    this.ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
    this.userAgent = c.req.header('user-agent') ?? null;
  }

  /** The signed-in user. Throws if the route was public (a wiring bug, not a 401). */
  get user(): SessionUser {
    if (!this.#user) throw new Error('Ctx.user read on a public route');
    return this.#user;
  }

  get maybeUser(): SessionUser | null {
    return this.#user;
  }

  get executor(): Executor {
    return this.#executor;
  }

  /** Validated JSON body (validated by the route's `body` schema before the handler runs). */
  body<T>(): T {
    return (this.#c.req.valid as (t: 'json') => T)('json');
  }

  query<T>(): T {
    return (this.#c.req.valid as (t: 'query') => T)('query');
  }

  param(name: string): string {
    const params = (this.#c.req.valid as (t: 'param') => Record<string, string>)('param');
    const value = params[name];
    if (value === undefined) throw new Error(`Route has no param "${name}"`);
    return value;
  }

  /** Runs fn in the request's transaction (already open on write routes). */
  async tx<T>(fn: (tx: Executor) => Promise<T>): Promise<T> {
    return fn(this.#executor);
  }
}
