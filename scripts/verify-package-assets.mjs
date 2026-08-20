import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function option(argumentsList, name) {
  const index = argumentsList.indexOf(name);
  if (index < 0 || !argumentsList[index + 1]) throw new Error(`${name} is required`);
  return argumentsList[index + 1];
}

function optionalOption(argumentsList, name, fallback) {
  const index = argumentsList.indexOf(name);
  if (index < 0) return fallback;
  if (!argumentsList[index + 1]) throw new Error(`${name} requires a value`);
  return argumentsList[index + 1];
}

export function verifyDistributionTrust(manifest, platform, trustMode) {
  if (!['allow-unsigned', 'required'].includes(trustMode)) {
    throw new Error(`Unsupported distribution trust mode: ${trustMode}`);
  }
  const evidence = manifest.distributionTrustEvidence;
  if (manifest.signed === true && !evidence) {
    throw new Error('Package claims a signature without native verification evidence');
  }
  if (manifest.signed !== true && evidence) {
    throw new Error('Unsigned package must not contain distribution trust evidence');
  }
  if ((manifest.notarized === true || manifest.stapled === true) && manifest.signed !== true) {
    throw new Error('Notarization evidence requires a signed package');
  }
  if (manifest.notarized === true && manifest.stapled !== true) {
    throw new Error('Package claims notarization without a stapled ticket');
  }
  if (manifest.stapled === true && manifest.notarized !== true) {
    throw new Error('Package claims a stapled ticket without notarization');
  }
  if (trustMode !== 'required') return;

  if (
    platform === 'windows' &&
    (manifest.signed !== true ||
      evidence?.signing !== 'authenticode-sha256' ||
      evidence?.signatureVerification !== 'Get-AuthenticodeSignature:Valid' ||
      evidence?.timestamped !== true)
  ) {
    throw new Error('Stable Windows assets require verified, timestamped Authenticode signing');
  }
  if (
    platform === 'macos' &&
    (manifest.signed !== true ||
      manifest.notarized !== true ||
      manifest.stapled !== true ||
      evidence?.signing !== 'developer-id-application' ||
      evidence?.hardenedRuntime !== true ||
      evidence?.signatureVerification !== 'codesign:strict' ||
      evidence?.notarizationVerification !== 'stapler:validated' ||
      evidence?.gatekeeperAssessment !== 'spctl:accepted')
  ) {
    throw new Error(
      'Stable macOS assets require Developer ID signing, hardened runtime, notarization, stapling, and Gatekeeper acceptance',
    );
  }
}

export async function verifyPackageAssets(
  argumentsList = process.argv.slice(2),
  root = process.cwd(),
) {
  const platform = option(argumentsList, '--platform');
  const version = option(argumentsList, '--version');
  const releaseKind = optionalOption(argumentsList, '--release-kind', 'draft');
  const trustMode = optionalOption(argumentsList, '--distribution-trust', 'allow-unsigned');
  const directory = path.resolve(root, option(argumentsList, '--directory'));
  const manifest = JSON.parse(
    await readFile(path.join(directory, 'package-manifest.json'), 'utf8'),
  );
  if (manifest.platform !== platform || manifest.version !== version) {
    throw new Error('Package manifest platform or version does not match the release matrix');
  }
  if (
    manifest.schemaVersion !== 2 ||
    manifest.releaseKind !== releaseKind ||
    manifest.distributionTrustMode !== trustMode
  ) {
    throw new Error('Package manifest does not match the requested release trust policy');
  }
  verifyDistributionTrust(manifest, platform, trustMode);
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
