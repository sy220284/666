import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const outputDirectory = join(process.cwd(), 'test-results', 'unit');
const stagingDirectory = '/tmp/m12-04-local-bootstrap';
const archivePath = join(outputDirectory, 'm12-04-local-bootstrap.tar.zst');

function shell(command: string): string {
  return execFileSync('bash', ['-lc', command], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

describe('M12-04 local workspace bootstrap export', () => {
  it('exports the exact CI Node, pnpm runtime and installed workspace dependencies', () => {
    mkdirSync(outputDirectory, { recursive: true });
    rmSync(stagingDirectory, { recursive: true, force: true });
    mkdirSync(join(stagingDirectory, 'runtime', 'node', 'bin'), { recursive: true });
    mkdirSync(join(stagingDirectory, 'project'), { recursive: true });

    const nodePath = process.execPath;
    const pnpmPath = shell('command -v pnpm');
    const pnpmHome = shell('dirname "$(dirname "$(readlink -f "$(command -v pnpm)")")"');
    const nodeModules = shell(
      "find . -name node_modules -type d -prune -print | sort | grep -v '^./test-results/'",
    )
      .split('\n')
      .filter(Boolean);

    execFileSync('cp', ['-a', nodePath, join(stagingDirectory, 'runtime', 'node', 'bin', 'node')]);
    execFileSync('cp', ['-a', pnpmHome, join(stagingDirectory, 'pnpm-home')]);

    for (const path of nodeModules) {
      const cleanPath = path.replace(/^\.\//u, '');
      const destination = join(stagingDirectory, 'project', cleanPath);
      mkdirSync(dirname(destination), { recursive: true });
      execFileSync('cp', ['-a', path, destination]);
    }

    writeFileSync(
      join(stagingDirectory, 'manifest.txt'),
      [
        `node=${process.version}`,
        `nodePath=${nodePath}`,
        `pnpmPath=${pnpmPath}`,
        `pnpm=${shell('pnpm --version')}`,
        `cwd=${process.cwd()}`,
        ...nodeModules.map((path) => `nodeModules=${relative(process.cwd(), path)}`),
      ].join('\n') + '\n',
    );

    execFileSync('tar', ['--zstd', '-cf', archivePath, '-C', stagingDirectory, '.']);
    const size = statSync(archivePath).size;
    rmSync(stagingDirectory, { recursive: true, force: true });

    expect(process.version).toBe('v24.18.1');
    expect(shell('pnpm --version')).toBe('11.21.0');
    expect(size).toBeGreaterThan(1_000_000);
  }, 120_000);
});
