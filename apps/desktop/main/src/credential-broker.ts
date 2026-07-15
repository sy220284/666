import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface SafeStorageAdapter {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
  getSelectedStorageBackend?(): string;
}

interface CredentialRecord {
  readonly providerId: string;
  readonly ciphertext: string;
  readonly createdAt: string;
}

interface CredentialFile {
  readonly version: 1;
  readonly records: Readonly<Record<string, CredentialRecord>>;
}

function emptyCredentialFile(): CredentialFile {
  return { version: 1, records: {} };
}

function isCredentialFile(value: unknown): value is CredentialFile {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { readonly version?: unknown; readonly records?: unknown };
  return (
    candidate.version === 1 && Boolean(candidate.records) && typeof candidate.records === 'object'
  );
}

export class CredentialBroker {
  readonly #safeStorage: SafeStorageAdapter;
  readonly #filePath: string;

  constructor(safeStorage: SafeStorageAdapter, filePath: string) {
    this.#safeStorage = safeStorage;
    this.#filePath = filePath;
  }

  #assertSecureBackend(): void {
    if (!this.#safeStorage.isEncryptionAvailable()) {
      throw new Error('CREDENTIAL_STORE_UNAVAILABLE');
    }
    if (this.#safeStorage.getSelectedStorageBackend?.() === 'basic_text') {
      throw new Error('CREDENTIAL_STORE_INSECURE_BACKEND');
    }
  }

  async #read(): Promise<CredentialFile> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.#filePath, 'utf8'));
      if (!isCredentialFile(parsed)) throw new Error('CREDENTIAL_STORE_CORRUPT');
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyCredentialFile();
      throw error;
    }
  }

  async #write(file: CredentialFile): Promise<void> {
    const directory = path.dirname(this.#filePath);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.#filePath}.tmp-${process.pid}-${randomUUID()}`;
    await writeFile(temporaryPath, `${JSON.stringify(file)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
    await rename(temporaryPath, this.#filePath);
  }

  async store(providerId: string, credential: string): Promise<string> {
    this.#assertSecureBackend();
    if (!credential) throw new Error('CREDENTIAL_EMPTY');
    const file = await this.#read();
    const credentialRef = `cred_${randomUUID()}`;
    const encrypted = this.#safeStorage.encryptString(credential);
    await this.#write({
      version: 1,
      records: {
        ...file.records,
        [credentialRef]: {
          providerId,
          ciphertext: encrypted.toString('base64'),
          createdAt: new Date().toISOString(),
        },
      },
    });
    return credentialRef;
  }

  async has(credentialRef: string): Promise<boolean> {
    return Boolean((await this.#read()).records[credentialRef]);
  }

  async remove(credentialRef: string): Promise<boolean> {
    const file = await this.#read();
    if (!file.records[credentialRef]) return false;
    const records = { ...file.records };
    delete records[credentialRef];
    await this.#write({ version: 1, records });
    return true;
  }

  async resolve(credentialRef: string): Promise<string | null> {
    this.#assertSecureBackend();
    const record = (await this.#read()).records[credentialRef];
    if (!record) return null;
    return this.#safeStorage.decryptString(Buffer.from(record.ciphertext, 'base64'));
  }
}
