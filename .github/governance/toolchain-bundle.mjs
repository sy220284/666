/* global console, process */
// PR Policy smoke marker: export the repository-locked formatter and quality toolchains.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const authorityRelativePath = 'docs/process/CURRENT_WORKSPACE_TOOLCHAIN.json';
const authorityPath = path.join(root, authorityRelativePath);

function repositoryPath(relativePath) {
  if (typeof relativePath !== 'string' || path.isAbsolute(relativePath)) {
    throw new Error(`Invalid repository path in toolchain authority: ${String(relativePath)}`);
  }
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Toolchain authority path escapes repository: ${relativePath}`);
  }
  return resolved;
}

async function readAuthority() {
  const authority = JSON.parse(await readFile(authorityPath, 'utf8'));
  if (authority.schemaVersion !== 1) throw new Error('Unsupported toolchain authority schema');
  for (const field of [
    'authorityDocument',
    'callerWorkflow',
    'exportWorkflow',
    'generator',
    'defaultProfile',
    'trustedPullRequestBranch',
    'bundledPnpmVersion',
    'nodeRuntimeVersion',
  ]) {
    if (typeof authority[field] !== 'string' || !authority[field]) {
      throw new Error(`Missing toolchain authority field: ${field}`);
    }
  }
  if (!authority.profiles || typeof authority.profiles !== 'object') {
    throw new Error('Toolchain authority profiles are missing');
  }
  if (!authority.profiles[authority.defaultProfile]) {
    throw new Error('Toolchain authority default profile is not declared');
  }
  if (!Array.isArray(authority.requiredBundleEntries)) {
    throw new Error('Toolchain authority required bundle entries are missing');
  }
  return authority;
}

const authority = await readAuthority();
const profilePackages = Object.fromEntries(
  Object.entries(authority.profiles).map(([profile, definition]) => [
    profile,
    definition.packages,
  ]),
);
const profileCommands = Object.fromEntries(
  Object.entries(authority.profiles).map(([profile, definition]) => [
    profile,
    definition.commands,
  ]),
);
const bundledPnpmVersion = authority.bundledPnpmVersion;

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

async function validateAuthority() {
  const [document, callerWorkflow, exportWorkflow] = await Promise.all([
    readFile(repositoryPath(authority.authorityDocument), 'utf8'),
    readFile(repositoryPath(authority.callerWorkflow), 'utf8'),
    readFile(repositoryPath(authority.exportWorkflow), 'utf8'),
  ]);
  repositoryPath(authority.generator);

  for (const expected of [
    authorityRelativePath,
    authority.callerWorkflow,
    authority.exportWorkflow,
    authority.generator,
  ]) {
    if (!document.includes(expected)) {
      throw new Error(`Toolchain authority document does not reference ${expected}`);
    }
  }
  for (const expected of [
    authorityRelativePath,
    authority.generator,
    'workflow_call:',
    'workflow_dispatch:',
    'validate-authority',
    'include-hidden-files: true',
  ]) {
    if (!exportWorkflow.includes(expected)) {
      throw new Error(`Toolchain export workflow does not reference ${expected}`);
    }
  }
  for (const expected of [
    `uses: ./${authority.exportWorkflow}`,
    'toolchain_export',
    `github.event.pull_request.head.ref == '${authority.trustedPullRequestBranch}'`,
  ]) {
    if (!callerWorkflow.includes(expected)) {
      throw new Error(`Toolchain caller workflow does not reference ${expected}`);
    }
  }
  for (const [profile, definition] of Object.entries(authority.profiles)) {
    if (!Array.isArray(definition.packages) || !Array.isArray(definition.commands)) {
      throw new Error(`Toolchain profile is incomplete: ${profile}`);
    }
  }
  for (const required of [
    'store',
    'cache',
    'node_modules',
    'node_modules/.bin',
    'node_modules/.pnpm',
    'manifest.json',
    'toolchain-authority.json',
    'SHA256SUMS.txt',
  ]) {
    if (!authority.requiredBundleEntries.includes(required)) {
      throw new Error(`Toolchain authority is missing required bundle entry: ${required}`);
    }
  }
  console.log(`Toolchain authority verified at ${authorityRelativePath}.`);
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
  const authorityContent = await readFile(authorityPath);
  await writeFile(path.join(output, 'toolchain-authority.json'), authorityContent);
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
    toolchainAuthority: {
      schemaVersion: authority.schemaVersion,
      manifestPath: authorityRelativePath,
      manifestSha256: sha256(authorityContent),
      authorityDocument: authority.authorityDocument,
      callerWorkflow: authority.callerWorkflow,
      exportWorkflow: authority.exportWorkflow,
      generator: authority.generator,
      nodeRuntimeVersion: authority.nodeRuntimeVersion,
    },
    generatedAt: new Date().toISOString(),
  };
  await writeFile(path.join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const files = [
    'package.json',
    'pnpm-lock.yaml',
    'manifest.json',
    'toolchain-authority.json',
  ];
  const sums = [];
  for (const file of files) sums.push(`${await fileHash(path.join(output, file))}  ${file}`);
  await writeFile(path.join(output, 'SHA256SUMS.txt'), `${sums.join('\n')}\n`);
}

async function verify(profile, output) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'worldforge-toolchain-'));
  const storeDir = path.join(output, 'store');
  const cacheDir = path.join(output, 'cache');
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
        storeDir,
        '--cache-dir',
        cacheDir,
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

async function exportBundle() {
  await validateAuthority();
  const profile = option('profile', authority.defaultProfile);
  const output = path.resolve(
    option('output', process.env.TOOLCHAIN_OUTPUT ?? path.join(root, 'toolchain-bundle')),
  );
  const sourceSha = option('source-sha', process.env.GITHUB_SHA ?? '');
  const storeDir = path.join(output, 'store');
  const cacheDir = path.join(output, 'cache');
  const { packages } = await prepare(profile, output, sourceSha);
  run(
    'pnpm',
    [
      'install',
      '--ignore-scripts',
      '--store-dir',
      storeDir,
      '--cache-dir',
      cacheDir,
    ],
    output,
  );
  run('pnpm', ['fetch', '--store-dir', storeDir, '--cache-dir', cacheDir], output);
  await rm(path.join(output, 'node_modules'), { recursive: true, force: true });
  run(
    'pnpm',
    [
      'install',
      '--offline',
      '--frozen-lockfile',
      '--ignore-scripts',
      '--store-dir',
      storeDir,
      '--cache-dir',
      cacheDir,
    ],
    output,
  );
  await finalize(profile, output, sourceSha, packages);
  await verify(profile, output);
  for (const required of authority.requiredBundleEntries) {
    await access(path.join(output, required));
  }
  console.log(`Toolchain bundle verified at ${output}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const command = process.argv[2] ?? 'export';
  if (command === 'export') await exportBundle();
  else if (command === 'validate-authority') await validateAuthority();
  else throw new Error(`Unknown toolchain-bundle command: ${command}`);
}
