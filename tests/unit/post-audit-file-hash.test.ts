import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { sha256File } from '../../packages/core-service/src/file-hash.js';
import { defaultHashWorkspace } from '../../packages/core-service/src/project-workspace/project-move.js';

const temporaryDirectories = new Set<string>();

afterEach(async () => {
  await Promise.all(
    [...temporaryDirectories].map((directory) => rm(directory, { recursive: true, force: true })),
  );
  temporaryDirectories.clear();
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'worldforge-file-hash-'));
  temporaryDirectories.add(directory);
  return directory;
}

async function legacyWorkspaceHash(directory: string): Promise<string> {
  const hash = createHash('sha256');
  const visit = async (current: string, relativeDirectory: string): Promise<void> => {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) {
        hash.update(`directory\0${relativePath}\0`, 'utf8');
        await visit(entryPath, relativePath);
      } else if (entry.isFile()) {
        hash.update(`file\0${relativePath}\0`, 'utf8');
        hash.update(await readFile(entryPath));
        hash.update('\0', 'utf8');
      }
    }
  };
  await visit(directory, '');
  return hash.digest('hex');
}

describe('post-audit streaming file hashing', () => {
  it('matches SHA-256 for a file larger than a single stream chunk', async () => {
    const directory = await temporaryDirectory();
    const filePath = path.join(directory, 'large.bin');
    const payload = Buffer.alloc(3 * 1024 * 1024 + 17, 0x61);
    await writeFile(filePath, payload);

    const expected = createHash('sha256').update(payload).digest('hex');
    await expect(sha256File(filePath)).resolves.toBe(expected);
  });

  it('preserves the existing project workspace fingerprint byte-for-byte', async () => {
    const directory = await temporaryDirectory();
    const nested = path.join(directory, '章节');
    await mkdir(nested);
    await writeFile(path.join(directory, 'project.sqlite'), Buffer.from([0, 1, 2, 3, 4]));
    await writeFile(path.join(nested, '正文.txt'), '第一章\n第二段\n', 'utf8');

    await expect(defaultHashWorkspace(directory)).resolves.toBe(await legacyWorkspaceHash(directory));
  });
});
