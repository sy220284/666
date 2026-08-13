import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const METRICS = ['statements', 'branches', 'functions', 'lines'];
const COVERAGE_EXCLUSION_CATEGORIES = new Set(['process-boundary', 'renderer-dom-lifecycle']);

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

export function validateCoverageBaseline(baseline) {
  const violations = [];

  if (baseline?.schemaVersion !== 1) violations.push('coverage baseline schemaVersion must be 1');
  if (baseline?.policy !== 'dual-track')
    violations.push('coverage baseline policy must be dual-track');
  if (!/^\d{4}-\d{2}-\d{2}T/u.test(baseline?.measuredAt ?? '')) {
    violations.push('coverage baseline measuredAt must be an ISO timestamp');
  }
  if (!/^[0-9a-f]{40}$/u.test(baseline?.sourceHead ?? '')) {
    violations.push('coverage baseline sourceHead must be a full commit SHA');
  }
  if (baseline?.core?.pattern !== '**/*.ts') {
    violations.push('core coverage pattern must remain **/*.ts');
  }
  if (baseline?.rendererTsx?.pattern !== 'apps/desktop/renderer/src/**/*.tsx') {
    violations.push('Renderer TSX coverage pattern must remain apps/desktop/renderer/src/**/*.tsx');
  }

  for (const metric of METRICS) {
    const coreThreshold = baseline?.core?.thresholdPercent?.[metric];
    if (typeof coreThreshold !== 'number' || coreThreshold < 75) {
      violations.push(`core ${metric} threshold must remain at least 75`);
    }

    const item = baseline?.rendererTsx?.metrics?.[metric];
    if (
      !item ||
      !isNonNegativeInteger(item.covered) ||
      !isNonNegativeInteger(item.total) ||
      !isNonNegativeInteger(item.maxUncovered) ||
      item.covered > item.total
    ) {
      violations.push(`Renderer TSX ${metric} baseline must contain valid integer counts`);
      continue;
    }

    if (item.maxUncovered !== item.total - item.covered) {
      violations.push(`Renderer TSX ${metric} maxUncovered must equal total - covered`);
    }

    const expectedPercent = item.total === 0 ? 100 : (item.covered / item.total) * 100;
    if (typeof item.percent !== 'number' || Math.abs(item.percent - expectedPercent) > 0.01) {
      violations.push(`Renderer TSX ${metric} percent must match covered / total`);
    }
  }

  return violations;
}

export function validateCoverageExclusions(registry) {
  const violations = [];
  if (registry?.schemaVersion !== 1) {
    violations.push('coverage exclusions schemaVersion must be 1');
  }
  if (registry?.policy !== 'explicit-exclusions-with-substitute-tests') {
    violations.push('coverage exclusions policy must require substitute tests');
  }
  if (!Array.isArray(registry?.exclusions) || registry.exclusions.length === 0) {
    violations.push('coverage exclusions must be a non-empty array');
    return violations;
  }

  const seen = new Set();
  for (const [index, entry] of registry.exclusions.entries()) {
    const prefix = `coverage exclusion ${index + 1}`;
    if (
      typeof entry?.path !== 'string' ||
      (!entry.path.startsWith('apps/') && !entry.path.startsWith('packages/'))
    ) {
      violations.push(`${prefix} must name a product source path`);
      continue;
    }
    if (seen.has(entry.path)) violations.push(`${prefix} duplicates ${entry.path}`);
    seen.add(entry.path);
    if (!COVERAGE_EXCLUSION_CATEGORIES.has(entry.category)) {
      violations.push(`${entry.path}: invalid coverage exclusion category`);
    }
    if (typeof entry.reason !== 'string' || entry.reason.trim().length < 12) {
      violations.push(`${entry.path}: exclusion reason must explain the boundary`);
    }
    if (!Array.isArray(entry.substituteTests) || entry.substituteTests.length === 0) {
      violations.push(`${entry.path}: exclusion requires substituteTests`);
    } else if (
      entry.substituteTests.some((test) => typeof test !== 'string' || !test.startsWith('tests/'))
    ) {
      violations.push(`${entry.path}: substituteTests must use repository test paths`);
    }
    if (typeof entry.exitCondition !== 'string' || entry.exitCondition.trim().length < 12) {
      violations.push(`${entry.path}: exclusion requires an explicit exitCondition`);
    }
  }
  return violations;
}

export async function inspectCoveragePolicy(repositoryRoot = DEFAULT_ROOT) {
  const read = (file) => readFile(path.join(repositoryRoot, file), 'utf8');
  const [baselineSource, exclusionsSource, configSource, manifestSource] = await Promise.all([
    read('docs/architecture/coverage-baseline.json'),
    read('docs/architecture/coverage-exclusions.json'),
    read('vitest.coverage.config.ts'),
    read('package.json'),
  ]);

  const baseline = JSON.parse(baselineSource);
  const exclusions = JSON.parse(exclusionsSource);
  const manifest = JSON.parse(manifestSource);
  const violations = [
    ...validateCoverageBaseline(baseline),
    ...validateCoverageExclusions(exclusions),
  ];

  for (const entry of exclusions.exclusions ?? []) {
    for (const substituteTest of entry.substituteTests ?? []) {
      try {
        await access(path.join(repositoryRoot, substituteTest));
      } catch {
        violations.push(`${entry.path}: substitute test does not exist: ${substituteTest}`);
      }
    }
  }

  const requiredConfigTokens = [
    "readFileSync(source('./docs/architecture/coverage-baseline.json'), 'utf8')",
    "readFileSync(source('./docs/architecture/coverage-exclusions.json'), 'utf8')",
    'coverageExclusions.exclusions.map((entry) => entry.path)',
    '[coverageBaseline.core.pattern]: coverageBaseline.core.thresholdPercent',
    '[coverageBaseline.rendererTsx.pattern]: rendererTsxThresholds',
    '-coverageBaseline.rendererTsx.metrics.statements.maxUncovered',
    '-coverageBaseline.rendererTsx.metrics.branches.maxUncovered',
    '-coverageBaseline.rendererTsx.metrics.functions.maxUncovered',
    '-coverageBaseline.rendererTsx.metrics.lines.maxUncovered',
    "'apps/desktop/renderer/src/**/*.{ts,tsx}'",
  ];

  for (const token of requiredConfigTokens) {
    if (!configSource.includes(token)) {
      violations.push(`vitest.coverage.config.ts: missing ${token}`);
    }
  }

  for (const forbiddenToken of ['thresholds: {\n        statements: 75', 'autoUpdate:']) {
    if (configSource.includes(forbiddenToken)) {
      violations.push(`vitest.coverage.config.ts: forbidden ${forbiddenToken}`);
    }
  }

  const ciPolicy = manifest.scripts?.['ci:policy'] ?? '';
  if (!ciPolicy.includes('node scripts/check-coverage-policy.mjs')) {
    violations.push('package.json#ci:policy must run check-coverage-policy.mjs');
  }
  const baselineUpdate = manifest.scripts?.['coverage:baseline:update'] ?? '';
  if (!baselineUpdate.includes('node scripts/update-coverage-baseline.mjs')) {
    violations.push('package.json#coverage:baseline:update must use update-coverage-baseline.mjs');
  }

  if (violations.length > 0) throw new Error(violations.sort().join('\n'));

  return {
    policy: baseline.policy,
    sourceHead: baseline.sourceHead,
    exclusionCount: exclusions.exclusions.length,
    coreThresholdPercent: baseline.core.thresholdPercent,
    rendererTsxMaxUncovered: Object.fromEntries(
      METRICS.map((metric) => [metric, baseline.rendererTsx.metrics[metric].maxUncovered]),
    ),
  };
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const result = await inspectCoveragePolicy();
  console.log(
    `Coverage policy passed: ${result.policy}; core >=75%; Renderer TSX uncovered counts frozen; exclusions=${result.exclusionCount}.`,
  );
}
