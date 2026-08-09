import { randomUUID } from 'node:crypto';
import { lstat, open, readFile, rm } from 'node:fs/promises';
import process from 'node:process';

import { RecoveryServiceError } from './backup-manifest.js';

export interface FileLeaseTiming {
  readonly durationMs: number;
  readonly heartbeatMs: number;
  readonly waitTimeoutMs: number;
  readonly retryDelayMs: number;
}

interface FileLeaseDocument {
  readonly schemaVersion: 1;
  readonly ownerPid: number;
  readonly token: string;
  readonly acquiredAt: number;
  readonly heartbeatAt: number;
  readonly expiresAt: number;
}

export interface FileLease {
  assertOwner(): Promise<void>;
  release(): Promise<void>;
}

const DEFAULT_TIMING: FileLeaseTiming = Object.freeze({
  durationMs: 30_000,
  heartbeatMs: 10_000,
  waitTimeoutMs: 30_000,
  retryDelayMs: 50,
});

function failure(message: string, cause?: unknown): RecoveryServiceError {
  return new RecoveryServiceError(
    'BACKUP_CREATE_FAILED',
    message,
    cause === undefined ? undefined : { cause },
  );
}

function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

function normalizeTiming(input?: FileLeaseTiming): FileLeaseTiming {
  const timing = input ?? DEFAULT_TIMING;
  for (const [name, value] of Object.entries(timing)) {
    if (!Number.isFinite(value) || value <= 0) {
      throw failure(`Invalid file lease timing: ${name}`);
    }
  }
  if (timing.heartbeatMs >= timing.durationMs) {
    return { ...timing };
  }
  return timing;
}

function parseLeaseDocument(raw: string): FileLeaseDocument | null {
  try {
    const value = JSON.parse(raw) as Partial<FileLeaseDocument>;
    if (
      value.schemaVersion !== 1 ||
      !Number.isInteger(value.ownerPid) ||
      typeof value.token !== 'string' ||
      value.token.length < 16 ||
      !Number.isFinite(value.acquiredAt) ||
      !Number.isFinite(value.heartbeatAt) ||
      !Number.isFinite(value.expiresAt)
    ) {
      return null;
    }
    return value as FileLeaseDocument;
  } catch {
    return null;
  }
}

async function inspectLease(
  lockPath: string,
): Promise<{ readonly document: FileLeaseDocument | null; readonly mtimeMs: number } | null> {
  try {
    const details = await lstat(lockPath);
    if (!details.isFile() || details.isSymbolicLink()) {
      throw failure('Daily backup lease path is not a regular file.');
    }
    const raw = await readFile(lockPath, 'utf8');
    return { document: parseLeaseDocument(raw), mtimeMs: details.mtimeMs };
  } catch (error) {
    if (isCode(error, 'ENOENT')) return null;
    if (error instanceof RecoveryServiceError) throw error;
    throw failure('Unable to inspect the daily backup lease.', error);
  }
}

async function writeLeaseDocument(
  handle: Awaited<ReturnType<typeof open>>,
  document: FileLeaseDocument,
): Promise<void> {
  const bytes = Buffer.from(`${JSON.stringify(document)}\n`, 'utf8');
  await handle.truncate(0);
  await handle.write(bytes, 0, bytes.length, 0);
  await handle.sync();
}

async function refreshLease(
  lockPath: string,
  token: string,
  acquiredAt: number,
  timing: FileLeaseTiming,
): Promise<boolean> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(lockPath, 'r+');
    const current = parseLeaseDocument(await handle.readFile('utf8'));
    if (!current || current.token !== token) return false;
    const now = Date.now();
    await writeLeaseDocument(handle, {
      schemaVersion: 1,
      ownerPid: process.pid,
      token,
      acquiredAt,
      heartbeatAt: now,
      expiresAt: now + timing.durationMs,
    });
    return true;
  } catch (error) {
    if (isCode(error, 'ENOENT')) return false;
    return false;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

function createLease(
  lockPath: string,
  token: string,
  acquiredAt: number,
  timing: FileLeaseTiming,
): FileLease {
  let released = false;
  let ownershipLost = false;
  const heartbeat = setInterval(() => {
    if (released || ownershipLost) return;
    void refreshLease(lockPath, token, acquiredAt, timing).then((owned) => {
      if (!owned) ownershipLost = true;
    });
  }, timing.heartbeatMs);
  heartbeat.unref();

  return {
    async assertOwner(): Promise<void> {
      if (released || ownershipLost) {
        throw failure('Daily backup lease ownership was lost.');
      }
      const current = await inspectLease(lockPath);
      if (
        !current?.document ||
        current.document.token !== token ||
        current.document.expiresAt <= Date.now()
      ) {
        ownershipLost = true;
        throw failure('Daily backup lease ownership was lost.');
      }
    },

    async release(): Promise<void> {
      if (released) return;
      released = true;
      clearInterval(heartbeat);
      const current = await inspectLease(lockPath).catch(() => null);
      if (!current?.document || current.document.token !== token) return;
      const confirmed = await inspectLease(lockPath).catch(() => null);
      if (!confirmed?.document || confirmed.document.token !== token) return;
      await rm(lockPath, { force: true });
    },
  };
}

export async function acquireFileLease(
  lockPath: string,
  timingInput?: FileLeaseTiming,
): Promise<FileLease> {
  const timing = normalizeTiming(timingInput);
  const startedAt = Date.now();

  for (;;) {
    const acquiredAt = Date.now();
    const token = randomUUID();
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(lockPath, 'wx', 0o600);
      await writeLeaseDocument(handle, {
        schemaVersion: 1,
        ownerPid: process.pid,
        token,
        acquiredAt,
        heartbeatAt: acquiredAt,
        expiresAt: acquiredAt + timing.durationMs,
      });
      await handle.close();
      handle = undefined;
      return createLease(lockPath, token, acquiredAt, timing);
    } catch (error) {
      await handle?.close().catch(() => undefined);
      if (!isCode(error, 'EEXIST')) {
        if (error instanceof RecoveryServiceError) throw error;
        throw failure('Unable to acquire the daily backup lease.', error);
      }
    }

    const current = await inspectLease(lockPath);
    if (!current) continue;
    const now = Date.now();
    const expired = current.document
      ? current.document.expiresAt <= now
      : now - current.mtimeMs >= timing.durationMs;
    if (expired) {
      await rm(lockPath, { force: true });
      continue;
    }
    if (now - startedAt >= timing.waitTimeoutMs) {
      throw failure('Daily backup coordination timed out.');
    }
    await new Promise((resolve) => setTimeout(resolve, timing.retryDelayMs));
  }
}
