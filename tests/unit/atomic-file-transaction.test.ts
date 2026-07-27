import { mkdir, mkdtemp, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  recoverAtomicFileTransactions,
  writeFilesAtomically,
} from '../../scripts/atomic-file-transaction.mjs';

describe('atomic file transactions', () => {
  it('replaces all files as one committed transaction', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-atomic-success-'));
    const journalDirectory = path.join(root, '.journal');
    const first = path.join(root, 'first.txt');
    const second = path.join(root, 'second.txt');
    await Promise.all([writeFile(first, 'old-first'), writeFile(second, 'old-second')]);

    await writeFilesAtomically(
      [
        { path: first, content: 'new-first', encoding: 'utf8' },
        { path: second, content: 'new-second', encoding: 'utf8' },
      ],
      { journalDirectory },
    );

    await expect(readFile(first, 'utf8')).resolves.toBe('new-first');
    await expect(readFile(second, 'utf8')).resolves.toBe('new-second');
    await expect(readdir(journalDirectory)).resolves.toEqual([]);
  });

  it('restores every original file when a replacement fails midway', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-atomic-rollback-'));
    const journalDirectory = path.join(root, '.journal');
    const first = path.join(root, 'first.txt');
    const second = path.join(root, 'second.txt');
    await Promise.all([writeFile(first, 'old-first'), writeFile(second, 'old-second')]);

    await expect(
      writeFilesAtomically(
        [
          { path: first, content: 'new-first', encoding: 'utf8' },
          { path: second, content: 'new-second', encoding: 'utf8' },
        ],
        { journalDirectory, failAfterReplacements: 1 },
      ),
    ).rejects.toThrow(/Injected atomic file transaction failure/);

    await expect(readFile(first, 'utf8')).resolves.toBe('old-first');
    await expect(readFile(second, 'utf8')).resolves.toBe('old-second');
    await expect(readdir(journalDirectory)).resolves.toEqual([]);
  });

  it('recovers a prepared transaction left by an interrupted process', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-atomic-recovery-'));
    const journalDirectory = path.join(root, '.journal');
    const targetPath = path.join(root, 'state.json');
    const backupPath = path.join(root, '.state.json.tx.bak');
    const temporaryPath = path.join(root, '.state.json.tx.tmp');
    await writeFile(targetPath, 'partial-new');
    await writeFile(backupPath, 'original');
    await writeFile(temporaryPath, 'unused-new');
    await mkdir(journalDirectory, { recursive: true });
    await writeFile(
      path.join(journalDirectory, 'tx.json'),
      JSON.stringify({
        version: 1,
        id: 'tx',
        status: 'prepared',
        entries: [{ targetPath, backupPath, temporaryPath, hadOriginal: true }],
      }),
    );

    await recoverAtomicFileTransactions(journalDirectory);

    await expect(readFile(targetPath, 'utf8')).resolves.toBe('original');
    await expect(readdir(journalDirectory)).resolves.toEqual([]);
  });

  it('keeps committed content when cleanup is resumed from a journal', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-atomic-committed-'));
    const journalDirectory = path.join(root, '.journal');
    const targetPath = path.join(root, 'state.json');
    const backupPath = path.join(root, '.state.json.tx.bak');
    const temporaryPath = path.join(root, '.state.json.tx.tmp');
    await writeFile(targetPath, 'committed-new');
    await writeFile(backupPath, 'original');
    await writeFile(temporaryPath, 'unused');
    await mkdir(journalDirectory, { recursive: true });
    await writeFile(
      path.join(journalDirectory, 'tx.json'),
      JSON.stringify({
        version: 1,
        id: 'tx',
        status: 'committed',
        entries: [{ targetPath, backupPath, temporaryPath, hadOriginal: true }],
      }),
    );

    await recoverAtomicFileTransactions(journalDirectory);

    await expect(readFile(targetPath, 'utf8')).resolves.toBe('committed-new');
    await expect(readdir(journalDirectory)).resolves.toEqual([]);
  });

  it('rejects symbolic-link targets', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-atomic-symlink-'));
    const actual = path.join(root, 'actual.txt');
    const link = path.join(root, 'link.txt');
    await writeFile(actual, 'original');
    await symlink(actual, link);

    await expect(
      writeFilesAtomically([{ path: link, content: 'changed', encoding: 'utf8' }], {
        journalDirectory: path.join(root, '.journal'),
      }),
    ).rejects.toThrow(/symbolic links/);
    await expect(readFile(actual, 'utf8')).resolves.toBe('original');
  });
});
