import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_MATRIX_PATH = 'docs/process/MUTATION_TEST_MATRIX.json';
const DEFAULT_REPORT_PATH = 'test-results/mutation/mutation-report.json';

export class MutationBaselineError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MutationBaselineError';
  }
}

export class MutationSurvivedError extends Error {
  constructor(mutantIds) {
    super(`Mutation test failed: ${mutantIds.join(', ')} survived.`);
    this.name = 'MutationSurvivedError';
    this.mutantIds = mutantIds;
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeRelativePath(value, label) {
  if (typeof value !== 'string' || value.length === 0 || path.isAbsolute(value)) {
    throw new TypeError(`${label} must be a non-empty repository-relative path.`);
  }
  const normalized = value.replaceAll('\\', '/');
  if (normalized.split('/').includes('..')) {
    throw new TypeError(`${label} must not escape the repository root.`);
  }
  return normalized;
}

export function validateMutationMatrix(value) {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.mutants)) {
    throw new TypeError('Mutation matrix must use schemaVersion 1 with a mutants array.');
  }
  if (value.mutants.length === 0) throw new TypeError('Mutation matrix must contain mutants.');

  const seenIds = new Set();
  return {
    schemaVersion: 1,
    mutants: value.mutants.map((candidate, index) => {
      if (!isRecord(candidate)) throw new TypeError(`Mutation entry ${index} must be an object.`);
      const { id, sourcePath, search, replacement, tests } = candidate;
      if (typeof id !== 'string' || !/^[a-z][a-z0-9-]+$/u.test(id)) {
        throw new TypeError(`Mutation entry ${index} has an invalid id.`);
      }
      if (seenIds.has(id)) throw new TypeError(`Mutation id ${id} is duplicated.`);
      seenIds.add(id);
      const normalizedSourcePath = safeRelativePath(sourcePath, `Mutation ${id} sourcePath`);
      if (typeof search !== 'string' || search.length === 0) {
        throw new TypeError(`Mutation ${id} search must be a non-empty string.`);
      }
      if (typeof replacement !== 'string' || replacement === search) {
        throw new TypeError(`Mutation ${id} replacement must differ from search.`);
      }
      if (!Array.isArray(tests) || tests.length === 0) {
        throw new TypeError(`Mutation ${id} must name at least one killer test.`);
      }
      const normalizedTests = tests.map((testPath) => {
        const normalized = safeRelativePath(testPath, `Mutation ${id} test`);
        if (!normalized.startsWith('tests/')) {
          throw new TypeError(`Mutation ${id} killer tests must live under tests/.`);
        }
        return normalized;
      });
      if (new Set(normalizedTests).size !== normalizedTests.length) {
        throw new TypeError(`Mutation ${id} contains duplicate killer tests.`);
      }
      return {
        id,
        sourcePath: normalizedSourcePath,
        search,
        replacement,
        tests: normalizedTests,
      };
    }),
  };
}

export function replaceExactlyOnce(source, search, replacement, mutantId = 'mutation') {
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`${mutantId}: mutation search text was not found.`);
  if (source.indexOf(search, first + search.length) >= 0) {
    throw new Error(`${mutantId}: mutation search text must occur exactly once.`);
  }
  return source.slice(0, first) + replacement + source.slice(first + search.length);
}

function absoluteRepositoryPath(repositoryRoot, relativePath) {
  const absolute = path.resolve(repositoryRoot, relativePath);
  const relative = path.relative(repositoryRoot, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path escapes repository root: ${relativePath}`);
  }
  return absolute;
}

function commandResult(result) {
  if (result.error) throw result.error;
  if (result.status === null) {
    throw new Error(
      `Mutation killer tests terminated without an exit code (${result.signal ?? 'unknown'}).`,
    );
  }
  return {
    exitCode: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function executeVitest(repositoryRoot, tests, mutantId) {
  const executable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  return commandResult(
    spawnSync(executable, ['exec', 'vitest', 'run', ...tests, '--no-file-parallelism'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: { ...process.env, WORLDFORGE_MUTATION_ID: mutantId },
      maxBuffer: 16 * 1024 * 1024,
    }),
  );
}

function diagnosticTail(result) {
  return `${result.stdout}\n${result.stderr}`.trim().slice(-4000);
}

export async function runMutationSuite({
  repositoryRoot = DEFAULT_ROOT,
  matrix,
  executeTests = (tests, mutantId) => executeVitest(repositoryRoot, tests, mutantId),
  reportPath = DEFAULT_REPORT_PATH,
  writeReport = true,
} = {}) {
  const resolvedMatrix = validateMutationMatrix(
    matrix ??
      JSON.parse(
        await readFile(absoluteRepositoryPath(repositoryRoot, DEFAULT_MATRIX_PATH), 'utf8'),
      ),
  );
  const baselineTests = [...new Set(resolvedMatrix.mutants.flatMap((mutant) => mutant.tests))];
  const baseline = await executeTests(baselineTests, 'baseline');
  if (baseline.exitCode !== 0) {
    throw new MutationBaselineError(
      `Mutation baseline killer tests must pass before mutation.\n${diagnosticTail(baseline)}`,
    );
  }

  const results = [];
  for (const mutant of resolvedMatrix.mutants) {
    const sourcePath = absoluteRepositoryPath(repositoryRoot, mutant.sourcePath);
    const original = await readFile(sourcePath, 'utf8');
    const mutated = replaceExactlyOnce(original, mutant.search, mutant.replacement, mutant.id);
    let execution;
    await writeFile(sourcePath, mutated, 'utf8');
    try {
      execution = await executeTests(mutant.tests, mutant.id);
    } finally {
      await writeFile(sourcePath, original, 'utf8');
    }
    const restored = await readFile(sourcePath, 'utf8');
    if (restored !== original) throw new Error(`${mutant.id}: source restoration failed.`);
    const killed = execution.exitCode !== 0;
    results.push({
      id: mutant.id,
      sourcePath: mutant.sourcePath,
      tests: mutant.tests,
      outcome: killed ? 'killed' : 'survived',
      exitCode: execution.exitCode,
    });
    const label = killed ? 'KILLED' : 'SURVIVED';
    console.log(`[mutation] ${label} ${mutant.id}`);
    if (!killed) console.error(diagnosticTail(execution));
  }

  const report = {
    schemaVersion: 1,
    baselineTests,
    mutants: results,
    killed: results.filter((entry) => entry.outcome === 'killed').length,
    survived: results.filter((entry) => entry.outcome === 'survived').length,
  };
  if (writeReport) {
    const absoluteReportPath = absoluteRepositoryPath(repositoryRoot, reportPath);
    await mkdir(path.dirname(absoluteReportPath), { recursive: true });
    await writeFile(absoluteReportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  const survivors = results
    .filter((entry) => entry.outcome === 'survived')
    .map((entry) => entry.id);
  if (survivors.length > 0) throw new MutationSurvivedError(survivors);
  return report;
}

const invokedDirectly = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (invokedDirectly) {
  runMutationSuite().catch((error) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exitCode = 1;
  });
}
