// createApp({ modules }) → the Hono app: request id, security headers, CORS,
// request logging, Better Auth at /api/auth/*, /health, /ready, every
// module's routes, /openapi.json, and the single error handler.
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { asClass, type AwilixContainer } from 'awilix';
import { cors } from 'hono/cors';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import pkg from '../../package.json' with { type: 'json' };
import { clientIp, withClientIp } from './client-ip.ts';
import type { RootCradle } from './container.ts';
import { createErrorHandler, notFoundHandler, validationHook } from './error-handler.ts';
import type { Module } from './module.ts';
import { registerRoutes } from './routes.ts';

export const openApiInfo = {
  openapi: '3.1.0',
  info: { title: 'RS Staffing API', version: pkg.version },
} as const;

export function createApp({ modules, container }: { modules: readonly Module[]; container: AwilixContainer<RootCradle> }) {
  const { config, logger, auth, db, bus } = container.cradle;
  const app = new OpenAPIHono({ defaultHook: validationHook });

  app.use(requestId({ headerName: 'x-request-id' }));
  app.use(async (c, next) => {
    c.set('clientIp', clientIp(c, config.TRUST_PROXY));
    await next();
  });
  app.use(secureHeaders());
  app.use(
    cors({
      origin: config.WEB_ORIGIN,
      credentials: true,
      allowHeaders: ['content-type', 'x-request-id'],
      exposeHeaders: ['x-request-id'],
    }),
  );
  app.use(async (c, next) => {
    const started = performance.now();
    await next();
    logger.info(
      { requestId: c.get('requestId'), method: c.req.method, path: c.req.path, status: c.res.status, ms: Math.round(performance.now() - started) },
      'request',
    );
  });

  // Better Auth owns identity: OTP send/verify, sessions, sign-out.
  // Its rate limiter keys on our client-IP header, not on anything the caller sent.
  app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(withClientIp(c.req.raw, c.get('clientIp'))));

  app.openapi(
    createRoute({
      method: 'get',
      path: '/health',
      summary: 'The process is up',
      tags: ['system'],
      responses: { 200: { description: 'OK', content: { 'application/json': { schema: z.object({ ok: z.literal(true) }) } } } },
    }),
    (c) => c.json({ ok: true as const }, 200),
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/ready',
      summary: 'The database is reachable',
      tags: ['system'],
      responses: {
        200: { description: 'Ready', content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } } },
        503: { description: 'Not ready', content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } } },
      },
    }),
    async (c) => {
      try {
        await db.orm.app.Company.select('id').first();
        return c.json({ ok: true }, 200);
      } catch (err) {
        logger.error({ err }, 'readiness check failed');
        return c.json({ ok: false }, 503);
      }
    },
  );

  for (const module of modules) {
    for (const [name, resolver] of Object.entries(module.providers)) container.register(name, resolver);
    for (const Controller of module.controllers) {
      container.register(Controller.name, asClass(Controller as never).scoped());
      registerRoutes({ app, container, auth, db, bus }, Controller.name, Controller.routes);
    }
  }

  app.openAPIRegistry.registerComponent('securitySchemes', 'session', {
    type: 'apiKey',
    in: 'cookie',
    name: 'better-auth.session_token',
    description: 'Session cookie set by POST /api/auth/phone-number/verify',
  });
  app.doc31('/openapi.json', openApiInfo);

  app.onError(createErrorHandler(logger));
  app.notFound(notFoundHandler);
  return app;
}
