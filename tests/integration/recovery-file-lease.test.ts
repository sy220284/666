import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { acquireFileLease } from '../../packages/core-service/src/recovery/file-lease.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('daily backup file lease', () => {
  it('keeps a live owner beyond the lease duration through heartbeat', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'worldforge-live-lease-'));
    directories.push(directory);
    const lockPath = path.join(directory, '.daily.lock');
    const owner = await acquireFileLease(lockPath, {
      durationMs: 60,
      heartbeatMs: 10,
      waitTimeoutMs: 30,
      retryDelayMs: 5,
    });
    try {
      await new Promise((resolve) => setTimeout(resolve, 90));
      await expect(owner.assertOwner()).resolves.toBeUndefined();
      await expect(
        acquireFileLease(lockPath, {
          durationMs: 60,
          heartbeatMs: 10,
          waitTimeoutMs: 25,
          retryDelayMs: 5,
        }),
      ).rejects.toMatchObject({ code: 'BACKUP_CREATE_FAILED' });
    } finally {
      await owner.release();
    }
  });

  it('fences an expired owner and prevents it from deleting the successor lease', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'worldforge-stale-lease-'));
    directories.push(directory);
    const lockPath = path.join(directory, '.daily.lock');
    const expired = await acquireFileLease(lockPath, {
      durationMs: 20,
      heartbeatMs: 1_000,
      waitTimeoutMs: 30,
      retryDelayMs: 5,
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    const successor = await acquireFileLease(lockPath, {
      durationMs: 100,
      heartbeatMs: 20,
      waitTimeoutMs: 50,
      retryDelayMs: 5,
    });
    try {
      await expect(expired.assertOwner()).rejects.toMatchObject({
        code: 'BACKUP_CREATE_FAILED',
      });
      await expired.release();
      await expect(successor.assertOwner()).resolves.toBeUndefined();
    } finally {
      await successor.release();
      await expired.release();
    }
  });

  it('reclaims a stale lock left by the legacy mtime-only implementation', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'worldforge-legacy-lease-'));
    directories.push(directory);
    const lockPath = path.join(directory, '.daily.lock');
    await writeFile(lockPath, '');
    const staleAt = new Date(Date.now() - 5_000);
    await utimes(lockPath, staleAt, staleAt);

    const lease = await acquireFileLease(lockPath, {
      durationMs: 100,
      heartbeatMs: 20,
      waitTimeoutMs: 100,
      retryDelayMs: 5,
    });
    try {
      await expect(lease.assertOwner()).resolves.toBeUndefined();
    } finally {
      await lease.release();
    }
  });

  it('serializes concurrent reclaimers so only one stale-lock contender owns the lease', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'worldforge-reclaim-race-'));
    directories.push(directory);
    const lockPath = path.join(directory, '.daily.lock');
    await writeFile(lockPath, '');
    const staleAt = new Date(Date.now() - 5_000);
    await utimes(lockPath, staleAt, staleAt);

    const timing = {
      durationMs: 100,
      heartbeatMs: 20,
      waitTimeoutMs: 45,
      retryDelayMs: 2,
    } as const;
    const contenders = await Promise.allSettled(
      Array.from({ length: 6 }, () => acquireFileLease(lockPath, timing)),
    );
    const winners = contenders.filter(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof acquireFileLease>>> =>
        result.status === 'fulfilled',
    );
    try {
      expect(winners).toHaveLength(1);
      await expect(winners[0]!.value.assertOwner()).resolves.toBeUndefined();
      expect(contenders.filter((result) => result.status === 'rejected')).toHaveLength(5);
    } finally {
      await Promise.all(winners.map((result) => result.value.release()));
    }
  });
});
