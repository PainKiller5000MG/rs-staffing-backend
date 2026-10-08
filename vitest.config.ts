import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // API and DB tests share one seeded database: run files one at a time.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
    // The suite logs in many times; the real limits are tested in test/api/otp-limits.test.ts.
    env: { OTP_MAX_PER_PHONE_HOUR: '10000', OTP_MAX_PER_IP_HOUR: '10000', MSG91_WEBHOOK_SECRET: 'test-webhook-secret-0123456789' },
  },
});
