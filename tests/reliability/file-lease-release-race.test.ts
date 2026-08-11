import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile as actualReadFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const directories: string[] = [];

afterEach(async () => {
  vi.doUnmock('node:fs/promises');
  vi.resetModules();
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('reliability: daily backup lease release fencing', () => {
  it('re-checks the token immediately before removal when a successor takes over mid-release', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'worldforge-reliability-release-race-'));
    directories.push(directory);
    const lockPath = path.join(directory, '.daily.lock');
    const successorToken = randomUUID();
    let intercepted = false;

    vi.doMock('node:fs/promises', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:fs/promises')>();
      return {
        ...actual,
        readFile: async (...args: Parameters<typeof actual.readFile>) => {
          const raw = await actual.readFile(...args);
          const requestedPath = String(args[0]);
          if (!intercepted && requestedPath === lockPath) {
            intercepted = true;
            const current = JSON.parse(String(raw)) as { acquiredAt: number };
            const now = Date.now();
            await actual.writeFile(
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
          }
          return raw;
        },
      };
    });

    const { acquireFileLease } = await import(
      '../../packages/core-service/src/recovery/file-lease.js'
    );
    const owner = await acquireFileLease(lockPath, {
      durationMs: 5_000,
      heartbeatMs: 4_000,
      waitTimeoutMs: 50,
      retryDelayMs: 5,
    });

    await owner.release();

    expect(intercepted).toBe(true);
    const successor = JSON.parse(await actualReadFile(lockPath, 'utf8')) as { token: string };
    expect(successor.token).toBe(successorToken);
  });
});
