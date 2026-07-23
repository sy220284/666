import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

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

  it('rejects invalid provider identifiers at the broker boundary', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-credentials-'));
    temporaryDirectories.push(root);
    const broker = new CredentialBroker(safeStorage, path.join(root, 'credentials.json'));

    await expect(broker.store('../escape', 'secret')).rejects.toThrow();
  });

  it('rejects credential files with malformed references or provider identifiers', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-credentials-'));
    temporaryDirectories.push(root);
    const filePath = path.join(root, 'credentials.json');
    await writeFile(
      filePath,
      JSON.stringify({
        version: 1,
        records: {
          unsafe_reference: {
            providerId: '../escape',
            ciphertext: Buffer.from('secret').toString('base64'),
            createdAt: '2026-07-23T12:00:00.000Z',
          },
        },
      }),
      'utf8',
    );
    const broker = new CredentialBroker(safeStorage, filePath);

    await expect(broker.has('cred_550e8400-e29b-41d4-a716-446655440000')).rejects.toThrow(
      'CREDENTIAL_STORE_CORRUPT',
    );
  });
});
