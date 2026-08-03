/* global console, process */
// PR Policy smoke marker: export the repository-locked formatter and quality toolchains.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const profilePackages = {
  formatter: ['prettier'],
  quality: ['@eslint/js', 'eslint', 'prettier', 'typescript', 'typescript-eslint'],
};
const profileCommands = {
  formatter: [
    ['pnpm', ['--version']],
    ['prettier', ['--version']],
  ],
  quality: [
    ['pnpm', ['--version']],
    ['prettier', ['--version']],
    ['eslint', ['--version']],
    ['tsc', ['--version']],
  ],
};
const bundledPnpmVersion = '11.13.1';
const sourceSnapshotFiles = [
  '.github/governance/single-work-taskctl.mjs',
  '.github/governance/toolchain-bundle.mjs',
  'scripts/task-control-lib.mjs',
  'scripts/taskctl.mjs',
  'tests/integration/task-lifecycle.test.ts',
  'tests/unit/branch-inventory-policy.test.ts',
  'tests/unit/main-task-verification.test.ts',
  'tests/unit/task-control.test.ts',
  'tests/unit/taskctl-transaction-policy.test.ts',
];

function option(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function run(command, args, cwd = root) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

async function fileHash(file) {
  return sha256(await readFile(file));
}

async function prepare(profile, output, sourceSha) {
  const rootPackage = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const profileTools = profilePackages[profile];
  if (!profileTools) throw new Error(`Unsupported toolchain profile: ${profile}`);
  if (!/^[0-9a-f]{40}$/iu.test(sourceSha)) {
    throw new Error('source-sha must be a full 40 character commit SHA');
  }
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  const packages = ['pnpm', ...profileTools];
  const devDependencies = Object.fromEntries(
    packages.map((name) => {
      const version = name === 'pnpm' ? bundledPnpmVersion : rootPackage.devDependencies?.[name];
      if (!version || version.startsWith('workspace:')) {
        throw new Error(`Missing tool version: ${name}`);
      }
      return [name, version];
    }),
  );
  const packageJson = {
    name: `worldforge-${profile}-toolchain`,
    private: true,
    type: 'module',
    packageManager: `pnpm@${bundledPnpmVersion}`,
    devDependencies,
  };
  await writeFile(path.join(output, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`);
  return { packages };
}

async function installedPackageVersions(output, packages) {
  const entries = [];
  for (const name of packages) {
    const packageFile = path.join(output, 'node_modules', ...name.split('/'), 'package.json');
    const packageJson = JSON.parse(await readFile(packageFile, 'utf8'));
    entries.push([name, packageJson.version]);
  }
  return Object.fromEntries(entries);
}

async function finalize(profile, output, sourceSha, packages) {
  const lockPath = path.join(output, 'pnpm-lock.yaml');
  const rootLockPath = path.join(root, 'pnpm-lock.yaml');
  const toolVersions = await installedPackageVersions(output, packages);
  const manifest = {
    schemaVersion: 1,
    sourceCommit: sourceSha,
    sourceTree: run('git', ['rev-parse', `${sourceSha}^{tree}`]),
    profile,
    platform: process.platform,
    architecture: process.arch,
    nodeVersion: process.version,
    generatorPnpmVersion: run('pnpm', ['--version']),
    bundledPnpmVersion: toolVersions.pnpm,
    rootLockfileSha256: await fileHash(rootLockPath),
    generatedLockfileSha256: await fileHash(lockPath),
    toolVersions,
    generatedAt: new Date().toISOString(),
  };
  await writeFile(path.join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const files = ['package.json', 'pnpm-lock.yaml', 'manifest.json'];
  const sums = [];
  for (const file of files) sums.push(`${await fileHash(path.join(output, file))}  ${file}`);
  await writeFile(path.join(output, 'SHA256SUMS.txt'), `${sums.join('\n')}\n`);
}

async function verify(profile, output) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'worldforge-toolchain-'));
  try {
    await cp(path.join(output, 'package.json'), path.join(temporary, 'package.json'));
    await cp(path.join(output, 'pnpm-lock.yaml'), path.join(temporary, 'pnpm-lock.yaml'));
    run(
      'pnpm',
      [
        'install',
        '--offline',
        '--frozen-lockfile',
        '--ignore-scripts',
        '--store-dir',
        path.join(output, 'store'),
      ],
      temporary,
    );
    for (const [binary, args] of profileCommands[profile]) {
      run('pnpm', ['exec', binary, ...args], temporary);
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function copySourceSnapshot(output) {
  for (const file of sourceSnapshotFiles) {
    const destination = path.join(output, 'source', file);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(root, file), destination);
  }
}

async function exportBundle() {
  const profile = option('profile', 'formatter');
  const output = path.resolve(
    option('output', process.env.TOOLCHAIN_OUTPUT ?? path.join(root, 'toolchain-bundle')),
  );
  const sourceSha = option('source-sha', process.env.GITHUB_SHA ?? '');
  const { packages } = await prepare(profile, output, sourceSha);
  run('pnpm', ['install', '--lockfile-only', '--ignore-scripts'], output);
  run('pnpm', ['fetch', '--store-dir', path.join(output, 'store')], output);
  run(
    'pnpm',
    [
      'install',
      '--offline',
      '--frozen-lockfile',
      '--ignore-scripts',
      '--store-dir',
      path.join(output, 'store'),
    ],
    output,
  );
  await finalize(profile, output, sourceSha, packages);
  await verify(profile, output);
  await copySourceSnapshot(output);
  const entries = await readdir(output);
  for (const required of ['store', 'node_modules', 'manifest.json', 'SHA256SUMS.txt', 'source']) {
    if (!entries.includes(required)) throw new Error(`Toolchain bundle is missing ${required}`);
  }
  console.log(`Toolchain bundle verified at ${output}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const command = process.argv[2] ?? 'export';
  if (command !== 'export') throw new Error(`Unknown toolchain-bundle command: ${command}`);
  await exportBundle();
}
