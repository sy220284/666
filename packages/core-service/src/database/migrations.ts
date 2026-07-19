import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import {
  DatabaseFoundationError,
  type DatabaseClock,
  type DatabaseKind,
  type MigrationFaultInjector,
  type SqlMigration,
} from './types.js';

interface AppliedMigration {
  readonly version: number;
  readonly name: string;
  readonly checksum: string;
}

export interface MigrationInspection {
  readonly status: 'current' | 'migration-required' | 'future-schema' | 'checksum-mismatch';
  readonly schemaVersion: number;
  readonly applied: readonly AppliedMigration[];
}

const migrationFilePattern = /^(\d{4})_([a-z0-9_]+)\.sql$/;

export function defineMigration(
  kind: DatabaseKind,
  version: number,
  name: string,
  sql: string,
): SqlMigration {
  return {
    kind,
    version,
    name,
    sql,
    checksum: createHash('sha256').update(sql, 'utf8').digest('hex'),
  };
}

export function normalizeMigrations(
  migrations: readonly SqlMigration[],
  expectedKind?: DatabaseKind,
): readonly SqlMigration[] {
  const normalized = [...migrations].sort((left, right) => left.version - right.version);
  for (const [index, migration] of normalized.entries()) {
    const expectedVersion = index + 1;
    const computedChecksum = createHash('sha256').update(migration.sql, 'utf8').digest('hex');
    if (
      migration.version !== expectedVersion ||
      (expectedKind !== undefined && migration.kind !== expectedKind) ||
      !Number.isSafeInteger(migration.version) ||
      migration.version < 1 ||
      !/^[a-z0-9_]+$/.test(migration.name) ||
      !/^[a-f0-9]{64}$/.test(migration.checksum) ||
      migration.checksum !== computedChecksum ||
      /\b(?:BEGIN|COMMIT|ROLLBACK|VACUUM|ATTACH|DETACH)\b/i.test(migration.sql)
    ) {
      throw new DatabaseFoundationError(
        'MIGRATION_SEQUENCE_INVALID',
        `Migration sequence is invalid at version ${migration.version}.`,
      );
    }
  }
  return normalized;
}

export function latestMigrationVersion(migrations: readonly SqlMigration[]): number {
  return normalizeMigrations(migrations).at(-1)?.version ?? 0;
}

export async function loadMigrations(
  directory: string,
  kind: DatabaseKind,
): Promise<readonly SqlMigration[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const migrations: SqlMigration[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.sql')) continue;
    const match = migrationFilePattern.exec(entry.name);
    if (!match?.[1] || !match[2]) {
      throw new DatabaseFoundationError(
        'MIGRATION_SEQUENCE_INVALID',
        'A migration filename does not match NNNN_short_description.sql.',
      );
    }
    const sql = await readFile(path.join(directory, entry.name), 'utf8');
    migrations.push(defineMigration(kind, Number(match[1]), match[2], sql));
  }
  return normalizeMigrations(migrations);
}

function hasMigrationTable(database: DatabaseSync): boolean {
  const row = database
    .prepare(
      "SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
    )
    .get();
  return Number(row?.count ?? 0) === 1;
}

function readAppliedMigrations(database: DatabaseSync): readonly AppliedMigration[] {
  if (!hasMigrationTable(database)) return [];
  return database
    .prepare('SELECT version, name, checksum FROM schema_migrations ORDER BY version')
    .all()
    .map((row) => ({
      version: Number(row.version),
      name: String(row.name),
      checksum: String(row.checksum),
    }));
}

export function inspectMigrations(
  database: DatabaseSync,
  migrations: readonly SqlMigration[],
): MigrationInspection {
  const applied = readAppliedMigrations(database);
  const schemaVersion = applied.at(-1)?.version ?? 0;
  const supportedVersion = migrations.at(-1)?.version ?? 0;

  if (schemaVersion > supportedVersion) {
    return { status: 'future-schema', schemaVersion, applied };
  }

  for (const [index, record] of applied.entries()) {
    if (record.version !== index + 1) {
      throw new DatabaseFoundationError(
        'MIGRATION_HISTORY_INVALID',
        'Applied migration history contains a version gap.',
      );
    }
  }

  for (const record of applied) {
    const expected = migrations[record.version - 1];
    if (!expected || expected.name !== record.name || expected.checksum !== record.checksum) {
      return { status: 'checksum-mismatch', schemaVersion, applied };
    }
  }

  return {
    status: schemaVersion === supportedVersion ? 'current' : 'migration-required',
    schemaVersion,
    applied,
  };
}

const migrationMetadataSql = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL,
    app_version TEXT NOT NULL
  ) STRICT;
`;

export function applyPendingMigrations(
  database: DatabaseSync,
  migrations: readonly SqlMigration[],
  inspection: MigrationInspection,
  options: {
    readonly appVersion: string;
    readonly clock: DatabaseClock;
    readonly faultInjector?: MigrationFaultInjector;
  },
): number {
  let appliedCount = 0;
  for (const migration of migrations.slice(inspection.schemaVersion)) {
    try {
      database.exec('BEGIN IMMEDIATE');
      database.exec(migrationMetadataSql);
      options.faultInjector?.({ version: migration.version, stage: 'before-sql' });
      database.exec(migration.sql);
      options.faultInjector?.({ version: migration.version, stage: 'after-sql' });
      database
        .prepare(
          `INSERT INTO schema_migrations(version, name, checksum, applied_at, app_version)
           VALUES(?, ?, ?, ?, ?)`,
        )
        .run(
          migration.version,
          migration.name,
          migration.checksum,
          options.clock.now().toISOString(),
          options.appVersion,
        );
      options.faultInjector?.({
        version: migration.version,
        stage: 'after-record-before-commit',
      });
      database.exec('COMMIT');
      appliedCount += 1;
    } catch (error) {
      if (database.isTransaction) database.exec('ROLLBACK');
      throw new DatabaseFoundationError(
        'MIGRATION_FAILED',
        `Migration ${migration.version} failed and was rolled back.`,
        { cause: error },
      );
    }
  }
  return appliedCount;
}
