import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  evaluateReleaseAcceptance,
  loadReleaseCommitStatuses,
  parseReleaseVersion,
  validateReleaseConfiguration,
} from './release-acceptance.mjs';
import { verifyPackageAssets } from './verify-package-assets.mjs';

export { evaluateReleaseAcceptance as evaluateReleaseGate };
export { parseReleaseVersion, validateReleaseConfiguration };

const root = process.cwd();
const checksumFileName = 'SHA256SUMS.txt';

function toPosix(filePath) {
  return filePath.replaceAll('\\', '/');
}

export async function collectReleaseAssets(assetDirectory, excludedPaths = []) {
  const base = path.resolve(assetDirectory);
  const excluded = new Set(excludedPaths.map(toPosix));
  const assets = [];

  async function visit(relativeDirectory) {
    const directory = path.join(base, relativeDirectory);
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));

    for (const entry of entries) {
      const relativePath = path.join(relativeDirectory, entry.name);
      const normalizedPath = toPosix(relativePath);
      if (excluded.has(normalizedPath)) continue;
      if (entry.isSymbolicLink()) {
        throw new Error('Release assets may not contain symbolic links: ' + normalizedPath);
      }
      if (entry.isDirectory()) {
        await visit(relativePath);
        continue;
      }
      if (!entry.isFile()) {
        throw new Error('Unsupported release asset: ' + normalizedPath);
      }

      const content = await readFile(path.join(base, relativePath));
      assets.push({
        path: normalizedPath,
        bytes: content.byteLength,
        sha256: createHash('sha256').update(content).digest('hex'),
      });
    }
  }

  await visit('');
  return assets;
}

export function renderChecksums(assets) {
  return assets.map((asset) => asset.sha256 + '  ' + asset.path).join('\n') + '\n';
}

function readOption(name, fallback) {
  const prefix = name + '=';
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  if (index >= 0) {
    const value = process.argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(name + ' requires a value');
    return value;
  }
  return fallback;
}

function git(argumentsList) {
  return execFileSync('git', argumentsList, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function currentHead() {
  return git(['rev-parse', 'HEAD']);
}

async function loadReleaseState() {
  const [packageSource, workflowSource] = await Promise.all([
    readFile(path.join(root, 'package.json'), 'utf8'),
    readFile(path.join(root, '.github/workflows/release.yml'), 'utf8'),
  ]);
  return {
    packageJson: JSON.parse(packageSource),
    workflowSource,
  };
}

async function evaluateCurrentReleaseState(
  state,
  requestedVersion,
  refName,
  releaseKind,
  distributionTrust,
) {
  const statuses = await loadReleaseCommitStatuses(currentHead());
  return evaluateReleaseAcceptance({
    statuses,
    packageVersion: state.packageJson.version,
    requestedVersion,
    refName,
    releaseKind,
    distributionTrust,
  });
}

async function findPackageManifestDirectories(assetDirectory) {
  const directories = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        throw new Error(`Release assets may not contain symbolic links: ${entry.name}`);
      }
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(entryPath);
      if (entry.isFile() && entry.name === 'package-manifest.json') directories.push(directory);
    }
  }
  await visit(path.resolve(assetDirectory));
  return directories.sort((left, right) => left.localeCompare(right, 'en'));
}

function publicManifestAssetName(manifest, version) {
  if (manifest.version !== version) {
    throw new Error(
      `Release manifest version ${String(manifest.version)} does not match requested version ${version}`,
    );
  }
  if (!['linux', 'windows', 'macos'].includes(manifest.platform)) {
    throw new Error(`Unsupported package platform in release assets: ${String(manifest.platform)}`);
  }
  const architecture = typeof manifest.architecture === 'string' ? manifest.architecture.trim() : '';
  if (!architecture || !/^[0-9A-Za-z._-]+$/u.test(architecture)) {
    throw new Error(`Invalid package architecture in release assets: ${String(manifest.architecture)}`);
  }
  return `WorldForge-v${version}-${manifest.platform}-${architecture}-manifest.json`;
}

export async function prepareReleasePublicationAssets(
  assetDirectory,
  version,
  excludedPaths = [],
) {
  const base = path.resolve(assetDirectory);
  const directories = await findPackageManifestDirectories(base);
  if (directories.length !== 3) {
    throw new Error(
      `Release assets must contain exactly three package manifests, found ${directories.length}`,
    );
  }

  const renamePlan = [];
  for (const directory of directories) {
    const sourcePath = path.join(directory, 'package-manifest.json');
    const content = await readFile(sourcePath);
    const manifest = JSON.parse(content.toString('utf8'));
    const publicName = publicManifestAssetName(manifest, version);
    renamePlan.push({
      sourcePath,
      targetPath: path.join(directory, publicName),
      publicName,
      bytes: content.byteLength,
      sha256: createHash('sha256').update(content).digest('hex'),
    });
  }

  const manifestSourcePaths = renamePlan.map((entry) =>
    toPosix(path.relative(base, entry.sourcePath)),
  );
  const sourceAssets = await collectReleaseAssets(base, [...excludedPaths, ...manifestSourcePaths]);
  const publicationAssets = sourceAssets.map((asset) => ({
    ...asset,
    path: path.posix.basename(toPosix(asset.path)),
  }));
  publicationAssets.push(
    ...renamePlan.map((entry) => ({
      path: entry.publicName,
      bytes: entry.bytes,
      sha256: entry.sha256,
    })),
  );
  publicationAssets.sort((left, right) => left.path.localeCompare(right.path, 'en'));

  const seen = new Set();
  for (const asset of publicationAssets) {
    if (seen.has(asset.path)) {
      throw new Error(`Release publication asset names must be unique: ${asset.path}`);
    }
    seen.add(asset.path);
  }

  for (const entry of renamePlan) {
    await rename(entry.sourcePath, entry.targetPath);
  }
  return publicationAssets;
}

export async function verifyReleaseAssetSet({
  assetDirectory,
  version,
  releaseKind,
  distributionTrust,
}) {
  const directories = await findPackageManifestDirectories(assetDirectory);
  if (directories.length !== 3) {
    throw new Error(
      `Release assets must contain exactly three package manifests, found ${directories.length}`,
    );
  }
  const verified = [];
  for (const directory of directories) {
    const manifest = JSON.parse(
      await readFile(path.join(directory, 'package-manifest.json'), 'utf8'),
    );
    if (!['linux', 'windows', 'macos'].includes(manifest.platform)) {
      throw new Error(
        `Unsupported package platform in release assets: ${String(manifest.platform)}`,
      );
    }
    verified.push(
      await verifyPackageAssets(
        [
          '--platform',
          manifest.platform,
          '--version',
          version,
          '--release-kind',
          releaseKind,
          '--distribution-trust',
          distributionTrust,
          '--directory',
          directory,
        ],
        root,
      ),
    );
  }
  const platforms = verified.map((manifest) => manifest.platform).sort();
  if (platforms.join(',') !== 'linux,macos,windows') {
    throw new Error(
      `Release assets must contain one package per platform, found ${platforms.join(',')}`,
    );
  }
  return verified;
}

async function checkConfiguration() {
  const state = await loadReleaseState();
  const errors = validateReleaseConfiguration(state);
  if (errors.length > 0) throw new Error(errors.join('\n'));

  const result = await evaluateCurrentReleaseState(
    state,
    state.packageJson.version,
    'main',
    'draft',
    'allow-unsigned',
  );
  const gateStatus = result.errors.length === 0 ? 'READY' : `BLOCKED (${result.errors.join('; ')})`;
  console.log('Release tooling is configured. Publishing gate: ' + gateStatus + '.');
}

async function requireReleaseGate(
  requestedVersion,
  releaseKind,
  distributionTrust,
  assetDirectory,
) {
  const state = await loadReleaseState();
  const configurationErrors = validateReleaseConfiguration(state);
  if (configurationErrors.length > 0) throw new Error(configurationErrors.join('\n'));

  const result = await evaluateCurrentReleaseState(
    state,
    requestedVersion,
    process.env.GITHUB_REF_NAME,
    releaseKind,
    distributionTrust,
  );
  if (result.errors.length > 0) throw new Error(result.errors.join('\n'));
  if (assetDirectory) {
    await verifyReleaseAssetSet({
      assetDirectory,
      version: result.version,
      releaseKind: result.releaseKind,
      distributionTrust: result.distributionTrust,
    });
  }
  console.log(
    `Release acceptance passed for v${result.version} (${result.releaseKind}, ${result.distributionTrust}).`,
  );
  return result.version;
}

async function writeChecksums(requestedVersion) {
  const assetDirectory = path.resolve(root, readOption('--assets', 'release'));
  const releaseKind = readOption('--kind', 'draft');
  const distributionTrust = readOption('--distribution-trust', 'allow-unsigned');
  const version = await requireReleaseGate(
    requestedVersion,
    releaseKind,
    distributionTrust,
    assetDirectory,
  );
  const outputPath = path.resolve(
    root,
    readOption('--output', path.join(path.relative(root, assetDirectory), checksumFileName)),
  );
  const relativeOutput = path.relative(assetDirectory, outputPath);
  if (
    relativeOutput === '' ||
    relativeOutput === '..' ||
    relativeOutput.startsWith('..' + path.sep) ||
    path.isAbsolute(relativeOutput)
  ) {
    throw new Error('Checksum output must be located inside the release asset directory');
  }

  const assets = await prepareReleasePublicationAssets(assetDirectory, version, [
    toPosix(relativeOutput),
  ]);
  if (assets.length === 0) throw new Error('No release assets were found');
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, renderChecksums(assets), 'utf8');
  console.log(
    'Prepared ' +
      assets.length +
      ' unique public assets and wrote checksums for WorldForge v' +
      version +
      '.',
  );
}

async function main() {
  const command = process.argv[2] ?? 'check';
  if (command === 'check') return checkConfiguration();
  if (command === 'gate') {
    const version = readOption('--version');
    if (!version) throw new Error('gate requires --version');
    const releaseKind = readOption('--kind', 'draft');
    const distributionTrust = readOption('--distribution-trust', 'allow-unsigned');
    const assetDirectory = readOption('--assets', null);
    await requireReleaseGate(version, releaseKind, distributionTrust, assetDirectory);
    return;
  }
  if (command === 'checksums') {
    const version = readOption('--version');
    if (!version) throw new Error('checksums requires --version');
    await writeChecksums(version);
    return;
  }
  throw new Error('Unknown release-tool command: ' + command);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
