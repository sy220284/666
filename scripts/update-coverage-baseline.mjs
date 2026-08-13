import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const METRICS = ['statements', 'branches', 'functions', 'lines'];
const RENDERER_TSX_SEGMENT = '/apps/desktop/renderer/src/';

function optionValue(argumentsList, option) {
  const index = argumentsList.indexOf(option);
  return index >= 0 ? argumentsList[index + 1] : null;
}

function normalizedPath(value) {
  return value.replaceAll('\\', '/');
}

export function aggregateRendererTsxCoverage(summary) {
  const metrics = Object.fromEntries(METRICS.map((metric) => [metric, { covered: 0, total: 0 }]));

  for (const [file, entry] of Object.entries(summary)) {
    if (file === 'total') continue;
    const normalized = normalizedPath(file);
    if (!normalized.includes(RENDERER_TSX_SEGMENT) || !normalized.endsWith('.tsx')) continue;
    for (const metric of METRICS) {
      const value = entry?.[metric];
      if (!value || !Number.isInteger(value.covered) || !Number.isInteger(value.total)) {
        throw new Error(`Coverage summary is missing integer ${metric} counts for ${file}`);
      }
      metrics[metric].covered += value.covered;
      metrics[metric].total += value.total;
    }
  }

  if (metrics.statements.total === 0) {
    throw new Error('Coverage summary contains no Renderer TSX files');
  }

  return Object.fromEntries(
    METRICS.map((metric) => {
      const { covered, total } = metrics[metric];
      return [
        metric,
        {
          covered,
          total,
          maxUncovered: total - covered,
          percent: total === 0 ? 100 : Number(((covered / total) * 100).toFixed(2)),
        },
      ];
    }),
  );
}

export function assertCoverageTightens(current, next) {
  const violations = [];
  for (const metric of METRICS) {
    const previous = current?.rendererTsx?.metrics?.[metric]?.maxUncovered;
    const candidate = next?.[metric]?.maxUncovered;
    if (!Number.isInteger(previous) || !Number.isInteger(candidate)) {
      violations.push(`${metric} uncovered count is not an integer`);
      continue;
    }
    if (candidate > previous) {
      violations.push(`${metric} uncovered count increased from ${previous} to ${candidate}`);
    }
  }
  if (violations.length > 0) {
    throw new Error(`Coverage baseline may only tighten:\n${violations.join('\n')}`);
  }
}

export async function updateCoverageBaseline({
  repositoryRoot = DEFAULT_ROOT,
  summaryPath,
  sourceHead,
  measuredAt = new Date().toISOString(),
  write = false,
}) {
  if (!summaryPath) throw new Error('summaryPath is required');
  if (!/^[0-9a-f]{40}$/u.test(sourceHead ?? '')) {
    throw new Error('sourceHead must be a full 40-character commit SHA');
  }
  const baselinePath = path.join(repositoryRoot, 'docs/architecture/coverage-baseline.json');
  const [summarySource, baselineSource] = await Promise.all([
    readFile(path.resolve(repositoryRoot, summaryPath), 'utf8'),
    readFile(baselinePath, 'utf8'),
  ]);
  const summary = JSON.parse(summarySource);
  const baseline = JSON.parse(baselineSource);
  const rendererTsxMetrics = aggregateRendererTsxCoverage(summary);
  assertCoverageTightens(baseline, rendererTsxMetrics);

  const next = {
    ...baseline,
    measuredAt,
    sourceHead,
    rendererTsx: {
      ...baseline.rendererTsx,
      metrics: rendererTsxMetrics,
    },
  };

  if (write) await writeFile(baselinePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const argumentsList = process.argv.slice(2);
  const summaryPath = optionValue(argumentsList, '--summary');
  const sourceHead = optionValue(argumentsList, '--source-head');
  const measuredAt = optionValue(argumentsList, '--measured-at') ?? new Date().toISOString();
  const write = argumentsList.includes('--write');
  const next = await updateCoverageBaseline({ summaryPath, sourceHead, measuredAt, write });
  console.log(
    `Renderer TSX coverage ${write ? 'baseline updated' : 'baseline previewed'}: ${METRICS.map(
      (metric) => `${metric}=${next.rendererTsx.metrics[metric].percent}%`,
    ).join(', ')}`,
  );
}
