import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { importsFrom } from './check-boundaries.mjs';

const SOURCE_ROOTS = [
  'apps/desktop/main/src',
  'apps/desktop/preload/src',
  'apps/desktop/renderer/src',
  'packages/contracts/src',
  'packages/core-service/src',
  'packages/domain/src',
  'packages/editor-core/src',
  'packages/prompts/src',
];
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'];
const BASELINE_PATH = 'docs/architecture/source-structure-baseline.json';
const OBSERVATION_LIMIT = 10;

function normalize(value) {
  return value.replaceAll('\\', '/').replace(/^\.\//u, '');
}

async function listSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listSourceFiles(target)));
    if (entry.isFile() && SOURCE_EXTENSIONS.includes(path.extname(entry.name))) files.push(target);
  }
  return files;
}

function candidatePaths(importer, specifier) {
  const importerDirectory = path.dirname(importer);
  const absolute = path.resolve(importerDirectory, specifier);
  const extension = path.extname(absolute);
  const stem = ['.js', '.jsx', '.mjs', '.cjs'].includes(extension)
    ? absolute.slice(0, -extension.length)
    : absolute;
  const candidates = [];
  if (SOURCE_EXTENSIONS.includes(extension)) candidates.push(absolute);
  for (const sourceExtension of SOURCE_EXTENSIONS) candidates.push(`${stem}${sourceExtension}`);
  for (const sourceExtension of SOURCE_EXTENSIONS) {
    candidates.push(path.join(stem, `index${sourceExtension}`));
  }
  return [...new Set(candidates.map((candidate) => path.resolve(candidate)))];
}

export function resolveRelativeImport(importer, specifier, knownFiles) {
  if (!specifier.startsWith('.')) return null;
  for (const candidate of candidatePaths(importer, specifier)) {
    if (knownFiles.has(candidate)) return candidate;
  }
  return null;
}

function canonicalCycle(cycle) {
  const body = cycle.at(-1) === cycle[0] ? cycle.slice(0, -1) : [...cycle];
  if (body.length === 0) return '';
  const rotations = body.map((_, index) => [...body.slice(index), ...body.slice(0, index)]);
  const reversed = [...body].reverse();
  rotations.push(
    ...reversed.map((_, index) => [...reversed.slice(index), ...reversed.slice(0, index)]),
  );
  const canonical = rotations.map((value) => value.join(' -> ')).sort()[0];
  return canonical ?? '';
}

export function detectCycles(graph) {
  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  const cycles = new Map();

  const visit = (node) => {
    if (visited.has(node)) return;
    if (visiting.has(node)) {
      const start = stack.indexOf(node);
      const cycle = [...stack.slice(start), node];
      cycles.set(canonicalCycle(cycle), cycle);
      return;
    }
    visiting.add(node);
    stack.push(node);
    for (const target of graph.get(node) ?? []) visit(target);
    stack.pop();
    visiting.delete(node);
    visited.add(node);
  };

  for (const node of graph.keys()) visit(node);
  return [...cycles.values()];
}

function featureName(file) {
  return /apps\/desktop\/renderer\/src\/features\/([^/]+)\//u.exec(normalize(file))?.[1] ?? null;
}

export function validateFeatureDependency(source, target, baseline) {
  const sourceFeature = featureName(source);
  const targetFeature = featureName(target);
  if (!sourceFeature || !targetFeature || sourceFeature === targetFeature) return null;
  const edge = `${sourceFeature}>${targetFeature}`;
  if (!baseline.forbiddenFeatureEdges.includes(edge)) return null;
  const allowed = baseline.allowedFeatureImports.some(
    (entry) =>
      normalize(entry.from) === normalize(source) && normalize(entry.to) === normalize(target),
  );
  return allowed
    ? null
    : `${normalize(source)} may not depend on ${targetFeature} (${normalize(target)})`;
}

function lineCount(source) {
  if (source.length === 0) return 0;
  return source.split(/\r?\n/u).length;
}

function exportedSymbolCount(source) {
  return [
    ...source.matchAll(
      /\bexport\s+(?:default\s+)?(?:async\s+)?(?:class|const|enum|function|interface|type|\{)/gu,
    ),
  ].length;
}

export function sourceObservation(file, source, dependencyCount = 0) {
  return {
    file: normalize(file),
    lines: lineCount(source),
    exports: exportedSymbolCount(source),
    dependencies: dependencyCount,
  };
}

function allowedCycleKeys(baseline) {
  return new Set(
    baseline.allowedCycles.map((cycle) => canonicalCycle(cycle.map((value) => normalize(value)))),
  );
}

async function loadBaseline(rootDirectory) {
  const source = await readFile(path.join(rootDirectory, BASELINE_PATH), 'utf8');
  const baseline = JSON.parse(source);
  if (baseline.schemaVersion !== 2) throw new Error('Unsupported source structure baseline');
  return baseline;
}

export async function inspectSourceStructure(rootDirectory = process.cwd()) {
  const baseline = await loadBaseline(rootDirectory);
  const absoluteFiles = [];
  for (const sourceRoot of SOURCE_ROOTS) {
    absoluteFiles.push(...(await listSourceFiles(path.join(rootDirectory, sourceRoot))));
  }
  const knownFiles = new Set(absoluteFiles.map((file) => path.resolve(file)));
  const graph = new Map();
  const sourceByFile = new Map();
  const violations = [];

  for (const absoluteFile of absoluteFiles) {
    const relativeFile = normalize(path.relative(rootDirectory, absoluteFile));
    const source = await readFile(absoluteFile, 'utf8');
    sourceByFile.set(absoluteFile, source);

    const targets = new Set();
    for (const specifier of importsFrom(source, absoluteFile)) {
      const resolved = resolveRelativeImport(absoluteFile, specifier, knownFiles);
      if (!resolved) continue;
      targets.add(resolved);
      const relativeTarget = normalize(path.relative(rootDirectory, resolved));
      const featureViolation = validateFeatureDependency(relativeFile, relativeTarget, baseline);
      if (featureViolation) violations.push(featureViolation);
    }
    graph.set(absoluteFile, targets);
  }

  const allowedCycles = allowedCycleKeys(baseline);
  for (const cycle of detectCycles(graph)) {
    const relativeCycle = cycle.map((file) => normalize(path.relative(rootDirectory, file)));
    if (!allowedCycles.has(canonicalCycle(relativeCycle))) {
      violations.push(`Circular source dependency: ${relativeCycle.join(' -> ')}`);
    }
  }

  if (violations.length > 0) throw new Error(violations.sort().join('\n'));

  const observations = absoluteFiles
    .map((file) =>
      sourceObservation(
        path.relative(rootDirectory, file),
        sourceByFile.get(file) ?? '',
        graph.get(file)?.size ?? 0,
      ),
    )
    .sort(
      (left, right) =>
        right.lines - left.lines ||
        right.dependencies - left.dependencies ||
        left.file.localeCompare(right.file),
    );

  return {
    files: absoluteFiles.length,
    edges: [...graph.values()].reduce((total, targets) => total + targets.size, 0),
    observations: observations.slice(0, OBSERVATION_LIMIT),
  };
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const result = await inspectSourceStructure();
  console.log(`Validated ${result.files} source files and ${result.edges} relative edges.`);
  if (result.observations.length > 0) {
    console.log('Largest source files (observation only; never a merge failure):');
    for (const observation of result.observations) {
      console.log(
        `- ${observation.file}: ${observation.lines} lines, ${observation.exports} exports, ${observation.dependencies} relative dependencies`,
      );
    }
  }
}
