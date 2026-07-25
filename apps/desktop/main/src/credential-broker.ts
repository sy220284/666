import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { CredentialRefSchema, ProviderIdSchema } from '@worldforge/contracts';

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

function isCredentialRecord(value: unknown): value is CredentialRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<CredentialRecord>;
  return (
    ProviderIdSchema.safeParse(candidate.providerId).success &&
    typeof candidate.ciphertext === 'string' &&
    candidate.ciphertext.length > 0 &&
    typeof candidate.createdAt === 'string' &&
    !Number.isNaN(Date.parse(candidate.createdAt))
  );
}

function isCredentialFile(value: unknown): value is CredentialFile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as { readonly version?: unknown; readonly records?: unknown };
  if (
    candidate.version !== 1 ||
    !candidate.records ||
    typeof candidate.records !== 'object' ||
    Array.isArray(candidate.records)
  ) {
    return false;
  }
  return Object.entries(candidate.records).every(
    ([credentialRef, record]) =>
      CredentialRefSchema.safeParse(credentialRef).success && isCredentialRecord(record),
  );
}

function assertProviderOwner(record: CredentialRecord, providerId: string): void {
  if (record.providerId !== providerId) throw new Error('CREDENTIAL_PROVIDER_MISMATCH');
}

export class CredentialBroker {
  readonly #safeStorage: SafeStorageAdapter;
  readonly #filePath: string;
  #mutationTail: Promise<void> = Promise.resolve();

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
    try {
      await writeFile(temporaryPath, `${JSON.stringify(file)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
        flag: 'wx',
      });
      await rename(temporaryPath, this.#filePath);
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }

  #enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#mutationTail.then(operation);
    this.#mutationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async #waitForMutations(): Promise<void> {
    await this.#mutationTail;
  }

  async store(providerId: string, credential: string): Promise<string> {
    this.#assertSecureBackend();
    const validProviderId = ProviderIdSchema.parse(providerId);
    if (!credential) throw new Error('CREDENTIAL_EMPTY');
    return this.#enqueueMutation(async () => {
      const file = await this.#read();
      const credentialRef = CredentialRefSchema.parse(`cred_${randomUUID()}`);
      const encrypted = this.#safeStorage.encryptString(credential);
      await this.#write({
        version: 1,
        records: {
          ...file.records,
          [credentialRef]: {
            providerId: validProviderId,
            ciphertext: encrypted.toString('base64'),
            createdAt: new Date().toISOString(),
          },
        },
      });
      return credentialRef;
    });
  }

  replaceForProvider(providerId: string, credentialRef: string, credential: string): Promise<void> {
    this.#assertSecureBackend();
    const validProviderId = ProviderIdSchema.parse(providerId);
    const validCredentialRef = CredentialRefSchema.parse(credentialRef);
    if (!credential) throw new Error('CREDENTIAL_EMPTY');
    return this.#enqueueMutation(async () => {
      const file = await this.#read();
      const record = file.records[validCredentialRef];
      if (!record) throw new Error('CREDENTIAL_NOT_FOUND');
      assertProviderOwner(record, validProviderId);
      const encrypted = this.#safeStorage.encryptString(credential);
      await this.#write({
        version: 1,
        records: {
          ...file.records,
          [validCredentialRef]: {
            ...record,
            ciphertext: encrypted.toString('base64'),
          },
        },
      });
    });
  }

  async has(credentialRef: string): Promise<boolean> {
    const validCredentialRef = CredentialRefSchema.parse(credentialRef);
    await this.#waitForMutations();
    return Boolean((await this.#read()).records[validCredentialRef]);
  }

  async hasForProvider(providerId: string, credentialRef: string): Promise<boolean> {
    const validProviderId = ProviderIdSchema.parse(providerId);
    const validCredentialRef = CredentialRefSchema.parse(credentialRef);
    await this.#waitForMutations();
    const record = (await this.#read()).records[validCredentialRef];
    if (!record) return false;
    assertProviderOwner(record, validProviderId);
    return true;
  }

  remove(credentialRef: string): Promise<boolean> {
    const validCredentialRef = CredentialRefSchema.parse(credentialRef);
    return this.#enqueueMutation(async () => {
      const file = await this.#read();
      if (!file.records[validCredentialRef]) return false;
      const records = { ...file.records };
      delete records[validCredentialRef];
      await this.#write({ version: 1, records });
      return true;
    });
  }

  removeForProvider(providerId: string, credentialRef: string): Promise<boolean> {
    const validProviderId = ProviderIdSchema.parse(providerId);
    const validCredentialRef = CredentialRefSchema.parse(credentialRef);
    return this.#enqueueMutation(async () => {
      const file = await this.#read();
      const record = file.records[validCredentialRef];
      if (!record) return false;
      assertProviderOwner(record, validProviderId);
      const records = { ...file.records };
      delete records[validCredentialRef];
      await this.#write({ version: 1, records });
      return true;
    });
  }

  async resolve(credentialRef: string): Promise<string | null> {
    this.#assertSecureBackend();
    const validCredentialRef = CredentialRefSchema.parse(credentialRef);
    await this.#waitForMutations();
    const record = (await this.#read()).records[validCredentialRef];
    if (!record) return null;
    return this.#safeStorage.decryptString(Buffer.from(record.ciphertext, 'base64'));
  }

  async resolveForProvider(providerId: string, credentialRef: string): Promise<string | null> {
    this.#assertSecureBackend();
    const validProviderId = ProviderIdSchema.parse(providerId);
    const validCredentialRef = CredentialRefSchema.parse(credentialRef);
    await this.#waitForMutations();
    const record = (await this.#read()).records[validCredentialRef];
    if (!record) return null;
    assertProviderOwner(record, validProviderId);
    return this.#safeStorage.decryptString(Buffer.from(record.ciphertext, 'base64'));
  }
}
