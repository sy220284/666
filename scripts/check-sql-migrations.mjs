import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATION_ROOTS = ['migrations/app', 'migrations/project'];
const MIGRATION_NAME = /^(?<version>\d{4})_[a-z0-9_]+\.sql$/u;
const ALLOW_UNSCOPED_WRITE = '-- migration-policy: allow-unscoped-write';
const FROZEN_UNSCOPED_WRITE_CUTOFF = new Map([
  ['migrations/app', 2],
  ['migrations/project', 29],
]);

function statements(source) {
  return source
    .replace(/--[^\r\n]*/gu, '')
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

export function validateMigrationSource(
  source,
  { allowHistoricalUnscopedWrites = false } = {},
) {
  const violations = [];
  if (!source.endsWith('\n')) violations.push('must end with a newline');
  if (source.includes('\r')) violations.push('must use LF line endings');
  if (/\t/u.test(source)) violations.push('must not contain tab indentation');

  const allowUnscopedWrite =
    allowHistoricalUnscopedWrites || source.includes(ALLOW_UNSCOPED_WRITE);
  for (const statement of statements(source)) {
    if (/^DELETE\s+FROM\s+["`\[]?[A-Za-z_][\w$]*["`\]]?$/iu.test(statement)) {
      if (!allowUnscopedWrite) {
        violations.push(`unscoped DELETE requires ${ALLOW_UNSCOPED_WRITE}`);
      }
    }
    if (/^UPDATE\s+["`\[]?[A-Za-z_][\w$]*["`\]]?\s+SET\s+/iu.test(statement)) {
      if (!/\bWHERE\b/iu.test(statement) && !allowUnscopedWrite) {
        violations.push(`unscoped UPDATE requires ${ALLOW_UNSCOPED_WRITE}`);
      }
    }
  }
  return violations;
}

async function listMigrationFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => path.join(directory, entry.name))
    .sort();
}

export async function inspectSqlMigrations(repositoryRoot = DEFAULT_ROOT) {
  const violations = [];
  let fileCount = 0;
  for (const migrationRoot of MIGRATION_ROOTS) {
    const directory = path.join(repositoryRoot, migrationRoot);
    const versions = new Map();
    const frozenCutoff = FROZEN_UNSCOPED_WRITE_CUTOFF.get(migrationRoot) ?? 0;
    for (const file of await listMigrationFiles(directory)) {
      fileCount += 1;
      const name = path.basename(file);
      const relative = path.relative(repositoryRoot, file).split(path.sep).join('/');
      const match = MIGRATION_NAME.exec(name);
      if (!match?.groups?.version) {
        violations.push(`${relative}: filename must match NNNN_lower_snake_case.sql`);
        continue;
      }
      const version = Number(match.groups.version);
      const previous = versions.get(match.groups.version);
      if (previous) {
        violations.push(`${relative}: migration version duplicates ${previous}`);
      } else {
        versions.set(match.groups.version, relative);
      }
      const source = await readFile(file, 'utf8');
      for (const violation of validateMigrationSource(source, {
        allowHistoricalUnscopedWrites: version <= frozenCutoff,
      })) {
        violations.push(`${relative}: ${violation}`);
      }
    }
  }
  if (violations.length > 0) throw new Error(violations.sort().join('\n'));
  return fileCount;
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const files = await inspectSqlMigrations();
  console.log(
    `Validated ${files} SQL migration files; frozen historical backfills remain read-only and new unscoped writes require review annotations.`,
  );
}
