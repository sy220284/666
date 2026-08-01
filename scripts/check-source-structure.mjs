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
    (entry) => normalize(entry.from) === normalize(source) && normalize(entry.to) === normalize(target),
  );
  return allowed ? null : `${normalize(source)} may not depend on ${targetFeature} (${normalize(target)})`;
}

function lineCount(source) {
  if (source.length === 0) return 0;
  return source.split(/\r?\n/u).length;
}

export function validateLineBudget(file, lines, baseline) {
  const normalized = normalize(file);
  const exception = baseline.oversizedFiles[normalized];
  if (exception) {
    return lines > exception.maxLines
      ? `${normalized} has ${lines} lines; registered ${exception.workPackage} ceiling is ${exception.maxLines}`
      : null;
  }
  const kind = normalized.endsWith('.tsx') ? 'tsx' : 'ts';
  const ceiling = baseline.defaultMaxLines[kind];
  return lines > ceiling
    ? `${normalized} has ${lines} lines; unregistered ${kind.toUpperCase()} ceiling is ${ceiling}`
    : null;
}

function allowedCycleKeys(baseline) {
  return new Set(
    baseline.allowedCycles.map((cycle) =>
      canonicalCycle(cycle.map((value) => normalize(value))),
    ),
  );
}

async function loadBaseline(rootDirectory) {
  const source = await readFile(path.join(rootDirectory, BASELINE_PATH), 'utf8');
  const baseline = JSON.parse(source);
  if (baseline.schemaVersion !== 1) throw new Error('Unsupported source structure baseline');
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
  const violations = [];

  for (const absoluteFile of absoluteFiles) {
    const relativeFile = normalize(path.relative(rootDirectory, absoluteFile));
    const source = await readFile(absoluteFile, 'utf8');
    const lineViolation = validateLineBudget(relativeFile, lineCount(source), baseline);
    if (lineViolation) violations.push(lineViolation);

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
  return {
    files: absoluteFiles.length,
    edges: [...graph.values()].reduce((total, targets) => total + targets.size, 0),
    registeredOversizedFiles: Object.keys(baseline.oversizedFiles).length,
  };
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const result = await inspectSourceStructure();
  console.log(
    `Validated ${result.files} source files, ${result.edges} relative edges and ${result.registeredOversizedFiles} registered structural debts.`,
  );
}
