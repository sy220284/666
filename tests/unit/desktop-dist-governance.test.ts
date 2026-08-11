import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  desktopDistRuntimePolicy,
  pruneDesktopDist,
} from '../../scripts/prune-desktop-dist.mjs';

const roots: string[] = [];

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-dist-'));
  roots.push(root);
  return root;
}

async function put(root: string, relative: string, content = relative): Promise<void> {
  const file = path.join(root, ...relative.split('/'));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content, 'utf8');
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('desktop dist governance', () => {
  it('declares only the actual renderer and preload runtime JavaScript entries', () => {
    expect(desktopDistRuntimePolicy()).toEqual([
      {
        directory: 'apps/desktop/preload/dist',
        allowedRuntimeFiles: ['index.cjs'],
      },
      {
        directory: 'apps/desktop/renderer/dist',
        allowedRuntimeFiles: ['index.js'],
      },
    ]);
  });

  it('removes TSC shadow JavaScript while preserving runtime entries and declarations', async () => {
    const root = await fixtureRoot();
    await Promise.all([
      put(root, 'apps/desktop/preload/dist/index.cjs', 'runtime-preload'),
      put(root, 'apps/desktop/preload/dist/index.js', 'shadow-preload'),
      put(root, 'apps/desktop/preload/dist/index.js.map', 'shadow-map'),
      put(root, 'apps/desktop/preload/dist/index.d.ts', 'types'),
      put(root, 'apps/desktop/preload/dist/nested/bridge.js', 'shadow-bridge'),
      put(root, 'apps/desktop/renderer/dist/index.js', 'runtime-renderer'),
      put(root, 'apps/desktop/renderer/dist/react-entry.js', 'shadow-renderer'),
      put(root, 'apps/desktop/renderer/dist/react-entry.js.map', 'shadow-renderer-map'),
      put(root, 'apps/desktop/renderer/dist/index.d.ts', 'renderer-types'),
      put(root, 'apps/desktop/renderer/dist/styles/base.css', 'body{}'),
    ]);

    expect(await pruneDesktopDist(root)).toEqual([
      'apps/desktop/preload/dist/index.js',
      'apps/desktop/preload/dist/index.js.map',
      'apps/desktop/preload/dist/nested/bridge.js',
      'apps/desktop/renderer/dist/react-entry.js',
      'apps/desktop/renderer/dist/react-entry.js.map',
    ]);

    await expect(
      readFile(path.join(root, 'apps/desktop/preload/dist/index.cjs'), 'utf8'),
    ).resolves.toBe('runtime-preload');
    await expect(
      readFile(path.join(root, 'apps/desktop/preload/dist/index.d.ts'), 'utf8'),
    ).resolves.toBe('types');
    await expect(
      readFile(path.join(root, 'apps/desktop/renderer/dist/index.js'), 'utf8'),
    ).resolves.toBe('runtime-renderer');
    await expect(
      readFile(path.join(root, 'apps/desktop/renderer/dist/styles/base.css'), 'utf8'),
    ).resolves.toBe('body{}');
  });
});
