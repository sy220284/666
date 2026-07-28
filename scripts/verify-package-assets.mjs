import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function option(argumentsList, name) {
  const index = argumentsList.indexOf(name);
  if (index < 0 || !argumentsList[index + 1]) throw new Error(`${name} is required`);
  return argumentsList[index + 1];
}

export async function verifyPackageAssets(
  argumentsList = process.argv.slice(2),
  root = process.cwd(),
) {
  const platform = option(argumentsList, '--platform');
  const version = option(argumentsList, '--version');
  const directory = path.resolve(root, option(argumentsList, '--directory'));
  const manifest = JSON.parse(
    await readFile(path.join(directory, 'package-manifest.json'), 'utf8'),
  );
  if (manifest.platform !== platform || manifest.version !== version) {
    throw new Error('Package manifest platform or version does not match the release matrix');
  }
  if (
    manifest.packageKind !== 'portable-electron-bundle' ||
    manifest.asar !== true ||
    manifest.fusesApplied !== true ||
    !/^[0-9a-f]{64}$/u.test(manifest.appAsarSha256 ?? '') ||
    !/^[0-9a-f]{64}$/u.test(manifest.appAsarHeaderSha256 ?? '') ||
    manifest.fuses?.runAsNode !== false ||
    manifest.fuses?.onlyLoadAppFromAsar !== true ||
    manifest.fuses?.embeddedAsarIntegrityValidation !== true ||
    manifest.fuses?.grantFileProtocolExtraPrivileges !== false ||
    manifest.fuses?.loadBrowserProcessSpecificV8Snapshot !== false
  ) {
    throw new Error('Package manifest does not prove the frozen ASAR and production-fuse policy');
  }
  if (
    platform === 'linux' &&
    (manifest.portableLauncher?.launcher !== 'worldforge' ||
      manifest.portableLauncher?.runtimeBinary !== 'worldforge-bin' ||
      manifest.portableLauncher?.sandbox !== 'user-namespace')
  ) {
    throw new Error('Linux package manifest does not prove the user-namespace sandbox launcher');
  }
  const artifactPath = path.join(directory, manifest.artifact);
  const metadata = await stat(artifactPath);
  if (!metadata.isFile() || metadata.size <= 0 || metadata.size !== manifest.bytes) {
    throw new Error('Package artifact is missing, empty, or has a stale byte count');
  }
  const digest = createHash('sha256')
    .update(await readFile(artifactPath))
    .digest('hex');
  if (digest !== manifest.sha256) {
    throw new Error('Package artifact checksum does not match its manifest');
  }
  console.log(`Verified ${manifest.artifact} for ${platform}.`);
  return manifest;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await verifyPackageAssets();
