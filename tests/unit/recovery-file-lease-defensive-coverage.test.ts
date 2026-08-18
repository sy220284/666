import * as actualFs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { afterEach, describe, expect, it, vi } from 'vitest';

const directories: string[] = [];
const timing = {
  durationMs: 200,
  heartbeatMs: 80,
  waitTimeoutMs: 50,
  retryDelayMs: 2,
} as const;

async function workspace(name: string): Promise<{ directory: string; lockPath: string }> {
  const directory = await actualFs.mkdtemp(path.join(tmpdir(), `worldforge-${name}-`));
  directories.push(directory);
  return { directory, lockPath: path.join(directory, '.daily.lock') };
}

function ioError(code: string, message: string): NodeJS.ErrnoException {
  const error = new Error(message) as NodeJS.ErrnoException;
  error.code = code;
  return error;
}

function wrapHandle(
  handle: Awaited<ReturnType<typeof actualFs.open>>,
  overrides: Partial<{
    close: () => Promise<void>;
    readFile: (...args: Parameters<typeof handle.readFile>) => ReturnType<typeof handle.readFile>;
    truncate: (...args: Parameters<typeof handle.truncate>) => ReturnType<typeof handle.truncate>;
    writeFile: (
      ...args: Parameters<typeof handle.writeFile>
    ) => ReturnType<typeof handle.writeFile>;
  }>,
): Awaited<ReturnType<typeof actualFs.open>> {
  return new Proxy(handle, {
    get(target, property) {
      if (property in overrides) {
        return overrides[property as keyof typeof overrides];
      }
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

async function importLease() {
  return import('../../packages/core-service/src/recovery/file-lease.js');
}

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.doUnmock('node:fs/promises');
  vi.resetModules();
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => actualFs.rm(directory, { recursive: true, force: true })),
  );
});

describe('daily backup file lease defensive coverage', () => {
  it('handles an EEXIST race where the lock disappears before inspection', async () => {
    const { lockPath } = await workspace('lease-eexist-race');
    let firstCreate = true;
    vi.doMock('node:fs/promises', async (importOriginal) => {
      const actual = await importOriginal<typeof actualFs>();
      return {
        ...actual,
        open: async (...args: Parameters<typeof actual.open>) => {
          if (String(args[0]) === lockPath && args[1] === 'wx' && firstCreate) {
            firstCreate = false;
            throw ioError('EEXIST', 'synthetic contender');
          }
          return actual.open(...args);
        },
      };
    });

    const { acquireFileLease } = await importLease();
    const owner = await acquireFileLease(lockPath, timing);
    await owner.release();
    expect(firstCreate).toBe(false);
  });

  it('wraps generic lease inspection and reclaim-owner inspection failures', async () => {
    const leaseFailure = await workspace('lease-inspection-failure');
    vi.doMock('node:fs/promises', async (importOriginal) => {
      const actual = await importOriginal<typeof actualFs>();
      return {
        ...actual,
        lstat: async (...args: Parameters<typeof actual.lstat>) => {
          if (String(args[0]) === leaseFailure.lockPath) {
            throw ioError('EACCES', 'lease inspection denied');
          }
          return actual.lstat(...args);
        },
      };
    });
    let module = await importLease();
    await expect(
      module.reclaimExpiredFileLease(leaseFailure.lockPath, timing),
    ).rejects.toMatchObject({ code: 'BACKUP_CREATE_FAILED' });

    vi.doUnmock('node:fs/promises');
    vi.resetModules();
    const reclaimFailure = await workspace('reclaim-inspection-failure');
    const reclaimPath = `${reclaimFailure.lockPath}.reclaim`;
    await actualFs.writeFile(reclaimPath, 'occupied', 'utf8');
    vi.doMock('node:fs/promises', async (importOriginal) => {
      const actual = await importOriginal<typeof actualFs>();
      return {
        ...actual,
        lstat: async (...args: Parameters<typeof actual.lstat>) => {
          if (String(args[0]) === reclaimPath) {
            throw ioError('EACCES', 'reclaim inspection denied');
          }
          return actual.lstat(...args);
        },
      };
    });
    module = await importLease();
    await expect(
      module.reclaimExpiredFileLease(reclaimFailure.lockPath, timing),
    ).rejects.toMatchObject({ code: 'BACKUP_CREATE_FAILED' });
  });

  it('accepts a reclaim EEXIST race whose owner file vanishes before lstat', async () => {
    const { lockPath } = await workspace('reclaim-enoent-race');
    const reclaimPath = `${lockPath}.reclaim`;
    await actualFs.writeFile(reclaimPath, 'occupied', 'utf8');

    vi.doMock('node:fs/promises', async (importOriginal) => {
      const actual = await importOriginal<typeof actualFs>();
      return {
        ...actual,
        open: async (...args: Parameters<typeof actual.open>) => {
          try {
            return await actual.open(...args);
          } catch (error) {
            if (String(args[0]) === reclaimPath && args[1] === 'wx') {
              await actual.rm(reclaimPath, { force: true });
            }
            throw error;
          }
        },
      };
    });

    const { reclaimExpiredFileLease } = await importLease();
    await expect(reclaimExpiredFileLease(lockPath, timing)).resolves.toBe(false);
  });

  it('preserves a reclaim owner when process probing reports EPERM', async () => {
    const { lockPath } = await workspace('reclaim-eperm');
    const reclaimPath = `${lockPath}.reclaim`;
    await actualFs.writeFile(
      reclaimPath,
      `${JSON.stringify({
        schemaVersion: 1,
        ownerPid: 123_456,
        token: '1234567890abcdef',
        acquiredAt: Date.now(),
      })}\n`,
      'utf8',
    );
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw ioError('EPERM', 'probe denied');
    });

    const { reclaimExpiredFileLease } = await importLease();
    await expect(reclaimExpiredFileLease(lockPath, timing)).resolves.toBe(false);
    await expect(actualFs.readFile(reclaimPath, 'utf8')).resolves.toContain('1234567890abcdef');
  });

  it('swallows close failure while wrapping a failed lease write', async () => {
    const { lockPath } = await workspace('lease-write-close-failure');
    vi.doMock('node:fs/promises', async (importOriginal) => {
      const actual = await importOriginal<typeof actualFs>();
      return {
        ...actual,
        open: async (...args: Parameters<typeof actual.open>) => {
          const handle = await actual.open(...args);
          if (String(args[0]) !== lockPath || args[1] !== 'wx') return handle;
          return wrapHandle(handle, {
            truncate: async () => {
              throw ioError('EIO', 'truncate failed');
            },
            close: async () => {
              await handle.close();
              throw ioError('EIO', 'close failed');
            },
          });
        },
      };
    });

    const { acquireFileLease } = await importLease();
    await expect(acquireFileLease(lockPath, timing)).rejects.toMatchObject({
      code: 'BACKUP_CREATE_FAILED',
    });
  });

  it('rethrows an existing RecoveryServiceError from lease acquisition', async () => {
    vi.resetModules();
    const { RecoveryServiceError } =
      await import('../../packages/core-service/src/recovery/backup-manifest.js');
    const { lockPath } = await workspace('lease-existing-service-error');
    const expected = new RecoveryServiceError('BACKUP_CREATE_FAILED', 'synthetic recovery failure');
    vi.doMock('node:fs/promises', async (importOriginal) => {
      const actual = await importOriginal<typeof actualFs>();
      return {
        ...actual,
        open: async (...args: Parameters<typeof actual.open>) => {
          if (String(args[0]) === lockPath && args[1] === 'wx') throw expected;
          return actual.open(...args);
        },
      };
    });

    const { acquireFileLease } = await importLease();
    await expect(acquireFileLease(lockPath, timing)).rejects.toBe(expected);
  });

  it('covers reclaim write, final close and final remove failure handlers', async () => {
    const writeFailure = await workspace('reclaim-write-close-failure');
    const writeReclaimPath = `${writeFailure.lockPath}.reclaim`;
    vi.doMock('node:fs/promises', async (importOriginal) => {
      const actual = await importOriginal<typeof actualFs>();
      return {
        ...actual,
        open: async (...args: Parameters<typeof actual.open>) => {
          const handle = await actual.open(...args);
          if (String(args[0]) !== writeReclaimPath || args[1] !== 'wx') return handle;
          return wrapHandle(handle, {
            writeFile: async () => {
              throw ioError('EIO', 'reclaim write failed');
            },
            close: async () => {
              await handle.close();
              throw ioError('EIO', 'reclaim close failed');
            },
          });
        },
      };
    });
    let module = await importLease();
    await expect(
      module.reclaimExpiredFileLease(writeFailure.lockPath, timing),
    ).rejects.toMatchObject({ code: 'BACKUP_CREATE_FAILED' });

    vi.doUnmock('node:fs/promises');
    vi.resetModules();
    const finalFailure = await workspace('reclaim-finalizer-failure');
    const finalReclaimPath = `${finalFailure.lockPath}.reclaim`;
    vi.doMock('node:fs/promises', async (importOriginal) => {
      const actual = await importOriginal<typeof actualFs>();
      return {
        ...actual,
        open: async (...args: Parameters<typeof actual.open>) => {
          const handle = await actual.open(...args);
          if (String(args[0]) !== finalReclaimPath || args[1] !== 'wx') return handle;
          return wrapHandle(handle, {
            close: async () => {
              await handle.close();
              throw ioError('EIO', 'final close failed');
            },
          });
        },
        rm: async (...args: Parameters<typeof actual.rm>) => {
          if (String(args[0]) === finalReclaimPath) {
            await actual.rm(...args);
            throw ioError('EIO', 'post-remove failure');
          }
          return actual.rm(...args);
        },
      };
    });
    module = await importLease();
    await expect(module.reclaimExpiredFileLease(finalFailure.lockPath, timing)).resolves.toBe(true);
  });

  it('swallows a second release inspection failure after ownership was first confirmed', async () => {
    const { lockPath } = await workspace('release-second-inspection-failure');
    let releaseInspectionCount = 0;
    let acquisitionFinished = false;

    vi.doMock('node:fs/promises', async (importOriginal) => {
      const actual = await importOriginal<typeof actualFs>();
      return {
        ...actual,
        lstat: async (...args: Parameters<typeof actual.lstat>) => {
          if (acquisitionFinished && String(args[0]) === lockPath) {
            releaseInspectionCount += 1;
            if (releaseInspectionCount === 2) {
              throw ioError('EIO', 'second release inspection failed');
            }
          }
          return actual.lstat(...args);
        },
      };
    });

    const { acquireFileLease } = await importLease();
    const owner = await acquireFileLease(lockPath, {
      durationMs: 5_000,
      heartbeatMs: 4_000,
      waitTimeoutMs: 50,
      retryDelayMs: 5,
    });
    acquisitionFinished = true;
    await expect(owner.release()).resolves.toBeUndefined();
    expect(releaseInspectionCount).toBe(2);
    await expect(actualFs.readFile(lockPath, 'utf8')).resolves.toContain('"schemaVersion":1');
  });

  it('rechecks the token before release removes the lease', async () => {
    const { lockPath } = await workspace('release-confirm-race');
    let intercepted = false;
    const successorToken = 'fedcba0987654321';

    vi.doMock('node:fs/promises', async (importOriginal) => {
      const actual = await importOriginal<typeof actualFs>();
      return {
        ...actual,
        readFile: async (...args: Parameters<typeof actual.readFile>) => {
          const raw = await actual.readFile(...args);
          if (!intercepted && String(args[0]) === lockPath) {
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

    const { acquireFileLease } = await importLease();
    const owner = await acquireFileLease(lockPath, {
      durationMs: 5_000,
      heartbeatMs: 4_000,
      waitTimeoutMs: 50,
      retryDelayMs: 5,
    });
    await owner.release();
    expect(intercepted).toBe(true);
    await expect(actualFs.readFile(lockPath, 'utf8')).resolves.toContain(successorToken);
  });

  it('queues a pending heartbeat while refresh is still running and then replays it', async () => {
    const { lockPath } = await workspace('heartbeat-pending');
    let releaseRead: (() => void) | undefined;
    let firstRefresh = true;
    let blocked = false;
    let refreshCount = 0;
    const gate = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });

    vi.doMock('node:fs/promises', async (importOriginal) => {
      const actual = await importOriginal<typeof actualFs>();
      return {
        ...actual,
        open: async (...args: Parameters<typeof actual.open>) => {
          const handle = await actual.open(...args);
          if (String(args[0]) !== lockPath || args[1] !== 'r+') return handle;
          refreshCount += 1;
          if (!firstRefresh) return handle;
          firstRefresh = false;
          const originalRead = handle.readFile.bind(handle);
          return wrapHandle(handle, {
            readFile: async (...readArgs) => {
              blocked = true;
              await gate;
              return originalRead(...readArgs);
            },
            close: async () => {
              await handle.close();
              throw ioError('EIO', 'refresh close failure');
            },
          });
        },
      };
    });

    const { acquireFileLease } = await importLease();
    const owner = await acquireFileLease(lockPath, {
      durationMs: 500,
      heartbeatMs: 20,
      waitTimeoutMs: 50,
      retryDelayMs: 2,
    });
    for (let index = 0; index < 40 && !blocked; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(blocked).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 30));
    releaseRead?.();
    for (let index = 0; index < 40 && refreshCount < 2; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(refreshCount).toBeGreaterThanOrEqual(2);
    await owner.release();
  });

  it('lets a queued heartbeat observe release before entering refresh', async () => {
    vi.useFakeTimers();
    const { lockPath } = await workspace('heartbeat-release-race');
    const { acquireFileLease } = await importLease();
    const owner = await acquireFileLease(lockPath, {
      durationMs: 500,
      heartbeatMs: 20,
      waitTimeoutMs: 50,
      retryDelayMs: 2,
    });
    vi.advanceTimersByTime(20);
    await owner.release();
    await Promise.resolve();
  });
});
