import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { acquireFileLease } from '../../packages/core-service/src/recovery/file-lease.js';

const directories: string[] = [];

const timing = {
  durationMs: 250,
  heartbeatMs: 25,
  waitTimeoutMs: 30,
  retryDelayMs: 3,
} as const;

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('reliability: daily backup lease contention', () => {
  it('keeps exactly one owner through repeated contention and handoff cycles', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'worldforge-reliability-lease-'));
    directories.push(directory);
    const lockPath = path.join(directory, '.daily.lock');

    for (let cycle = 0; cycle < 16; cycle += 1) {
      const owner = await acquireFileLease(lockPath, timing);
      try {
        const contenders = await Promise.allSettled(
          Array.from({ length: 4 }, () => acquireFileLease(lockPath, timing)),
        );
        expect(contenders.every((result) => result.status === 'rejected')).toBe(true);
        await expect(owner.assertOwner()).resolves.toBeUndefined();
      } finally {
        await owner.release();
      }

      const successor = await acquireFileLease(lockPath, timing);
      try {
        await expect(successor.assertOwner()).resolves.toBeUndefined();
      } finally {
        await successor.release();
      }
    }
  });

  it('never lets an old owner delete a manually installed successor token', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'worldforge-reliability-fence-'));
    directories.push(directory);
    const lockPath = path.join(directory, '.daily.lock');
    const owner = await acquireFileLease(lockPath, {
      durationMs: 5_000,
      heartbeatMs: 4_000,
      waitTimeoutMs: 50,
      retryDelayMs: 5,
    });

    const current = JSON.parse(await readFile(lockPath, 'utf8')) as {
      acquiredAt: number;
    };
    const successorToken = randomUUID();
    const now = Date.now();
    await writeFile(
      lockPath,
      `${JSON.stringify({
        schemaVersion: 1,
        ownerPid: process.pid,
        token: successorToken,
        acquiredAt: current.acquiredAt + 1,
        heartbeatAt: now,
        expiresAt: now + 5_000,
      })}\n`,
      'utf8',
    );

    await expect(owner.assertOwner()).rejects.toMatchObject({ code: 'BACKUP_CREATE_FAILED' });
    await owner.release();

    const afterOldRelease = JSON.parse(await readFile(lockPath, 'utf8')) as {
      token: string;
    };
    expect(afterOldRelease.token).toBe(successorToken);
  });
});
