import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { format } from 'prettier';
import { afterEach, describe, expect, it } from 'vitest';

import {
  CredentialBroker,
  type SafeStorageAdapter,
} from '../../apps/desktop/main/src/credential-broker.js';

const temporaryDirectories: string[] = [];

const safeStorage: SafeStorageAdapter = {
  isEncryptionAvailable: () => true,
  getSelectedStorageBackend: () => 'keyring',
  encryptString: (plainText) => Buffer.from(plainText, 'utf8'),
  decryptString: (encrypted) => encrypted.toString('utf8'),
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('CredentialBroker', () => {
  it('serializes concurrent read-modify-write mutations without losing credentials', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-credentials-'));
    temporaryDirectories.push(root);
    const broker = new CredentialBroker(safeStorage, path.join(root, 'credentials.json'));

    const credentials = Array.from({ length: 16 }, (_, index) => `secret-${index}`);
    const references = await Promise.all(
      credentials.map((credential, index) => broker.store(`provider-${index}`, credential)),
    );

    await expect(
      Promise.all(references.map((reference) => broker.has(reference))),
    ).resolves.toEqual(references.map(() => true));
    await expect(
      Promise.all(references.map((reference) => broker.resolve(reference))),
    ).resolves.toEqual(credentials);

    const removed = await Promise.all(references.map((reference) => broker.remove(reference)));
    expect(removed).toEqual(references.map(() => true));
    await expect(
      Promise.all(references.map((reference) => broker.has(reference))),
    ).resolves.toEqual(references.map(() => false));
  });

  it('captures the repository Prettier output for the coordinated import service', async () => {
    const sourcePath = path.resolve('packages/core-service/src/coordinated-import-export.ts');
    const source = await readFile(sourcePath, 'utf8');
    const formatted = await format(source, {
      filepath: sourcePath,
      printWidth: 100,
      singleQuote: true,
      trailingComma: 'all',
    });
    if (source !== formatted) {
      const outputDirectory = path.resolve('test-results/unit');
      await mkdir(outputDirectory, { recursive: true });
      await writeFile(
        path.join(outputDirectory, 'coordinated-import-export.prettier.ts'),
        formatted,
        'utf8',
      );
    }
    expect(source).toBe(formatted);
  });
});
