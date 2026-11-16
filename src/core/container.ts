// The awilix root container (PROXY mode: constructors receive one deps
// object). Singletons live here; each request gets a scope that adds `ctx`,
// `executor` (its transaction, or db) and `events`, and resolves the module's
// services and repositories against them.
import { asClass, asFunction, asValue, createContainer, InjectionMode, type AwilixContainer } from 'awilix';
import type pg from 'pg';
import { createAuth, createAuthPool, type Auth } from '../auth/auth.ts';
import { OtpGate } from '../auth/otp-gate.ts';
import { OtpLockout } from '../auth/lockout.ts';
import { MockSms, Msg91Sms, type SmsProvider } from '../lib/sms.ts';
import { db } from '../prisma/db.ts';
import type { Models } from '../prisma/contract.d.ts';
import { config, type Config } from './config.ts';
import type { Db } from './context.ts';
import { EventBuffer, EventBus } from './events.ts';
import { LocalStorage, type FileStorage } from '../lib/storage.ts';
import { createLogger, type Logger } from './logger.ts';

export type RootCradle = {
  config: Config;
  logger: Logger;
  db: Db;
  executor: Db;
  sms: SmsProvider;
  storage: FileStorage;
  authPool: pg.Pool;
  auth: Auth;
  otpGate: OtpGate;
  otpLockout: OtpLockout;
  bus: EventBus;
  events: EventBuffer;
};

async function onLogin(authUserId: string, ip: string | null): Promise<void> {
  type U = Models.app_User;
  const user = await db.orm.app.User.select('id', 'mobile')
    .where({ authUserId: authUserId as U['authUserId'] })
    .first();
  if (!user) return;
  await db.transaction(async (tx) => {
    await tx.orm.app.User.where({ id: user.id }).update({ lastLoginAt: Temporal.Now.instant() as U['lastLoginAt'] });
    await tx.orm.app.LoginEvent.create({
      userId: user.id,
      mobile: user.mobile,
      result: 'OK' as Models.app_LoginEvent['result'],
      ip: ip as Models.app_LoginEvent['ip'],
    });
    await tx.orm.audit.AuditLog.create({
      actorId: user.id,
      action: 'auth.login' as Models.audit_AuditLog['action'],
      entity: 'user' as Models.audit_AuditLog['entity'],
      entityId: user.id,
      before: null,
      after: null,
      reason: null,
      ip: ip as Models.audit_AuditLog['ip'],
    });
  });
}

export function createRootContainer(overrides: Partial<Record<keyof RootCradle, unknown>> = {}): AwilixContainer<RootCradle> {
  const container = createContainer<RootCradle>({ injectionMode: InjectionMode.PROXY, strict: true });
  const cfg = config();

  container.register({
    config: asValue(cfg),
    logger: asValue(createLogger()),
    db: asValue(db),
    executor: asValue(db),
    storage: asClass(LocalStorage).singleton(),
    sms: (cfg.SMS_PROVIDER === 'msg91' ? asClass(Msg91Sms) : asClass(MockSms)).singleton(),
    authPool: asFunction(() => createAuthPool(cfg.DATABASE_URL))
      .singleton()
      .disposer((pool) => pool.end()),
    otpGate: asClass(OtpGate).singleton(),
    otpLockout: asClass(OtpLockout).singleton(),
    auth: asFunction(({ config, logger, sms, authPool, otpGate }: RootCradle) =>
      createAuth({ config, logger, sms, pool: authPool, otpGate, onLogin }),
    ).singleton(),
    bus: asClass(EventBus).singleton(),
    events: asClass(EventBuffer).scoped(),
  });

  for (const [name, value] of Object.entries(overrides)) container.register(name, asValue(value));
  return container;
}
