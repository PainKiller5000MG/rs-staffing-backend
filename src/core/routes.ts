// The route registry. Controllers declare routes with defineRoutes(); every
// route is wrapped in the same pipeline:
//
//   requestId → session → role → site scope → zod validation
//     → ctx.tx (write routes: one transaction) → handler → audit (same tx) → response
//
// and appears in openapi.json from the same schemas that validate it.
// Startup fails if a route has no `roles` (M1-SCP-01) or a write route has no
// `audit` tag; at runtime a write that never called audit() is rolled back.
import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import { asValue, type AwilixContainer } from 'awilix';
import type { MiddlewareHandler } from 'hono';
import type { Auth } from '../auth/auth.ts';
import type { Role } from '../lib/roles.ts';
import { Ctx, type Db, type Executor, type SessionUser } from './context.ts';
import { EventBuffer, type EventBus } from './events.ts';
import { requireRole, requireSession, requireSiteScope } from './guards.ts';
import { AppError, RuleError } from './errors.ts';
import { createHash } from 'node:crypto';

declare module 'hono' {
  interface ContextVariableMap {
    user: SessionUser | null;
    clientIp: string | null;
  }
}

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
type ZodObj = z.ZodObject<z.ZodRawShape>;

export type RouteDef<C> = {
  method: Method;
  /** OpenAPI path syntax: /users/{id} */
  path: string;
  summary: string;
  /** Who may call it. 'public' skips the session; 'authenticated' is any signed-in role. */
  roles: readonly Role[] | 'authenticated' | 'public';
  /** Site ids the request touches (read from raw params/query, before validation). */
  scope?: (req: { params: Record<string, string>; query: Record<string, string> }) => string[];
  params?: ZodObj;
  query?: ZodObj;
  body?: z.ZodType;
  response: z.ZodType;
  status?: 200 | 201;
  /** Audit action tag, e.g. 'user.create'. Required on every write route. */
  audit?: string;
  /** Documents that the action is one half of a maker-checker pair; the service enforces it. */
  makerChecker?: boolean;
  /**
   * POSTs that create money records: the client sends an Idempotency-Key header;
   * a retry with the same key and body replays the first response and writes nothing.
   */
  idempotent?: boolean;
  handler: (controller: C, ctx: Ctx) => Promise<unknown>;
};

export function defineRoutes<C>(routes: RouteDef<C>[]): RouteDef<C>[] {
  return routes;
}

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown(),
      requestId: z.string(),
    }),
  })
  .openapi('Error');

const errorResponse = (description: string) => ({ description, content: { 'application/json': { schema: ErrorSchema } } });

/** bigint → string, Temporal → ISO string (its toJSON), for c.json(). */
function toJson(value: unknown): unknown {
  return value === undefined ? null : JSON.parse(JSON.stringify(value, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)));
}

/** The Idempotency-Key and a hash of what it was sent with (method, path, body). */
function idempotencyRequest(c: Parameters<MiddlewareHandler>[0], user: SessionUser | null) {
  const key = c.req.header('idempotency-key');
  if (!key || key.length < 8 || key.length > 100) {
    throw new AppError(422, 'IDEMPOTENCY_KEY_REQUIRED', 'Send an Idempotency-Key header (8–100 characters) with this request');
  }
  if (!user) throw new Error('idempotent routes need a signed-in user');
  const body = (c.req.valid as (t: 'json') => unknown)('json') ?? null;
  const requestHash = createHash('sha256').update(JSON.stringify([c.req.method, c.req.path, toJson(body)])).digest('hex');
  return { key, userId: user.id, requestHash };
}

export type RegistryDeps = {
  app: OpenAPIHono;
  container: AwilixContainer;
  auth: Auth;
  db: Db;
  bus: EventBus;
};

export function registerRoutes(deps: RegistryDeps, controllerName: string, routes: readonly RouteDef<never>[]): void {
  const { app, container, auth, db, bus } = deps;

  for (const route of routes as readonly RouteDef<object>[]) {
    const label = `${route.method.toUpperCase()} ${route.path}`;
    if (!route.roles) throw new Error(`${label}: every route must declare roles`);
    const isWrite = route.method !== 'get';
    if (isWrite && !route.audit) throw new Error(`${label}: write routes must declare an audit tag`);
    // Every route is fully described in openapi.json: a zod response schema, and a
    // params schema naming each {param} in the path.
    if (!(route.response instanceof z.ZodType)) throw new Error(`${label}: every route must declare a response schema`);
    for (const [, name] of route.path.matchAll(/\{(\w+)\}/g)) {
      if (!route.params?.shape[name!]) throw new Error(`${label}: path param {${name}} has no params schema`);
    }
    if (route.idempotent && route.method !== 'post') throw new Error(`${label}: only POST routes can be idempotent`);

    const guard: MiddlewareHandler = async (c, next) => {
      if (route.roles === 'public') {
        c.set('user', null);
        return next();
      }
      const user = await requireSession(auth, db, c.req.raw.headers);
      if (route.roles !== 'authenticated') requireRole(user, route.roles);
      if (route.scope) requireSiteScope(user, route.scope({ params: c.req.param(), query: c.req.query() }));
      c.set('user', user);
      return next();
    };

    const status = route.status ?? 200;
    const openapiRoute = createRoute({
      method: route.method,
      path: route.path,
      summary: route.summary,
      tags: [controllerName.replace(/Controller$/, '')],
      middleware: [guard] as const,
      ...(route.roles === 'public' ? {} : { security: [{ session: [] }] }),
      request: {
        ...(route.idempotent
          ? {
              // Documented here; enforced by idempotencyRequest() so a missing key gets
              // its own error code (IDEMPOTENCY_KEY_REQUIRED) rather than VALIDATION_FAILED.
              headers: z.object({
                'idempotency-key': z.string().optional().openapi({ description: 'Required. 8–100 characters, unique per logical operation; a retry reuses it' }),
              }),
            }
          : {}),
        ...(route.params ? { params: route.params } : {}),
        ...(route.query ? { query: route.query } : {}),
        ...(route.body ? { body: { content: { 'application/json': { schema: route.body } }, required: true } } : {}),
      },
      responses: {
        [status]: { description: route.summary, content: { 'application/json': { schema: route.response } } },
        401: errorResponse('Not signed in'),
        403: errorResponse('Not allowed'),
        404: errorResponse('Not found'),
        409: errorResponse('Conflict (duplicate, overlap, in use)'),
        422: errorResponse('Validation failed or a business rule refused the request'),
      },
    });

    app.openapi(openapiRoute, (async (c: Parameters<MiddlewareHandler>[0]) => {
      const user = c.get('user');
      const scope = container.createScope();
      const events = new EventBuffer();

      const idem = route.idempotent ? idempotencyRequest(c, user) : null;

      const run = async (executor: Executor): Promise<{ status: number; body: unknown; replayed: boolean }> => {
        if (idem) {
          const prior = await executor.orm.app.IdempotencyKey.where({ userId: idem.userId as never, key: idem.key as never }).first();
          if (prior) {
            if (prior.requestHash !== idem.requestHash) {
              throw new RuleError('IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used for a different request');
            }
            return { status: prior.status, body: prior.response, replayed: true };
          }
        }
        const ctx = new Ctx(c, user, executor);
        scope.register({ ctx: asValue(ctx), executor: asValue(executor), events: asValue(events) });
        const controller = scope.resolve<object>(controllerName);
        const body = toJson(await route.handler(controller, ctx));
        if (isWrite && !ctx.audited) throw new Error(`${label} finished without writing an audit row`);
        if (idem) {
          await executor.orm.app.IdempotencyKey.create({
            userId: idem.userId,
            key: idem.key,
            method: c.req.method,
            path: c.req.path,
            requestHash: idem.requestHash,
            status,
            response: body,
          } as never);
        }
        return { status, body, replayed: false };
      };

      try {
        const result = isWrite ? await db.transaction((tx) => run(tx)) : await run(db);
        if (!result.replayed) await bus.deliver(events.events);
        if (result.replayed) c.header('idempotent-replayed', 'true');
        return c.json(result.body as never, result.status as 200);
      } finally {
        await scope.dispose();
      }
    }) as never);
  }
}
