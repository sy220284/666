import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  collectReleaseAssets,
  evaluateReleaseGate,
  parseReleaseVersion,
  renderChecksums,
  validateReleaseConfiguration,
  verifyReleaseAssetSet,
} from '../../scripts/release-tool.mjs';

const temporaryDirectories: string[] = [];

const successStatuses = [{ context: 'main-verification', state: 'success' }];

const releaseWorkflow = [
  'workflow_dispatch:',
  'fetch-depth: 0',
  'package_smoke: false',
  'pnpm audit --audit-level=high',
  'node scripts/scan-secrets.mjs',
  'main-verification',
  '--distribution-trust',
  'verify-package-assets.mjs',
  'MACOS_CERTIFICATE_BASE64',
  'WINDOWS_CERTIFICATE_BASE64',
  'gh release create',
].join('\n');

const packageJson = {
  version: '1.0.0',
  scripts: {
    package: 'node scripts/package-desktop.mjs',
    'package:foundation': 'node scripts/package-foundation.mjs',
    'release:check': 'node scripts/release-tool.mjs check',
    'release:gate': 'node scripts/release-tool.mjs gate',
    'release:checksums': 'node scripts/release-tool.mjs checksums',
  },
};

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

  it('validates the release workflow and package scripts without Task Runtime authority', () => {
    expect(
      validateReleaseConfiguration({
        packageJson,
        workflowSource: releaseWorkflow,
      }),
    ).toEqual([]);
    expect(
      validateReleaseConfiguration({
        packageJson,
        workflowSource: releaseWorkflow + '\nnode .github/governance/single-work-release-gate.mjs',
      }),
    ).toContain('Release workflow must not use Task Runtime as a release authority');
  });

  it('blocks publishing when the current commit lacks main verification', () => {
    const result = evaluateReleaseGate({
      statuses: [],
      packageVersion: '1.0.0',
      requestedVersion: '1.0.0',
      refName: 'main',
    });

    expect(result.errors).toContain('Current release commit must have main-verification=success');
  });

  it('blocks version drift, non-main publication, and unsigned stable policy', () => {
    const result = evaluateReleaseGate({
      statuses: successStatuses,
      packageVersion: '1.0.0',
      requestedVersion: '1.0.1',
      refName: 'feature',
      releaseKind: 'stable',
      distributionTrust: 'allow-unsigned',
    });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        'Requested version 1.0.1 does not match package.json version 1.0.0',
        'Releases may only run from main, found feature',
        'Stable releases must require platform distribution trust',
      ]),
    );
  });

  it('allows publishing from main solely from engineering and release acceptance authority', () => {
    const result = evaluateReleaseGate({
      statuses: successStatuses,
      packageVersion: '1.0.0',
      requestedVersion: '1.0.0',
      refName: 'main',
      releaseKind: 'stable',
      distributionTrust: 'required',
    });

    expect(result).toMatchObject({
      version: '1.0.0',
      releaseKind: 'stable',
      distributionTrust: 'required',
      errors: [],
    });
  });

  it('requires one verified package manifest per platform before publication', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'worldforge-release-trust-'));
    temporaryDirectories.push(directory);
    const content = Buffer.from('artifact');
    const sha256 = createHash('sha256').update(content).digest('hex');
    for (const platform of ['linux', 'windows', 'macos'] as const) {
      const packageDirectory = path.join(directory, platform);
      await mkdir(packageDirectory);
      const artifact = `WorldForge-${platform}.zip`;
      await writeFile(path.join(packageDirectory, artifact), content);
      const evidence =
        platform === 'windows'
          ? {
              signing: 'authenticode-sha256',
              signatureVerification: 'Get-AuthenticodeSignature:Valid',
              timestamped: true,
            }
          : platform === 'macos'
            ? {
                signing: 'developer-id-application',
                hardenedRuntime: true,
                signatureVerification: 'codesign:strict',
                notarizationVerification: 'stapler:validated',
                gatekeeperAssessment: 'spctl:accepted',
              }
            : null;
      await writeFile(
        path.join(packageDirectory, 'package-manifest.json'),
        JSON.stringify({
          schemaVersion: 2,
          product: 'WorldForge',
          version: '1.0.0',
          platform,
          releaseKind: 'stable',
          distributionTrustMode: 'required',
          architecture: 'x64',
          artifact,
          bytes: content.byteLength,
          sha256,
          packageKind: 'portable-electron-bundle',
          signed: platform !== 'linux',
          notarized: platform === 'macos',
          stapled: platform === 'macos',
          distributionTrustEvidence: evidence,
          fusesApplied: true,
          asar: true,
          appAsarSha256: 'a'.repeat(64),
          appAsarHeaderSha256: 'b'.repeat(64),
          fuses: {
            runAsNode: false,
            onlyLoadAppFromAsar: true,
            embeddedAsarIntegrityValidation: true,
            grantFileProtocolExtraPrivileges: false,
            loadBrowserProcessSpecificV8Snapshot: false,
          },
          ...(platform === 'linux'
            ? {
                portableLauncher: {
                  launcher: 'worldforge',
                  runtimeBinary: 'worldforge-bin',
                  sandbox: 'user-namespace',
                },
              }
            : {}),
        }),
      );
    }

    await expect(
      verifyReleaseAssetSet({
        assetDirectory: directory,
        version: '1.0.0',
        releaseKind: 'stable',
        distributionTrust: 'required',
      }),
    ).resolves.toHaveLength(3);

    const windowsManifestPath = path.join(directory, 'windows', 'package-manifest.json');
    const windowsManifest = JSON.parse(await readFile(windowsManifestPath, 'utf8'));
    await writeFile(
      windowsManifestPath,
      JSON.stringify({ ...windowsManifest, signed: false, distributionTrustEvidence: null }),
    );
    await expect(
      verifyReleaseAssetSet({
        assetDirectory: directory,
        version: '1.0.0',
        releaseKind: 'stable',
        distributionTrust: 'required',
      }),
    ).rejects.toThrow(/Authenticode/);
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
