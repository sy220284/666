import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  asarHeaderIntegrity,
  packagePlatformForNode,
  parsePackageArguments,
} from '../../scripts/package-desktop.mjs';

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
});
