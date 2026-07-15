import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  collectReleaseAssets,
  evaluateReleaseGate,
  parseReleaseVersion,
  renderChecksums,
  validateReleaseConfiguration,
} from '../../scripts/release-tool.mjs';

const temporaryDirectories: string[] = [];
const taskIndex = (status: string) =>
  '\n| ID | 任务卡 | 依赖 | 状态 |\n' +
  '|---|---|---|---|\n' +
  '| M8-03 | [发布](M8/M8-03_CROSS_PLATFORM_RELEASE_ACCEPTANCE.md) | M8-01、M8-02 | ' +
  status +
  ' |\n';

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('release tool', () => {
  it('accepts strict SemVer and rejects tag syntax or leading zeroes', () => {
    expect(parseReleaseVersion('1.2.3')).toBe('1.2.3');
    expect(parseReleaseVersion('1.2.3-rc.1+build.5')).toBe('1.2.3-rc.1+build.5');
    expect(() => parseReleaseVersion('v1.2.3')).toThrow(/without a leading v/);
    expect(() => parseReleaseVersion('1.2.3-rc.01')).toThrow(/leading zeroes/);
  });

  it('validates the release workflow and package scripts', () => {
    expect(
      validateReleaseConfiguration({
        packageJson: {
          version: '1.0.0',
          scripts: {
            'release:check': 'node scripts/release-tool.mjs check',
            'release:gate': 'node scripts/release-tool.mjs gate',
            'release:checksums': 'node scripts/release-tool.mjs checksums',
          },
        },
        taskIndexMarkdown: taskIndex('Planned'),
        workflowSource: 'workflow_dispatch:\npnpm release:gate\ngh release create',
      }),
    ).toEqual([]);
  });

  it('blocks publishing until version, branch and M8-03 all match', () => {
    expect(
      evaluateReleaseGate({
        taskIndexMarkdown: taskIndex('Planned'),
        packageVersion: '1.0.0',
        requestedVersion: '1.0.1',
        refName: 'feature',
      }).errors,
    ).toEqual([
      'Requested version 1.0.1 does not match package.json version 1.0.0',
      'Releases may only run from main, found feature',
      'M8-03 must be Verified before publishing, found Planned',
    ]);

    expect(
      evaluateReleaseGate({
        taskIndexMarkdown: taskIndex('Verified'),
        packageVersion: '1.0.0',
        requestedVersion: '1.0.0',
        refName: 'main',
      }).errors,
    ).toEqual([]);
  });

  it('creates deterministic SHA-256 entries for nested assets', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'worldforge-release-'));
    temporaryDirectories.push(directory);
    await mkdir(path.join(directory, 'linux'));
    await writeFile(path.join(directory, 'linux', 'worldforge.AppImage'), 'alpha', 'utf8');

    const assets = await collectReleaseAssets(directory);
    expect(assets).toEqual([
      {
        path: 'linux/worldforge.AppImage',
        bytes: 5,
        sha256: '8ed3f6ad685b959ead7022518e1af76cd816f8e8ec7ccdda1ed4018e8f2223f8',
      },
    ]);
    expect(renderChecksums(assets)).toBe(
      '8ed3f6ad685b959ead7022518e1af76cd816f8e8ec7ccdda1ed4018e8f2223f8  linux/worldforge.AppImage\n',
    );
  });
});
