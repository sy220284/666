import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  acquireFileLease,
  reclaimExpiredFileLease,
  type FileLeaseTiming,
} from '../../packages/core-service/src/recovery/file-lease.js';

const directories: string[] = [];
const timing: FileLeaseTiming = {
  durationMs: 200,
  heartbeatMs: 80,
  waitTimeoutMs: 30,
  retryDelayMs: 2,
};

async function workspace(name: string): Promise<{ directory: string; lockPath: string }> {
  const directory = await mkdtemp(path.join(tmpdir(), `worldforge-${name}-`));
  directories.push(directory);
  return { directory, lockPath: path.join(directory, '.daily.lock') };
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('daily backup file lease edge coverage', () => {
  it('rejects invalid timing without attaching an artificial cause', async () => {
    const { lockPath } = await workspace('invalid-lease-timing');
    await expect(acquireFileLease(lockPath, { ...timing, durationMs: 0 })).rejects.toMatchObject({
      code: 'BACKUP_CREATE_FAILED',
    });
  });

  it('uses default timing and rejects reclaim when the parent directory is missing', async () => {
    const defaults = await workspace('default-timing');
    const owner = await acquireFileLease(defaults.lockPath);
    await owner.release();

    const missing = await workspace('missing-reclaim-parent');
    await expect(
      reclaimExpiredFileLease(path.join(missing.directory, 'missing', '.daily.lock'), timing),
    ).rejects.toMatchObject({ code: 'BACKUP_CREATE_FAILED' });
  });

  it('reclaims a missing lock and refuses a live lock', async () => {
    const { lockPath } = await workspace('reclaim-live-missing');
    await expect(reclaimExpiredFileLease(lockPath, timing)).resolves.toBe(true);

    const owner = await acquireFileLease(lockPath, timing);
    try {
      await expect(reclaimExpiredFileLease(lockPath, timing)).resolves.toBe(false);
    } finally {
      await owner.release();
    }
  });

  it('treats a structurally invalid lease as mtime-only state', async () => {
    const { lockPath } = await workspace('invalid-lease-document');
    await writeFile(
      lockPath,
      `${JSON.stringify({ schemaVersion: 1, ownerPid: process.pid, token: 'short' })}\n`,
      'utf8',
    );
    await expect(reclaimExpiredFileLease(lockPath, timing)).resolves.toBe(false);

    const staleAt = new Date(Date.now() - 5_000);
    await utimes(lockPath, staleAt, staleAt);
    await expect(reclaimExpiredFileLease(lockPath, timing)).resolves.toBe(true);
  });

  it('rejects a directory used as the lease or reclaim coordination path', async () => {
    const first = await workspace('lease-directory');
    await mkdir(first.lockPath);
    await expect(reclaimExpiredFileLease(first.lockPath, timing)).rejects.toMatchObject({
      code: 'BACKUP_CREATE_FAILED',
    });

    const second = await workspace('reclaim-directory');
    await mkdir(`${second.lockPath}.reclaim`);
    await expect(reclaimExpiredFileLease(second.lockPath, timing)).rejects.toMatchObject({
      code: 'BACKUP_CREATE_FAILED',
    });
  });

  it('keeps a reclaim claim owned by a live process and clears dead or malformed owners', async () => {
    const { lockPath } = await workspace('reclaim-owner');
    const reclaimPath = `${lockPath}.reclaim`;
    const liveDocument = {
      schemaVersion: 1,
      ownerPid: process.pid,
      token: randomUUID(),
      acquiredAt: Date.now(),
    } as const;
    await writeFile(reclaimPath, `${JSON.stringify(liveDocument)}\n`, 'utf8');
    await expect(reclaimExpiredFileLease(lockPath, timing)).resolves.toBe(false);
    expect(JSON.parse(await readFile(reclaimPath, 'utf8'))).toMatchObject(liveDocument);

    await writeFile(
      reclaimPath,
      `${JSON.stringify({ ...liveDocument, ownerPid: 2_147_483_647, token: randomUUID() })}\n`,
      'utf8',
    );
    await expect(reclaimExpiredFileLease(lockPath, timing)).resolves.toBe(false);
    await expect(readFile(reclaimPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });

    await writeFile(
      reclaimPath,
      `${JSON.stringify({ schemaVersion: 1, ownerPid: process.pid, token: 'short' })}\n`,
      'utf8',
    );
    await expect(reclaimExpiredFileLease(lockPath, timing)).resolves.toBe(false);
    await expect(readFile(reclaimPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });

    await writeFile(reclaimPath, '{ malformed', 'utf8');
    await expect(reclaimExpiredFileLease(lockPath, timing)).resolves.toBe(false);
    await expect(readFile(reclaimPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects acquisition when the lock parent does not exist', async () => {
    const { directory } = await workspace('missing-parent');
    const lockPath = path.join(directory, 'missing', '.daily.lock');
    await expect(acquireFileLease(lockPath, timing)).rejects.toMatchObject({
      code: 'BACKUP_CREATE_FAILED',
    });
  });

  it('fences released, missing, replaced and expired ownership states', async () => {
    const released = await workspace('released-owner');
    const releasedOwner = await acquireFileLease(released.lockPath, timing);
    await releasedOwner.release();
    await expect(releasedOwner.assertOwner()).rejects.toMatchObject({
      code: 'BACKUP_CREATE_FAILED',
    });
    await expect(releasedOwner.release()).resolves.toBeUndefined();

    const missing = await workspace('missing-owner');
    const missingOwner = await acquireFileLease(missing.lockPath, timing);
    await rm(missing.lockPath, { force: true });
    await expect(missingOwner.assertOwner()).rejects.toMatchObject({
      code: 'BACKUP_CREATE_FAILED',
    });
    await expect(missingOwner.release()).resolves.toBeUndefined();

    const replaced = await workspace('replaced-owner');
    const replacedOwner = await acquireFileLease(replaced.lockPath, timing);
    const replacedDocument = JSON.parse(await readFile(replaced.lockPath, 'utf8')) as Record<
      string,
      unknown
    >;
    await writeFile(
      replaced.lockPath,
      `${JSON.stringify({ ...replacedDocument, token: randomUUID() })}\n`,
      'utf8',
    );
    await expect(replacedOwner.assertOwner()).rejects.toMatchObject({
      code: 'BACKUP_CREATE_FAILED',
    });
    await expect(replacedOwner.release()).resolves.toBeUndefined();

    const expired = await workspace('expired-owner');
    const expiredOwner = await acquireFileLease(expired.lockPath, {
      ...timing,
      heartbeatMs: 5_000,
    });
    const expiredDocument = JSON.parse(await readFile(expired.lockPath, 'utf8')) as Record<
      string,
      unknown
    >;
    await writeFile(
      expired.lockPath,
      `${JSON.stringify({ ...expiredDocument, expiresAt: Date.now() - 1 })}\n`,
      'utf8',
    );
    await expect(expiredOwner.assertOwner()).rejects.toMatchObject({
      code: 'BACKUP_CREATE_FAILED',
    });
    await expiredOwner.release();
  });

  it('marks ownership lost when heartbeat sees a replaced token, a missing path or an I/O shape error', async () => {
    const replaced = await workspace('heartbeat-replaced');
    const replacedOwner = await acquireFileLease(replaced.lockPath, {
      ...timing,
      durationMs: 500,
      heartbeatMs: 20,
    });
    const document = JSON.parse(await readFile(replaced.lockPath, 'utf8')) as Record<
      string,
      unknown
    >;
    await writeFile(
      replaced.lockPath,
      `${JSON.stringify({ ...document, token: randomUUID() })}\n`,
      'utf8',
    );
    await sleep(70);
    await expect(replacedOwner.assertOwner()).rejects.toMatchObject({
      code: 'BACKUP_CREATE_FAILED',
    });
    await replacedOwner.release();

    const missing = await workspace('heartbeat-missing');
    const missingOwner = await acquireFileLease(missing.lockPath, {
      ...timing,
      durationMs: 500,
      heartbeatMs: 20,
    });
    await rm(missing.lockPath, { force: true });
    await sleep(50);
    await expect(missingOwner.assertOwner()).rejects.toMatchObject({
      code: 'BACKUP_CREATE_FAILED',
    });
    await missingOwner.release();

    const directory = await workspace('heartbeat-directory');
    const directoryOwner = await acquireFileLease(directory.lockPath, {
      ...timing,
      durationMs: 500,
      heartbeatMs: 20,
    });
    await rm(directory.lockPath, { force: true });
    await mkdir(directory.lockPath);
    await sleep(50);
    await expect(directoryOwner.assertOwner()).rejects.toMatchObject({
      code: 'BACKUP_CREATE_FAILED',
    });
    await directoryOwner.release();
  });
});
