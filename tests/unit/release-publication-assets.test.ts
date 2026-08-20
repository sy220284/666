import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  prepareReleasePublicationAssets as prepareAssets,
  renderChecksums,
} from '../../scripts/release-tool.mjs';

const temporaryDirectories: string[] = [];
const version = '1.0.1';

function archiveName(platform: string) {
  return `WorldForge-v${version}-${platform}-x64.zip`;
}

function manifestName(platform: string) {
  return `WorldForge-v${version}-${platform}-x64-manifest.json`;
}

async function createPublicationFixture(sharedArchive?: string) {
  const directory = await mkdtemp(path.join(tmpdir(), 'worldforge-release-publication-'));
  temporaryDirectories.push(directory);

  for (const platform of ['linux', 'windows', 'macos'] as const) {
    const packageDirectory = path.join(directory, platform);
    await mkdir(packageDirectory);

    const archive = sharedArchive ?? archiveName(platform);
    const content = Buffer.from(`artifact-${platform}`);
    await writeFile(path.join(packageDirectory, archive), content);

    const manifest = {
      version,
      platform,
      architecture: 'x64',
      artifact: archive,
      bytes: content.byteLength,
      sha256: createHash('sha256').update(content).digest('hex'),
    };
    const manifestSource = `${JSON.stringify(manifest, null, 2)}\n`;
    await writeFile(path.join(packageDirectory, 'package-manifest.json'), manifestSource, 'utf8');
  }

  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('release publication assets', () => {
  it('publishes unique manifest names and public checksums', async () => {
    const directory = await createPublicationFixture();
    const assets = await prepareAssets(directory, version);
    const names = assets.map((asset) => asset.path);

    expect(names).toEqual([
      manifestName('linux'),
      archiveName('linux'),
      manifestName('macos'),
      archiveName('macos'),
      manifestName('windows'),
      archiveName('windows'),
    ]);
    expect(new Set(names).size).toBe(names.length);

    const checksums = renderChecksums(assets);
    expect(checksums).not.toContain('linux/');
    expect(checksums).not.toContain('windows/');
    expect(checksums).not.toContain('macos/');

    for (const platform of ['linux', 'windows', 'macos'] as const) {
      const packageDirectory = path.join(directory, platform);
      const files = await readdir(packageDirectory);
      expect(files).not.toContain('package-manifest.json');
      expect(files).toContain(manifestName(platform));

      const manifestPath = path.join(packageDirectory, manifestName(platform));
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      expect(manifest.platform).toBe(platform);
    }
  });

  it('rejects duplicate public asset names before mutating manifests', async () => {
    const sharedArchive = `WorldForge-v${version}-shared.zip`;
    const directory = await createPublicationFixture(sharedArchive);

    await expect(prepareAssets(directory, version)).rejects.toThrow(
      /publication asset names must be unique/,
    );

    for (const platform of ['linux', 'windows', 'macos'] as const) {
      const files = await readdir(path.join(directory, platform));
      expect(files).toContain('package-manifest.json');
    }
  });
});
