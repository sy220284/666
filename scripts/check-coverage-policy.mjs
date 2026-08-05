import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const METRICS = ['statements', 'branches', 'functions', 'lines'];

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

export function validateCoverageBaseline(baseline) {
  const violations = [];

  if (baseline?.schemaVersion !== 1) violations.push('coverage baseline schemaVersion must be 1');
  if (baseline?.policy !== 'dual-track') violations.push('coverage baseline policy must be dual-track');
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

export async function inspectCoveragePolicy(repositoryRoot = DEFAULT_ROOT) {
  const read = (file) => readFile(path.join(repositoryRoot, file), 'utf8');
  const [baselineSource, configSource, manifestSource] = await Promise.all([
    read('docs/architecture/coverage-baseline.json'),
    read('vitest.coverage.config.ts'),
    read('package.json'),
  ]);

  const baseline = JSON.parse(baselineSource);
  const manifest = JSON.parse(manifestSource);
  const violations = validateCoverageBaseline(baseline);

  const requiredConfigTokens = [
    "readFileSync(source('./docs/architecture/coverage-baseline.json'), 'utf8')",
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

  if (violations.length > 0) throw new Error(violations.sort().join('\n'));

  return {
    policy: baseline.policy,
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
    `Coverage policy passed: ${result.policy}; core >=75%; Renderer TSX uncovered counts frozen.`,
  );
}
