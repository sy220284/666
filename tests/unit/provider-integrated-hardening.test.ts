import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CredentialBroker,
  type SafeStorageAdapter,
} from '../../apps/desktop/main/src/credential-broker.js';
import { ProviderOperationCoordinator } from '../../apps/desktop/main/src/provider-operation-coordinator.js';
import { createBoundedProviderFetch } from '../../packages/core-service/src/provider-adapter-runtime.js';

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

describe('M4 integrated Provider hardening', () => {
  it('serializes one Provider, keeps other Providers concurrent, and deduplicates mutation retries', async () => {
    const coordinator = new ProviderOperationCoordinator();
    const order: string[] = [];
    let releaseFirst!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const firstOperation = vi.fn(async () => {
      order.push('a:first:start');
      await gate;
      order.push('a:first:end');
      return 'saved';
    });
    const first = coordinator.runMutation('provider-a', 'request-1', 'save', firstOperation);
    const retry = coordinator.runMutation('provider-a', 'request-1', 'save', firstOperation);
    const second = coordinator.runMutation('provider-a', 'request-2', 'remove', async () => {
      order.push('a:second');
      return 'removed';
    });
    const other = coordinator.runMutation('provider-b', 'request-3', 'save', async () => {
      order.push('b:first');
      return 'other';
    });

    await Promise.resolve();
    expect(retry).toBe(first);
    expect(firstOperation).toHaveBeenCalledTimes(1);
    await expect(other).resolves.toBe('other');
    expect(order).toEqual(['a:first:start', 'b:first']);

    releaseFirst();
    await expect(Promise.all([first, retry, second])).resolves.toEqual([
      'saved',
      'saved',
      'removed',
    ]);
    expect(order).toEqual(['a:first:start', 'b:first', 'a:first:end', 'a:second']);
  });

  it('rejects cross-Provider credential reads and deletes without damaging the owner record', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-provider-owner-'));
    temporaryDirectories.push(root);
    const broker = new CredentialBroker(safeStorage, path.join(root, 'credentials.json'));
    const reference = await broker.store('provider-a', 'secret-a');

    await expect(broker.hasForProvider('provider-a', reference)).resolves.toBe(true);
    await expect(broker.hasForProvider('provider-b', reference)).rejects.toThrow(
      'CREDENTIAL_PROVIDER_MISMATCH',
    );
    await expect(broker.resolveForProvider('provider-b', reference)).rejects.toThrow(
      'CREDENTIAL_PROVIDER_MISMATCH',
    );
    await expect(broker.removeForProvider('provider-b', reference)).rejects.toThrow(
      'CREDENTIAL_PROVIDER_MISMATCH',
    );
    await expect(broker.resolveForProvider('provider-a', reference)).resolves.toBe('secret-a');
    await expect(broker.removeForProvider('provider-a', reference)).resolves.toBe(true);
  });

  it('rejects declared and streamed Provider responses that exceed the byte budget', async () => {
    const declaredFetch: typeof fetch = async () =>
      new Response('oversized', {
        status: 200,
        headers: { 'content-length': '9' },
      });
    const declared = createBoundedProviderFetch(declaredFetch, 8);
    await expect(declared('https://provider.example')).rejects.toMatchObject({
      code: 'AI_OUTPUT_INVALID_008',
    });

    const streamedFetch: typeof fetch = async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2, 3, 4]));
            controller.enqueue(new Uint8Array([5, 6, 7, 8, 9]));
            controller.close();
          },
        }),
        { status: 200 },
      );
    const streamed = createBoundedProviderFetch(streamedFetch, 8);
    const response = await streamed('https://provider.example');
    await expect(response.arrayBuffer()).rejects.toMatchObject({
      code: 'AI_OUTPUT_INVALID_008',
    });
  });
});
