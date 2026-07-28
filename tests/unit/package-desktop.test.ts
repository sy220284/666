import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  archiveInvocation,
  asarHeaderIntegrity,
  packagePlatformForNode,
  parsePackageArguments,
  pnpmInvocation,
  workspaceDeployArguments,
} from '../../scripts/package-desktop.mjs';
import { packagedExecutablePath } from '../../scripts/smoke-packaged-desktop.mjs';

describe('desktop package command', () => {
  it('maps supported Node platforms to release platform names', () => {
    expect(packagePlatformForNode('linux')).toBe('linux');
    expect(packagePlatformForNode('win32')).toBe('windows');
    expect(packagePlatformForNode('darwin')).toBe('macos');
    expect(() => packagePlatformForNode('aix')).toThrow(/Unsupported packaging host/);
  });

  it('uses the package version and repository-contained default output', () => {
    const repositoryRoot = path.resolve('/workspace/worldforge');
    expect(
      parsePackageArguments([], {
        packageVersion: '1.2.3',
        nodePlatform: 'linux',
        repositoryRoot,
      }),
    ).toEqual({
      platform: 'linux',
      hostPlatform: 'linux',
      version: '1.2.3',
      output: path.join(repositoryRoot, 'release', 'linux'),
    });
    expect(
      parsePackageArguments(['--', '--platform', 'linux'], {
        packageVersion: '1.2.3',
        nodePlatform: 'linux',
        repositoryRoot,
      }).platform,
    ).toBe('linux');
  });

  it('rejects cross-platform requests, version drift and unsafe outputs', () => {
    const repositoryRoot = path.resolve('/workspace/worldforge');
    expect(() =>
      parsePackageArguments(['--platform', 'windows'], {
        packageVersion: '1.2.3',
        nodePlatform: 'linux',
        repositoryRoot,
      }),
    ).toThrow(/Cross-platform packaging is forbidden/);
    expect(() =>
      parsePackageArguments(['--version', '1.2.4'], {
        packageVersion: '1.2.3',
        nodePlatform: 'linux',
        repositoryRoot,
      }),
    ).toThrow(/does not match package.json version/);
    expect(() =>
      parsePackageArguments(['--output', '../outside'], {
        packageVersion: '1.2.3',
        nodePlatform: 'linux',
        repositoryRoot,
      }),
    ).toThrow(/inside the repository/);
  });

  it('rejects unknown and missing options', () => {
    expect(() =>
      parsePackageArguments(['--unexpected'], {
        packageVersion: '1.2.3',
        nodePlatform: 'linux',
        repositoryRoot: '/workspace/worldforge',
      }),
    ).toThrow(/Unknown package option/);
    expect(() =>
      parsePackageArguments(['--output'], {
        packageVersion: '1.2.3',
        nodePlatform: 'linux',
        repositoryRoot: '/workspace/worldforge',
      }),
    ).toThrow(/requires a value/);
  });

  it('derives the Electron ASAR header hash deterministically', () => {
    expect(asarHeaderIntegrity('header')).toEqual({
      algorithm: 'SHA256',
      hash: '1e0584a25d9f43bf5cbd0aec01eb1af2220ed085b4e7f1837b0d89958cae353a',
    });
  });

  it('uses a relative Windows archive target so tar does not treat the drive as remote', () => {
    expect(
      archiveInvocation({
        platform: 'windows',
        stagingDirectory: String.raw`C:\temp\stage`,
        bundleName: 'WorldForge-v1.2.3-windows-x64',
        artifactPath: String.raw`D:\a\release\WorldForge-v1.2.3-windows-x64.zip`,
      }),
    ).toEqual({
      command: 'tar.exe',
      arguments: [
        '-a',
        '-c',
        '-f',
        'WorldForge-v1.2.3-windows-x64.zip',
        '-C',
        String.raw`C:\temp\stage`,
        'WorldForge-v1.2.3-windows-x64',
      ],
      cwd: String.raw`D:\a\release`,
    });
  });

  it('invokes the pnpm JavaScript entrypoint directly on every host', () => {
    expect(
      pnpmInvocation(['--filter', '@worldforge/main', 'deploy'], {
        environment: { npm_execpath: '/tools/pnpm.cjs' },
        nodeExecutable: '/tools/node',
        nodePlatform: 'win32',
      }),
    ).toEqual({
      command: '/tools/node',
      arguments: ['/tools/pnpm.cjs', '--filter', '@worldforge/main', 'deploy'],
    });
    expect(() =>
      pnpmInvocation([], {
        environment: {},
        nodeExecutable: 'node.exe',
        nodePlatform: 'win32',
      }),
    ).toThrow(/PNPM_CLI_PATH_REQUIRED_ON_WINDOWS/);
  });

  it('deploys production workspaces as hoisted copies that ASAR can resolve', () => {
    expect(workspaceDeployArguments('@worldforge/main', '/tmp/main')).toEqual([
      '--filter',
      '@worldforge/main',
      'deploy',
      '--prod',
      '--config.inject-workspace-packages=true',
      '--config.node-linker=hoisted',
      '/tmp/main',
    ]);
  });

  it('locates each packaged executable without relying on Playwright internals', () => {
    expect(
      packagedExecutablePath('/unpacked', {
        version: '1.2.3',
        platform: 'linux',
        architecture: 'x64',
      }),
    ).toBe(path.join('/unpacked', 'WorldForge-v1.2.3-linux-x64', 'worldforge'));
    expect(
      packagedExecutablePath('/unpacked', {
        version: '1.2.3',
        platform: 'windows',
        architecture: 'x64',
      }),
    ).toBe(path.join('/unpacked', 'WorldForge-v1.2.3-windows-x64', 'WorldForge.exe'));
    expect(
      packagedExecutablePath('/unpacked', {
        version: '1.2.3',
        platform: 'macos',
        architecture: 'arm64',
      }),
    ).toBe(path.join('/unpacked', 'WorldForge.app', 'Contents', 'MacOS', 'WorldForge'));
  });
});
