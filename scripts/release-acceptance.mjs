import process from 'node:process';

const releaseKinds = new Set(['draft', 'prerelease', 'stable']);
const distributionTrustModes = new Set(['allow-unsigned', 'required']);
const fullShaPattern = /^[0-9a-f]{40}$/iu;

function isMainEffectivelyVerified(statuses) {
  return statuses.some(
    (status) => status?.context === 'main-verification' && status?.state === 'success',
  );
}

export async function loadReleaseCommitStatuses(commitSha) {
  if (!fullShaPattern.test(commitSha ?? '')) return [];
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPOSITORY) return [];
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
  if (!owner || !repo) return [];
  const response = await globalThis.fetch(
    `https://api.github.com/repos/${owner}/${repo}/commits/${commitSha}/status`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  );
  if (!response.ok) throw new Error(`GitHub status resolution failed with HTTP ${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload.statuses) ? payload.statuses : [];
}

export function parseReleaseVersion(value) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    throw new Error('Release version must be a non-empty SemVer value without surrounding spaces');
  }
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(
      value,
    );
  if (!match) throw new Error('Release version must use SemVer without a leading v');
  if (
    match[4]
      ?.split('.')
      .some(
        (identifier) => /^\d+$/.test(identifier) && identifier.length > 1 && identifier[0] === '0',
      )
  ) {
    throw new Error('Numeric prerelease identifiers must not contain leading zeroes');
  }
  return value;
}

export function normalizeReleasePolicy(releaseKind, distributionTrust) {
  if (!releaseKinds.has(releaseKind)) throw new Error(`Unsupported release kind: ${releaseKind}`);
  const trustMode = distributionTrust ?? (releaseKind === 'stable' ? 'required' : 'allow-unsigned');
  if (!distributionTrustModes.has(trustMode)) {
    throw new Error(`Unsupported distribution trust mode: ${trustMode}`);
  }
  if (releaseKind === 'stable' && trustMode !== 'required') {
    throw new Error('Stable releases must require platform distribution trust');
  }
  return { releaseKind, distributionTrust: trustMode };
}

export function validateReleaseConfiguration({ packageJson, workflowSource }) {
  const errors = [];
  try {
    parseReleaseVersion(packageJson.version);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  const expectedScripts = {
    package: 'node scripts/package-desktop.mjs',
    'package:foundation': 'node scripts/package-foundation.mjs',
    'release:check': 'node scripts/release-tool.mjs check',
    'release:gate': 'node scripts/release-tool.mjs gate',
    'release:checksums': 'node scripts/release-tool.mjs checksums',
  };
  for (const [name, expected] of Object.entries(expectedScripts)) {
    if (packageJson.scripts?.[name] !== expected) {
      errors.push('package.json must define ' + name + ' as "' + expected + '"');
    }
  }

  for (const token of [
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
  ]) {
    if (!workflowSource.includes(token)) errors.push('Release workflow is missing: ' + token);
  }
  if (workflowSource.includes('single-work-release-gate.mjs')) {
    errors.push('Release workflow must not use Task Runtime as a release authority');
  }
  return errors;
}

export function evaluateReleaseAcceptance({
  statuses = [],
  packageVersion,
  requestedVersion,
  refName,
  releaseKind = 'draft',
  distributionTrust,
}) {
  const errors = [];
  let version = null;
  let policy = null;
  try {
    version = parseReleaseVersion(requestedVersion);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  try {
    parseReleaseVersion(packageVersion);
  } catch {
    errors.push('package.json version is not valid SemVer');
  }
  try {
    policy = normalizeReleasePolicy(releaseKind, distributionTrust);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  if (version && packageVersion !== version) {
    errors.push(
      'Requested version ' + version + ' does not match package.json version ' + packageVersion,
    );
  }
  if (refName && refName !== 'main') {
    errors.push('Releases may only run from main, found ' + refName);
  }
  if (!isMainEffectivelyVerified(statuses)) {
    errors.push('Current release commit must have main-verification=success');
  }
  return { version, ...policy, errors };
}
