import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  prepareReleasePublicationAssets,
  renderChecksums,
} from '../../scripts/release-tool.mjs';

const temporaryDirectories: string[] = [];

async function createPublicationFixture(artifactName?: string) {
  const directory = await mkdtemp(path.join(tmpdir(), 'worldforge-release-publication-'));
  temporaryDirectories.push(directory);
  for (const platform of ['linux', 'windows', 'macos'] as const) {
    const packageDirectory = path.join(directory, platform);
    await mkdir(packageDirectory);
    const archive = artifactName ?? `WorldForge-v1.0.1-${platform}-x64.zip`;
    const content = Buffer.from(`artifact-${platform}`);
    await writeFile(path.join(packageDirectory, archive), content);
    await writeFile(
      path.join(packageDirectory, 'package-manifest.json'),
      `${JSON.stringify(
        {
          version: '1.0.1',
          platform,
          architecture: 'x64',
          artifact: archive,
          bytes: content.byteLength,
          sha256: createHash('sha256').update(content).digest('hex'),
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
  }
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('release publication assets', () => {
  it('renames platform manifests and renders checksums using public GitHub asset names', async () => {
    const directory = await createPublicationFixture();

    const assets = await prepareReleasePublicationAssets(directory, '1.0.1');
    const names = assets.map((asset) => asset.path);

    expect(names).toEqual([
      'WorldForge-v1.0.1-linux-x64-manifest.json',
      'WorldForge-v1.0.1-linux-x64.zip',
      'WorldForge-v1.0.1-macos-x64-manifest.json',
      'WorldForge-v1.0.1-macos-x64.zip',
      'WorldForge-v1.0.1-windows-x64-manifest.json',
      'WorldForge-v1.0.1-windows-x64.zip',
    ]);
    expect(new Set(names).size).toBe(names.length);
    expect(renderChecksums(assets)).not.toContain('linux/');
    expect(renderChecksums(assets)).not.toContain('windows/');
    expect(renderChecksums(assets)).not.toContain('macos/');

    for (const platform of ['linux', 'windows', 'macos'] as const) {
      const files = await readdir(path.join(directory, platform));
      expect(files).not.toContain('package-manifest.json');
      expect(files).toContain(`WorldForge-v1.0.1-${platform}-x64-manifest.json`);
      const manifest = JSON.parse(
        await readFile(
          path.join(directory, platform, `WorldForge-v1.0.1-${platform}-x64-manifest.json`),
          'utf8',
        ),
      );
      expect(manifest.platform).toBe(platform);
    }
  });

  it('rejects duplicate public asset basenames before mutating manifests', async () => {
    const directory = await createPublicationFixture('WorldForge-v1.0.1-shared.zip');

    await expect(prepareReleasePublicationAssets(directory, '1.0.1')).rejects.toThrow(
      /publication asset names must be unique/,
    );

    for (const platform of ['linux', 'windows', 'macos'] as const) {
      const files = await readdir(path.join(directory, platform));
      expect(files).toContain('package-manifest.json');
    }
  });
});
