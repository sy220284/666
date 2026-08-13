import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWED_DOUBLE_ASSERTIONS = new Map([
  ['apps/desktop/preload/src/task-bridge-factory.ts', 1],
  ['apps/desktop/main/src/ipc-handlers.ts', 1],
  ['apps/desktop/renderer/src/features/writing/continuation-persistence.ts', 1],
  ['apps/desktop/renderer/src/features/writing/writing-workbench.tsx', 1],
  ['packages/core-service/src/structure-operations/structure-operation-execution-service.ts', 1],
]);

async function sourceFiles(root, relativeDirectory) {
  const directory = path.join(root, relativeDirectory);
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const relative = path.posix.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) return sourceFiles(root, relative);
      return entry.isFile() && /\.(?:ts|tsx)$/u.test(entry.name) ? [relative] : [];
    }),
  );
  return nested.flat();
}

export function countDoubleAssertions(source) {
  return source.match(/\bas unknown as\b/gu)?.length ?? 0;
}

export async function inspectTypeAssertionPolicy(repositoryRoot = DEFAULT_ROOT) {
  const files = [
    ...(await sourceFiles(repositoryRoot, 'apps')),
    ...(await sourceFiles(repositoryRoot, 'packages')),
  ];
  const violations = [];
  let total = 0;

  for (const file of files) {
    const source = await readFile(path.join(repositoryRoot, file), 'utf8');
    const count = countDoubleAssertions(source);
    total += count;
    const allowed = ALLOWED_DOUBLE_ASSERTIONS.get(file) ?? 0;
    if (count !== allowed) {
      violations.push(`${file}: expected ${allowed} double assertions, found ${count}`);
    }
    if (
      file.startsWith('packages/core-service/src/') &&
      /\.all\([^;]*as unknown as/su.test(source)
    ) {
      violations.push(`${file}: SQLite .all() results must use sqliteResult()`);
    }
    if (
      file.startsWith('packages/core-service/src/') &&
      /\.get\([^;]*as unknown as/su.test(source)
    ) {
      violations.push(`${file}: SQLite .get() results must use sqliteResult()`);
    }
  }

  if (violations.length > 0) throw new Error(violations.sort().join('\n'));
  return { total, allowlistedFiles: ALLOWED_DOUBLE_ASSERTIONS.size };
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const result = await inspectTypeAssertionPolicy();
  console.log(
    `Type assertion policy passed: ${result.total} explicit boundary assertions across ${result.allowlistedFiles} reviewed files; SQLite rows use sqliteResult().`,
  );
}
