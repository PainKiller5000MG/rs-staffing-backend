// Entry for Better Auth's CLI (`npm run auth:migrate`), which only needs the
// schema the config implies. The real instance is built in core/container.ts.
import { config } from '../core/config.ts';
import { createAuth } from './auth.ts';

export const auth = createAuth({
  config: config(),
  logger: console as never,
  sms: { sendOtp: async () => {}, sendTemplate: async () => ({ providerMsgId: null }) },
  otpGate: { decide: async () => 'UNKNOWN' as const },
});
