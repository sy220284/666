import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();

const authorityFiles = {
  quality: '.github/workflows/quality.yml',
  security: '.github/workflows/security.yml',
  performance: '.github/workflows/performance.yml',
  release: '.github/workflows/release.yml',
  mainVerification: '.github/workflows/main-verification.yml',
  riskPolicy: 'scripts/ci-risk-policy.mjs',
  riskMatrix: 'docs/process/CI_RISK_MATRIX.json',
  platformExperienceMatrix: 'docs/process/PLATFORM_EXPERIENCE_MATRIX.json',
};

function requireMarkers(errors, label, source, markers) {
  for (const marker of markers) {
    if (!source.includes(marker)) errors.push(`${label} is missing authority marker: ${marker}`);
  }
}

export function validateGovernanceAuthorities(sources) {
  const errors = [];
  requireMarkers(errors, 'Quality', sources.quality ?? '', [
    'name: quality / quality',
    'quality / release-audit',
    'quality / package-smoke',
    'ci-risk-policy.mjs reliability',
    'ci-risk-policy.mjs platform-experience',
    'name: platform-experience-${{ matrix.platform }}',
    'reliability_suite:',
  ]);
  requireMarkers(errors, 'Security', sources.security ?? '', ['name: security']);
  requireMarkers(errors, 'Performance', sources.performance ?? '', ['name: performance']);
  requireMarkers(errors, 'Release', sources.release ?? '', [
    'node scripts/ui-acceptance-gate.mjs',
    'pnpm release:gate',
    'test "$GITHUB_REF_NAME" = main',
  ]);
  requireMarkers(errors, 'Main Verification', sources.mainVerification ?? '', [
    'name: main-verification',
    'name: synchronize-integrations',
    'main/work/governance branch inventory',
  ]);
  requireMarkers(errors, 'Risk policy', sources.riskPolicy ?? '', [
    'CI_RISK_MATRIX.json',
    'export function riskPlan',
    "'dependency-audit'",
    "reliability: 'reliability'",
    "'windows-ime'",
    "'platform-experience'",
  ]);

  let matrix = null;
  try {
    matrix = JSON.parse(sources.riskMatrix ?? '');
  } catch {
    errors.push('Risk matrix must be valid JSON');
  }
  if (matrix && matrix.schemaVersion !== 1) errors.push('Risk matrix must use schemaVersion 1');
  for (const route of [
    'dependencyAudit',
    'applicationSecurity',
    'performance',
    'reliability',
    'packageSmoke',
    'toolchainExport',
    'uiAcceptance',
    'windowsIme',
    'platformExperience',
    'governanceMeta',
  ]) {
    if (matrix && !Array.isArray(matrix.routes?.[route]?.any)) {
      errors.push(`Risk matrix is missing route: ${route}`);
    }
  }

  let platformMatrix = null;
  try {
    platformMatrix = JSON.parse(sources.platformExperienceMatrix ?? '');
  } catch {
    errors.push('Platform experience matrix must be valid JSON');
  }
  if (platformMatrix && platformMatrix.schemaVersion !== 2) {
    errors.push('Platform experience matrix must use schemaVersion 2');
  }
  if (platformMatrix && platformMatrix.status !== 'enforced') {
    errors.push('Platform experience matrix must be enforced');
  }
  const platformIds = Array.isArray(platformMatrix?.platforms)
    ? platformMatrix.platforms.map((item) => item?.id).sort()
    : [];
  if (
    platformMatrix &&
    JSON.stringify(platformIds) !== JSON.stringify(['linux', 'macos', 'windows'])
  ) {
    errors.push('Platform experience matrix must require exactly linux, macos and windows');
  }
  if (platformMatrix?.scenario?.spec !== 'tests/e2e/platform-experience.spec.ts') {
    errors.push('Platform experience matrix must bind the canonical Electron experience spec');
  }
  const viewportProfiles = Array.isArray(platformMatrix?.scenario?.viewports)
    ? platformMatrix.scenario.viewports
        .map((viewport) => ({
          id: viewport?.id,
          width: viewport?.width,
          height: viewport?.height,
        }))
        .sort((left, right) => Number(left.width) - Number(right.width))
    : [];
  const requiredViewportProfiles = [
    { id: 'mainstream-fhd', width: 1920, height: 1080 },
    { id: 'mid-high-qhd', width: 2560, height: 1440 },
    { id: 'high-end-4k', width: 3840, height: 2160 },
  ];
  if (
    platformMatrix &&
    JSON.stringify(viewportProfiles) !== JSON.stringify(requiredViewportProfiles)
  ) {
    errors.push(
      'Platform experience matrix must require exactly 1920x1080, 2560x1440 and 3840x2160 viewports',
    );
  }

  for (const [label, source] of Object.entries(sources)) {
    if (label === 'riskMatrix' || label === 'platformExperienceMatrix') continue;
    if (source.includes('pull_request_target:')) {
      errors.push(`${label} unexpectedly uses pull_request_target`);
    }
    if (source.includes('repository_dispatch:')) {
      errors.push(`${label} unexpectedly uses repository_dispatch`);
    }
  }
  return errors;
}

export async function runGovernanceSelfCheck(repositoryRoot = root) {
  const entries = await Promise.all(
    Object.entries(authorityFiles).map(async ([key, relativePath]) => [
      key,
      await readFile(path.join(repositoryRoot, relativePath), 'utf8'),
    ]),
  );
  const errors = validateGovernanceAuthorities(Object.fromEntries(entries));
  if (errors.length > 0) throw new Error(errors.join('\n'));
  console.log('Meta-governance authority self-check passed.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runGovernanceSelfCheck().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
