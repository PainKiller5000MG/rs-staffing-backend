import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, expect, test } from 'vitest';
import { LocalStorage } from '../../src/lib/storage.ts';

const dir = await mkdtemp(join(tmpdir(), 'rs-storage-'));
const storage = new LocalStorage({ config: { STORAGE_DIR: dir } });
afterAll(() => rm(dir, { recursive: true, force: true }));

test('put → get → delete round trip with a hash', async () => {
  const data = new TextEncoder().encode('payslip bytes');
  const file = await storage.put('payslips', data, 'pdf');
  expect(file.key).toMatch(/^payslips\/\d{4}\/[0-9a-f-]{36}\.pdf$/);
  expect(file.sha256).toHaveLength(64);
  expect(new TextDecoder().decode(await storage.get(file.key))).toBe('payslip bytes');
  await storage.delete(file.key);
  await expect(storage.get(file.key)).rejects.toThrow();
});

test('keys and classes can not escape the storage root', async () => {
  await expect(storage.get('../../etc/passwd')).rejects.toThrow('escapes');
  await expect(storage.put('../x', new Uint8Array(1), 'pdf')).rejects.toThrow(RangeError);
  await expect(storage.put('docs', new Uint8Array(1), 'p/df')).rejects.toThrow(RangeError);
});
