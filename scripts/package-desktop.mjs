import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { parseReleaseVersion } from './release-tool.mjs';

const root = process.cwd();
const platformByNode = Object.freeze({
  linux: 'linux',
  win32: 'windows',
  darwin: 'macos',
});
const supportedPlatforms = new Set(Object.values(platformByNode));

function option(argumentsList, name) {
  const inlinePrefix = `${name}=`;
  const inline = argumentsList.find((argument) => argument.startsWith(inlinePrefix));
  if (inline) return inline.slice(inlinePrefix.length);
  const index = argumentsList.indexOf(name);
  if (index < 0) return null;
  const value = argumentsList[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

export function packagePlatformForNode(nodePlatform) {
  const platform = platformByNode[nodePlatform];
  if (!platform) throw new Error(`Unsupported packaging host: ${nodePlatform}`);
  return platform;
}

export function parsePackageArguments(
  argumentsList,
  { packageVersion, nodePlatform = process.platform, repositoryRoot = root } = {},
) {
  const known = new Set(['--platform', '--version', '--output']);
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    const name = argument.includes('=') ? argument.slice(0, argument.indexOf('=')) : argument;
    if (!known.has(name)) throw new Error(`Unknown package option: ${argument}`);
    if (!argument.includes('=')) index += 1;
  }

  const hostPlatform = packagePlatformForNode(nodePlatform);
  const platform = option(argumentsList, '--platform') ?? hostPlatform;
  if (!supportedPlatforms.has(platform)) {
    throw new Error(`Unsupported package platform: ${platform}`);
  }
  if (platform !== hostPlatform) {
    throw new Error(
      `Cross-platform packaging is forbidden: host=${hostPlatform}, requested=${platform}`,
    );
  }

  const version = parseReleaseVersion(option(argumentsList, '--version') ?? packageVersion);
  if (packageVersion && version !== packageVersion) {
    throw new Error(
      `Package version ${version} does not match package.json version ${packageVersion}`,
    );
  }

  const output = path.resolve(
    repositoryRoot,
    option(argumentsList, '--output') ?? path.join('release', platform),
  );
  const relative = path.relative(repositoryRoot, output);
  if (
    relative === '' ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error('Package output must be located inside the repository');
  }
  return { platform, hostPlatform, version, output };
}

function run(command, argumentsList, options = {}) {
  const result = spawnSync(command, argumentsList, {
    cwd: options.cwd ?? root,
    env: options.env ?? process.env,
    encoding: 'utf8',
    stdio: options.stdio ?? 'pipe',
  });
  if (result.error || result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(
      `${command} ${argumentsList.join(' ')} failed with exit ${result.status ?? 'unavailable'}${details ? `\n${details}` : ''}`,
      result.error ? { cause: result.error } : undefined,
    );
  }
}

async function requirePath(filePath, label) {
  try {
    await stat(filePath);
  } catch (error) {
    throw new Error(`${label} is missing: ${path.relative(root, filePath)}`, {
      cause: error,
    });
  }
}

async function deployWorkspace(packageName, target) {
  const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  await mkdir(path.dirname(target), { recursive: true });
  run(pnpmCommand, ['--filter', packageName, 'deploy', '--prod', '--legacy', target]);
}

async function prepareApplication(resourcesPath, version) {
  const appRoot = path.join(resourcesPath, 'app');
  const mainTarget = path.join(appRoot, 'apps', 'desktop', 'main');
  const coreTarget = path.join(appRoot, 'packages', 'core-service');

  await deployWorkspace('@worldforge/main', mainTarget);
  await deployWorkspace('@worldforge/core-service', coreTarget);
  await Promise.all([
    cp(
      path.join(root, 'apps', 'desktop', 'preload', 'dist'),
      path.join(appRoot, 'apps', 'desktop', 'preload', 'dist'),
      { recursive: true },
    ),
    cp(
      path.join(root, 'apps', 'desktop', 'renderer', 'dist'),
      path.join(appRoot, 'apps', 'desktop', 'renderer', 'dist'),
      { recursive: true },
    ),
    cp(path.join(root, 'migrations'), path.join(resourcesPath, 'migrations'), {
      recursive: true,
    }),
  ]);
  await writeFile(
    path.join(appRoot, 'package.json'),
    `${JSON.stringify(
      {
        name: 'worldforge',
        productName: 'WorldForge',
        version,
        private: true,
        type: 'module',
        main: 'apps/desktop/main/dist/electron-main.js',
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

async function copyElectronRuntime(stagingDirectory, platform, version) {
  const electronDist = path.join(root, 'node_modules', 'electron', 'dist');
  await requirePath(electronDist, 'Electron runtime');
  const architecture = process.arch;
  const bundleName = `WorldForge-v${version}-${platform}-${architecture}`;

  if (platform === 'macos') {
    const sourceApp = path.join(electronDist, 'Electron.app');
    const bundlePath = path.join(stagingDirectory, 'WorldForge.app');
    await requirePath(sourceApp, 'Electron macOS application');
    await cp(sourceApp, bundlePath, { recursive: true, verbatimSymlinks: true });
    return {
      architecture,
      bundleName: 'WorldForge.app',
      bundlePath,
      resourcesPath: path.join(bundlePath, 'Contents', 'Resources'),
    };
  }

  const bundlePath = path.join(stagingDirectory, bundleName);
  await cp(electronDist, bundlePath, { recursive: true, verbatimSymlinks: true });
  if (platform === 'windows') {
    await rename(
      path.join(bundlePath, 'electron.exe'),
      path.join(bundlePath, 'WorldForge.exe'),
    );
  } else {
    await rename(path.join(bundlePath, 'electron'), path.join(bundlePath, 'worldforge'));
  }
  return {
    architecture,
    bundleName,
    bundlePath,
    resourcesPath: path.join(bundlePath, 'resources'),
  };
}

function archiveExtension(platform) {
  return platform === 'linux' ? 'tar.gz' : 'zip';
}

function createArchive({ platform, stagingDirectory, bundleName, artifactPath }) {
  if (platform === 'macos') {
    run('ditto', [
      '-c',
      '-k',
      '--sequesterRsrc',
      '--keepParent',
      path.join(stagingDirectory, bundleName),
      artifactPath,
    ]);
    return;
  }
  if (platform === 'windows') {
    run('tar.exe', ['-a', '-c', '-f', artifactPath, '-C', stagingDirectory, bundleName]);
    return;
  }
  run('tar', ['-czf', artifactPath, '-C', stagingDirectory, bundleName]);
}

async function sha256(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

export async function packageDesktop(argumentsList = process.argv.slice(2)) {
  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const options = parsePackageArguments(argumentsList, {
    packageVersion: packageJson.version,
  });
  for (const [filePath, label] of [
    [
      path.join(root, 'apps', 'desktop', 'main', 'dist', 'electron-main.js'),
      'Electron main build',
    ],
    [path.join(root, 'apps', 'desktop', 'preload', 'dist', 'index.cjs'), 'Preload build'],
    [
      path.join(root, 'apps', 'desktop', 'renderer', 'dist', 'index.html'),
      'Renderer build',
    ],
    [
      path.join(root, 'packages', 'core-service', 'dist', 'utility-entry.js'),
      'Core service build',
    ],
  ]) {
    await requirePath(filePath, label);
  }

  await rm(options.output, { recursive: true, force: true });
  await mkdir(options.output, { recursive: true });
  const stagingDirectory = await mkdtemp(path.join(tmpdir(), 'worldforge-package-'));
  try {
    const runtime = await copyElectronRuntime(
      stagingDirectory,
      options.platform,
      options.version,
    );
    await prepareApplication(runtime.resourcesPath, options.version);
    const artifactName = `WorldForge-v${options.version}-${options.platform}-${runtime.architecture}.${archiveExtension(options.platform)}`;
    const artifactPath = path.join(options.output, artifactName);
    createArchive({
      platform: options.platform,
      stagingDirectory,
      bundleName: runtime.bundleName,
      artifactPath,
    });
    const metadata = {
      schemaVersion: 1,
      product: 'WorldForge',
      version: options.version,
      platform: options.platform,
      architecture: runtime.architecture,
      artifact: artifactName,
      bytes: (await stat(artifactPath)).size,
      sha256: await sha256(artifactPath),
      packageKind: 'portable-electron-bundle',
      signed: false,
      notarized: false,
      fusesApplied: false,
      asar: false,
      limitations: [
        'Code signing and notarization are separate release acceptance gates.',
        'Electron production fuses and ASAR integrity remain blocked until the hardened C8 package stage.',
      ],
    };
    await writeFile(
      path.join(options.output, 'package-manifest.json'),
      `${JSON.stringify(metadata, null, 2)}\n`,
      'utf8',
    );
    console.log(`Packaged ${artifactName} (${metadata.bytes} bytes).`);
    return metadata;
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  packageDesktop().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
