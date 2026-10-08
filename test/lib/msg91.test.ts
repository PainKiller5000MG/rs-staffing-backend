// Msg91Sms against a mocked HTTP client: the request it builds and how it reads replies.
import { describe, expect, test, vi } from 'vitest';
import { Msg91Sms, SmsProviderError } from '../../src/lib/sms.ts';
import { loadConfig } from '../../src/core/config.ts';

const config = {
  MSG91_AUTH_KEY: 'test-auth-key-123',
  MSG91_SENDER_ID: 'RSSTAF',
  MSG91_TPL_OTP: 'tpl-otp',
  MSG91_TPL_PAYSLIP: 'tpl-payslip',
  MSG91_TPL_PAYSLIP_REVISED: 'tpl-payslip-rev',
  MSG91_TPL_FNF: 'tpl-fnf',
};
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function provider(response: Response) {
  const httpClient = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => response);
  const logger = { warn: vi.fn(), debug: vi.fn(), info: vi.fn(), error: vi.fn() };
  return { sms: new Msg91Sms({ config, logger: logger as never, httpClient: httpClient as never }), httpClient, logger };
}

describe('Msg91Sms', () => {
  test('sends the OTP as a template variable to the flow API', async () => {
    const { sms, httpClient } = provider(reply(200, { type: 'success', message: '3567696d6b36373' }));
    await sms.sendOtp('+919000000001', '061682');
    const [url, init] = httpClient.mock.calls[0]!;
    expect(url).toBe('https://control.msg91.com/api/v5/flow');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ authkey: 'test-auth-key-123', 'content-type': 'application/json' });
    expect(JSON.parse(init!.body as string)).toEqual({
      template_id: 'tpl-otp',
      sender: 'RSSTAF',
      short_url: '0',
      recipients: [{ mobiles: '919000000001', otp: '061682' }],
    });
  });

  test('returns the request id; a message_templates override wins over the env default', async () => {
    const { sms, httpClient } = provider(reply(200, { type: 'success', message: 'req-42' }));
    const r = await sms.sendTemplate('PAYSLIP', '+919000000006', { name: 'Ramesh', month: 'Sep 2026', link: 'https://x/p/abc' }, 'tpl-hindi');
    expect(r).toEqual({ providerMsgId: 'req-42' });
    expect(JSON.parse(httpClient.mock.calls[0]![1]!.body as string).template_id).toBe('tpl-hindi');
  });

  test('an error reply throws, and the OTP is not in the log', async () => {
    const { sms, logger } = provider(reply(200, { type: 'error', message: 'Template Id not found on DLT' }));
    await expect(sms.sendOtp('+919000000001', '913579')).rejects.toThrow(SmsProviderError);
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('913579');
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('9000000001');
  });

  test('an HTTP failure throws', async () => {
    const { sms } = provider(reply(401, { type: 'error', message: 'Authentication failure' }));
    await expect(sms.sendTemplate('FNF', '+919000000006', { name: 'R', link: 'l' })).rejects.toThrow('401');
  });
});

test('config: SMS_PROVIDER=msg91 refuses to boot without the MSG91 settings', () => {
  expect(() => loadConfig({ DATABASE_URL: 'postgresql://x@localhost/db', SMS_PROVIDER: 'msg91' })).toThrow(/MSG91_AUTH_KEY: required when SMS_PROVIDER=msg91/);
});
