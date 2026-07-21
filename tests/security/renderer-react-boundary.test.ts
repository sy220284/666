import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const rendererSource = path.join(process.cwd(), 'apps/desktop/renderer/src');
const protectedDirectories = ['app', 'components', 'features', 'state'] as const;

async function sourceFiles(directory: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(target)));
    else if (/\.tsx?$/u.test(entry.name)) files.push(target);
  }
  return files;
}

describe('M3-07 protected React source boundary', () => {
  it('forbids Preload globals, business DOM injection and persistence in protected directories', async () => {
    const violations: string[] = [];
    const forbidden = [
      /\bwindow\s*\.\s*worldforge\b/u,
      /\bdocument\s*\.\s*querySelector\b/u,
      /\.\s*innerHTML\b/u,
      /\blocalStorage\b/u,
      /\bindexedDB\b/u,
      /\bpersist\s*\(/u,
    ];

    for (const directory of protectedDirectories) {
      for (const file of await sourceFiles(path.join(rendererSource, directory))) {
        const source = await readFile(file, 'utf8');
        for (const pattern of forbidden) {
          if (pattern.test(source)) {
            violations.push(`${path.relative(rendererSource, file)}:${pattern.source}`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('keeps authoritative contract types out of the temporary state layer', async () => {
    const forbiddenTypes = [
      'ProjectWorkspaceSummary',
      'DraftDocument',
      'CandidateDocument',
      'VersionDocument',
      'EntityCatalog',
      'EntityState',
      'TaskSnapshot',
    ];
    const violations: string[] = [];

    for (const file of await sourceFiles(path.join(rendererSource, 'state'))) {
      const source = await readFile(file, 'utf8');
      for (const typeName of forbiddenTypes) {
        if (new RegExp(`\\b${typeName}\\b`, 'u').test(source)) {
          violations.push(`${path.relative(rendererSource, file)}:${typeName}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
