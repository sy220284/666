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
  riskMatrix: '.github/governance/risk-matrix.json',
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
    'risk-matrix.json',
    'export function riskPlan',
    "'dependency-audit'",
    "'windows-ime'",
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
    'packageSmoke',
    'toolchainExport',
    'uiAcceptance',
    'windowsIme',
    'governanceMeta',
  ]) {
    if (matrix && !Array.isArray(matrix.routes?.[route]?.any)) {
      errors.push(`Risk matrix is missing route: ${route}`);
    }
  }

  for (const [label, source] of Object.entries(sources)) {
    if (label === 'riskMatrix') continue;
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
