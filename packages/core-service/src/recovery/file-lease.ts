import { randomUUID } from 'node:crypto';
import { lstat, open, readFile, rm } from 'node:fs/promises';
import process from 'node:process';

import { RecoveryServiceError } from './backup-manifest.js';
import type { FileLeaseTiming } from './file-lease-types.js';

export type { FileLeaseTiming } from './file-lease-types.js';

interface FileLeaseDocument {
  readonly schemaVersion: 1;
  readonly ownerPid: number;
  readonly token: string;
  readonly acquiredAt: number;
  readonly heartbeatAt: number;
  readonly expiresAt: number;
}

interface ReclaimDocument {
  readonly schemaVersion: 1;
  readonly ownerPid: number;
  readonly token: string;
  readonly acquiredAt: number;
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
  return { ...timing };
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

function parseReclaimDocument(raw: string): ReclaimDocument | null {
  try {
    const value = JSON.parse(raw) as Partial<ReclaimDocument>;
    if (
      value.schemaVersion !== 1 ||
      !Number.isInteger(value.ownerPid) ||
      typeof value.token !== 'string' ||
      value.token.length < 16 ||
      !Number.isFinite(value.acquiredAt)
    ) {
      return null;
    }
    return value as ReclaimDocument;
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

function expiredLease(
  current: Awaited<ReturnType<typeof inspectLease>>,
  now: number,
  timing: FileLeaseTiming,
): boolean {
  if (!current) return false;
  return current.document
    ? current.document.expiresAt <= now
    : now - current.mtimeMs >= timing.durationMs;
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

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return isCode(error, 'EPERM');
  }
}

async function clearDeadReclaim(reclaimPath: string): Promise<boolean> {
  try {
    const details = await lstat(reclaimPath);
    if (!details.isFile() || details.isSymbolicLink()) {
      throw failure('Daily backup reclaim path is not a regular file.');
    }
    const document = parseReclaimDocument(await readFile(reclaimPath, 'utf8'));
    if (document && processAlive(document.ownerPid)) return false;
    await rm(reclaimPath, { force: true });
    return true;
  } catch (error) {
    if (isCode(error, 'ENOENT')) return true;
    if (error instanceof RecoveryServiceError) throw error;
    throw failure('Unable to inspect the daily backup reclaim owner.', error);
  }
}

export async function reclaimExpiredFileLease(
  lockPath: string,
  timingInput?: FileLeaseTiming,
): Promise<boolean> {
  const timing = normalizeTiming(timingInput);
  const reclaimPath = `${lockPath}.reclaim`;
  const token = randomUUID();
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    try {
      handle = await open(reclaimPath, 'wx', 0o600);
      await handle.writeFile(
        `${JSON.stringify({
          schemaVersion: 1,
          ownerPid: process.pid,
          token,
          acquiredAt: Date.now(),
        } satisfies ReclaimDocument)}\n`,
        'utf8',
      );
      await handle.sync();
    } catch (error) {
      await handle?.close().catch(() => undefined);
      handle = undefined;
      if (!isCode(error, 'EEXIST')) throw error;
      await clearDeadReclaim(reclaimPath);
      return false;
    }

    const current = await inspectLease(lockPath);
    if (!current) return true;
    if (!expiredLease(current, Date.now(), timing)) return false;
    await rm(lockPath, { force: true });
    return true;
  } catch (error) {
    if (error instanceof RecoveryServiceError) throw error;
    throw failure('Unable to reclaim the expired daily backup lease.', error);
  } finally {
    await handle?.close().catch(() => undefined);
    const current = await readFile(reclaimPath, 'utf8')
      .then(parseReclaimDocument)
      .catch(() => null);
    if (current?.token === token) await rm(reclaimPath, { force: true }).catch(() => undefined);
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
  let heartbeatScheduled = false;
  let heartbeatPending = false;
  let operationTail: Promise<void> = Promise.resolve();

  function runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const run = operationTail.then(operation, operation);
    operationTail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  function scheduleHeartbeat(): void {
    if (released || ownershipLost) return;
    if (heartbeatScheduled) {
      heartbeatPending = true;
      return;
    }
    heartbeatScheduled = true;
    heartbeatPending = false;
    void runExclusive(async () => {
      if (released || ownershipLost) return;
      const owned = await refreshLease(lockPath, token, acquiredAt, timing);
      if (!owned) ownershipLost = true;
    }).finally(() => {
      heartbeatScheduled = false;
      if (heartbeatPending && !released && !ownershipLost) {
        heartbeatPending = false;
        scheduleHeartbeat();
      }
    });
  }

  const heartbeat = setInterval(scheduleHeartbeat, timing.heartbeatMs);
  heartbeat.unref();

  return {
    async assertOwner(): Promise<void> {
      await runExclusive(async () => {
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
      });
    },

    async release(): Promise<void> {
      if (released) return;
      released = true;
      clearInterval(heartbeat);
      await runExclusive(async () => {
        const current = await inspectLease(lockPath).catch(() => null);
        if (!current?.document || current.document.token !== token) return;
        const confirmed = await inspectLease(lockPath).catch(() => null);
        if (!confirmed?.document || confirmed.document.token !== token) return;
        await rm(lockPath, { force: true });
      });
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
    const now = Date.now();
    if (expiredLease(current, now, timing)) {
      const reclaimed = await reclaimExpiredFileLease(lockPath, timing);
      if (reclaimed) continue;
    }
    if (Date.now() - startedAt >= timing.waitTimeoutMs) {
      throw failure('Daily backup coordination timed out.');
    }
    await new Promise((resolve) => setTimeout(resolve, timing.retryDelayMs));
  }
}
