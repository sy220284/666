import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEST_ROOT = 'tests';
const BASELINE_PATH = 'tests/test-quality-baseline.json';

const HARD_RULES = [
  {
    id: 'focused-or-skipped-test',
    description: 'Focused, skipped or todo tests are forbidden in committed suites.',
    pattern: /\b(?:describe|it|test)\.(?:only|skip|todo)\s*\(/gu,
  },
  {
    id: 'vacuous-boolean-assertion',
    description: 'Literal boolean assertions do not verify production behavior.',
    pattern:
      /expect\(\s*(true|false)\s*\)\s*\.\s*(?:toBe|toEqual)\(\s*\1\s*\)/gu,
  },
  {
    id: 'empty-test-body',
    description: 'Empty test bodies create a false green signal.',
    pattern:
      /\b(?:it|test)\(\s*(['"`])[^\n]*?\1\s*,\s*(?:async\s*)?\(\s*\)\s*=>\s*\{\s*\}\s*\)/gu,
  },
  {
    id: 'pass-through-schema-mock',
    description: 'Contract schemas must not be replaced by parse functions that return input unchanged.',
    pattern:
      /\b[A-Za-z_$][\w$]*Schema\s*:\s*\{\s*parse\s*:\s*\([^)]*\)\s*=>\s*[A-Za-z_$][\w$]*\s*\}/gu,
  },
  {
    id: 'weak-handler-count-assertion',
    description: 'Handler surface tests must assert exact channels rather than a minimum map size.',
    pattern: /handlers\.size\)\s*\.\s*toBeGreaterThan(?:OrEqual)?\s*\(/gu,
  },
];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(absolute)));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

function relative(repositoryRoot, absolutePath) {
  return path.relative(repositoryRoot, absolutePath).split(path.sep).join('/');
}

function lineNumber(content, offset) {
  return content.slice(0, offset).split('\n').length;
}

function count(content, pattern) {
  return [...content.matchAll(pattern)].length;
}

function stableObject(object) {
  return Object.fromEntries(Object.entries(object).sort(([left], [right]) => left.localeCompare(right)));
}

export async function auditTests({ repositoryRoot = DEFAULT_ROOT } = {}) {
  const testsRoot = path.join(repositoryRoot, TEST_ROOT);
  const allFiles = await walk(testsRoot);
  const sourceFiles = allFiles.filter((file) => /\.(?:ts|tsx|mjs|js)$/u.test(file));
  const testFiles = sourceFiles.filter((file) => /\.(?:test|spec)\.(?:ts|tsx|mjs|js)$/u.test(file));
  const baseline = JSON.parse(
    await readFile(path.join(repositoryRoot, BASELINE_PATH), 'utf8'),
  );
  if (baseline.schemaVersion !== 1 || typeof baseline.unsafeTypeEscapes !== 'object') {
    throw new Error('Invalid test quality baseline.');
  }

  const violations = [];
  const unsafeTypeEscapes = {};
  const metrics = {
    files: testFiles.length,
    sourceFiles: sourceFiles.length,
    assertions: 0,
    partialAssertions: 0,
    mocks: 0,
    arbitrarySleeps: 0,
    longFiles: [],
  };

  for (const absolutePath of sourceFiles) {
    const file = relative(repositoryRoot, absolutePath);
    const content = await readFile(absolutePath, 'utf8');
    const unsafeCount = count(content, /\bas\s+never\b/gu);
    if (unsafeCount > 0) unsafeTypeEscapes[file] = unsafeCount;

    for (const rule of HARD_RULES) {
      for (const match of content.matchAll(rule.pattern)) {
        violations.push({
          file,
          line: lineNumber(content, match.index ?? 0),
          rule: rule.id,
          description: rule.description,
        });
      }
    }

    if (/\.(?:test|spec)\.(?:ts|tsx|mjs|js)$/u.test(file)) {
      const lineCount = content.split('\n').length;
      if (lineCount > 500) metrics.longFiles.push({ file, lines: lineCount });
      metrics.assertions += count(content, /\bexpect\s*\(/gu);
      metrics.partialAssertions += count(content, /\.toMatchObject\s*\(/gu);
      metrics.mocks += count(content, /\bvi\.mock\s*\(/gu);
      metrics.arbitrarySleeps += count(
        content,
        /new\s+Promise\s*\([^)]*=>\s*setTimeout\s*\(/gu,
      );
      if (!/\b(?:it|test)\s*\(/u.test(content)) {
        violations.push({
          file,
          line: 1,
          rule: 'test-file-without-test-case',
          description: 'Files named as tests must contain at least one it() or test() case.',
        });
      }
      if (!/\bexpect\s*\(/u.test(content)) {
        violations.push({
          file,
          line: 1,
          rule: 'test-file-without-assertion',
          description: 'Files named as tests must contain at least one explicit assertion.',
        });
      }
    }
  }

  const expectedUnsafe = stableObject(baseline.unsafeTypeEscapes);
  const actualUnsafe = stableObject(unsafeTypeEscapes);
  if (JSON.stringify(expectedUnsafe) !== JSON.stringify(actualUnsafe)) {
    violations.push({
      file: BASELINE_PATH,
      line: 1,
      rule: 'unsafe-type-escape-baseline-mismatch',
      description: `Unsafe type escape baseline must exactly match current occurrences. Suggested value: ${JSON.stringify(actualUnsafe, null, 2)}`,
    });
  }

  metrics.longFiles.sort((left, right) => right.lines - left.lines || left.file.localeCompare(right.file));
  return { violations, metrics, unsafeTypeEscapes: actualUnsafe };
}

function printReport(result) {
  const { metrics, violations } = result;
  console.log(`Test files: ${metrics.files}`);
  console.log(`Test support source files: ${metrics.sourceFiles}`);
  console.log(`Assertions: ${metrics.assertions}`);
  console.log(`Partial assertions: ${metrics.partialAssertions}`);
  console.log(`Module mocks: ${metrics.mocks}`);
  console.log(`Arbitrary sleeps: ${metrics.arbitrarySleeps}`);
  if (metrics.longFiles.length > 0) {
    console.log('Files over 500 lines:');
    for (const entry of metrics.longFiles) console.log(`- ${entry.file}: ${entry.lines}`);
  }
  if (violations.length === 0) {
    console.log('Test quality audit passed.');
    return;
  }
  console.error(`Test quality audit failed with ${violations.length} violation(s):`);
  for (const violation of violations) {
    console.error(`- ${violation.file}:${violation.line} [${violation.rule}] ${violation.description}`);
  }
}

const invokedDirectly = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (invokedDirectly) {
  const result = await auditTests();
  printReport(result);
  if (result.violations.length > 0) process.exitCode = 1;
}
