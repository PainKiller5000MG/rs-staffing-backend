// File storage behind an interface: documents, photos, payslip PDFs, import
// files. Callers hold only a storage key (the *_key columns); the file is
// never publicly addressable. LocalStorage is for dev/test (a private
// directory); production uses an S3-compatible bucket in an Indian region
// with server-side encryption (M12-ENC-02) behind this same interface.
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

export type StoredFile = { key: string; size: number; sha256: string };

export interface FileStorage {
  /** Stores bytes under `<class>/<yyyy>/<uuid>.<ext>` and returns the key to save. */
  put(fileClass: string, data: Uint8Array, ext: string): Promise<StoredFile>;
  get(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
}

const SAFE = /^[a-z0-9_-]+$/;

export class LocalStorage implements FileStorage {
  readonly #root: string;

  constructor({ config }: { config: { STORAGE_DIR: string } }) {
    this.#root = resolve(config.STORAGE_DIR);
  }

  async put(fileClass: string, data: Uint8Array, ext: string): Promise<StoredFile> {
    if (!SAFE.test(fileClass) || !SAFE.test(ext)) throw new RangeError('storage: class and extension must be [a-z0-9_-]');
    const key = `${fileClass}/${new Date().getUTCFullYear()}/${randomUUID()}.${ext}`;
    const path = this.#path(key);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, data, { mode: 0o600 });
    return { key, size: data.byteLength, sha256: createHash('sha256').update(data).digest('hex') };
  }

  async get(key: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(this.#path(key)));
  }

  async delete(key: string): Promise<void> {
    await rm(this.#path(key), { force: true });
  }

  /** Keys come from the database, but never resolve outside the storage root. */
  #path(key: string): string {
    const path = resolve(join(this.#root, key));
    if (!path.startsWith(this.#root + sep)) throw new RangeError('storage: key escapes the storage root');
    return path;
  }
}
