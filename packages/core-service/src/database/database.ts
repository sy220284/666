import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { RequestIdSchema } from '@worldforge/contracts';

import {
  applyPendingMigrations,
  inspectMigrations,
  normalizeMigrations,
  type MigrationInspection,
} from './migrations.js';
import {
  DatabaseFoundationError,
  type DatabaseCompatibility,
  type DatabaseErrorCode,
  type DatabaseKind,
  type DatabaseMode,
  type DatabaseReadOperation,
  type DatabaseWriteOperation,
  type ForeignKeyViolation,
  type IdempotentWriteResult,
  type IntegrityReport,
  type OpenDatabaseOptions,
  type SqliteCapabilities,
  type WalCheckpointResult,
} from './types.js';
import { SerializedWriteQueue } from './write-queue.js';

interface OpenedDatabaseState {
  readonly kind: DatabaseKind;
  readonly mode: DatabaseMode;
  readonly compatibility: DatabaseCompatibility;
  readonly schemaVersion: number;
  readonly capabilities: SqliteCapabilities;
  readonly lastErrorCode?: DatabaseErrorCode;
  readonly reader: DatabaseSync;
  readonly writer?: DatabaseSync;
}

const systemClock = { now: () => new Date() };

function numberValue(value: unknown): number {
  return typeof value === 'bigint' ? Number(value) : Number(value ?? 0);
}

function pragmaMessages(
  database: DatabaseSync,
  pragma: 'quick_check' | 'integrity_check',
): string[] {
  return database
    .prepare(`PRAGMA ${pragma}`)
    .all()
    .map((row) => String(Object.values(row)[0] ?? 'unknown'));
}

function integrityReport(
  database: DatabaseSync,
  pragma: 'quick_check' | 'integrity_check',
): IntegrityReport {
  const messages = pragmaMessages(database, pragma);
  return { ok: messages.length === 1 && messages[0] === 'ok', messages };
}

function configureWriter(database: DatabaseSync): void {
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA synchronous = NORMAL;
  `);
}

function configureReader(database: DatabaseSync): void {
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA synchronous = NORMAL;
    PRAGMA query_only = ON;
  `);
}

function detectCapabilities(database: DatabaseSync): SqliteCapabilities {
  const fts5 =
    numberValue(
      database.prepare("SELECT sqlite_compileoption_used('ENABLE_FTS5') AS enabled").get()?.enabled,
    ) === 1;
  if (!fts5) return { fts5: false, trigram: false };

  const capabilityDatabase = new DatabaseSync(':memory:', {
    allowExtension: false,
    enableForeignKeyConstraints: true,
  });
  try {
    capabilityDatabase.exec(
      "CREATE VIRTUAL TABLE temp.__worldforge_trigram_probe USING fts5(value, tokenize='trigram')",
    );
    capabilityDatabase.exec('DROP TABLE temp.__worldforge_trigram_probe');
    return { fts5: true, trigram: true };
  } catch {
    return { fts5: true, trigram: false };
  } finally {
    capabilityDatabase.close();
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function openReader(filePath: string): DatabaseSync {
  const reader = new DatabaseSync(filePath, {
    readOnly: true,
    timeout: 5_000,
    enableForeignKeyConstraints: true,
    allowExtension: false,
    readBigInts: true,
  });
  configureReader(reader);
  return reader;
}

async function openDatabaseState(
  kind: DatabaseKind,
  options: OpenDatabaseOptions,
): Promise<OpenedDatabaseState> {
  const migrations = normalizeMigrations(options.migrations, kind);
  if (options.path === ':memory:') {
    throw new DatabaseFoundationError(
      'DATABASE_OPEN_FAILED',
      'The production database foundation requires a file-backed SQLite database.',
    );
  }

  const exists = await fileExists(options.path);
  if (exists) {
    const probe = openReader(options.path);
    const quickCheck = integrityReport(probe, 'quick_check');
    if (!quickCheck.ok) {
      return {
        kind,
        mode: 'read-only',
        compatibility: 'integrity-failed',
        schemaVersion: 0,
        capabilities: detectCapabilities(probe),
        lastErrorCode: 'DATABASE_INTEGRITY_FAILED',
        reader: probe,
      };
    }

    let inspection: MigrationInspection;
    try {
      inspection = inspectMigrations(probe, migrations);
    } catch (error) {
      if (error instanceof DatabaseFoundationError && error.code === 'MIGRATION_HISTORY_INVALID') {
        return {
          kind,
          mode: 'read-only',
          compatibility: 'integrity-failed',
          schemaVersion: 0,
          capabilities: detectCapabilities(probe),
          lastErrorCode: error.code,
          reader: probe,
        };
      }
      probe.close();
      throw error;
    }
    if (inspection.status === 'future-schema' || inspection.status === 'checksum-mismatch') {
      return {
        kind,
        mode: 'read-only',
        compatibility: inspection.status,
        schemaVersion: inspection.schemaVersion,
        capabilities: detectCapabilities(probe),
        lastErrorCode:
          inspection.status === 'future-schema'
            ? 'DATABASE_FUTURE_SCHEMA'
            : 'MIGRATION_CHECKSUM_MISMATCH',
        reader: probe,
      };
    }
    probe.close();
  } else {
    await mkdir(path.dirname(options.path), { recursive: true, mode: 0o700 });
  }

  const writer = new DatabaseSync(options.path, {
    timeout: 5_000,
    enableForeignKeyConstraints: true,
    allowExtension: false,
    readBigInts: true,
  });

  let writerCapabilities: SqliteCapabilities | undefined;
  let migrationStartVersion = 0;
  try {
    configureWriter(writer);
    const capabilities = detectCapabilities(writer);
    writerCapabilities = capabilities;
    if (!capabilities.trigram) {
      throw new DatabaseFoundationError(
        'SQLITE_TRIGRAM_UNAVAILABLE',
        'SQLite FTS5 trigram support is required.',
      );
    }

    const inspection = inspectMigrations(writer, migrations);
    migrationStartVersion = inspection.schemaVersion;
    const targetVersion = migrations.at(-1)?.version ?? 0;
    if (inspection.status === 'migration-required' && inspection.schemaVersion > 0) {
      if (!options.prepareRecoveryPoint) {
        throw new DatabaseFoundationError(
          'MIGRATION_RECOVERY_POINT_REQUIRED',
          'An existing database must have a recovery point before migration.',
        );
      }
      try {
        await options.prepareRecoveryPoint({
          kind,
          databasePath: options.path,
          fromVersion: inspection.schemaVersion,
          toVersion: targetVersion,
        });
      } catch (error) {
        throw new DatabaseFoundationError(
          'MIGRATION_RECOVERY_POINT_FAILED',
          'The pre-migration recovery point could not be created.',
          { cause: error },
        );
      }
    }
    const appliedCount = applyPendingMigrations(writer, migrations, inspection, {
      appVersion: options.appVersion,
      clock: options.clock ?? systemClock,
      ...(options.faultInjector ? { faultInjector: options.faultInjector } : {}),
    });
    const quickCheck = integrityReport(writer, 'quick_check');
    const foreignKeyRows = writer.prepare('PRAGMA foreign_key_check').all();
    if (!quickCheck.ok || foreignKeyRows.length > 0) {
      writer.close();
      const reader = openReader(options.path);
      return {
        kind,
        mode: 'read-only',
        compatibility: 'integrity-failed',
        schemaVersion: targetVersion,
        capabilities,
        lastErrorCode: 'DATABASE_INTEGRITY_FAILED',
        reader,
      };
    }

    const reader = openReader(options.path);
    return {
      kind,
      mode: 'read-write',
      compatibility: appliedCount > 0 ? 'migrated' : 'current',
      schemaVersion: targetVersion,
      capabilities,
      reader,
      writer,
    };
  } catch (error) {
    if (writer.isOpen) writer.close();
    if (error instanceof DatabaseFoundationError && error.code === 'MIGRATION_FAILED') {
      const reader = openReader(options.path);
      return {
        kind,
        mode: 'read-only',
        compatibility: 'migration-failed',
        schemaVersion: migrationStartVersion,
        capabilities: writerCapabilities ?? detectCapabilities(reader),
        lastErrorCode: error.code,
        reader,
      };
    }
    if (error instanceof DatabaseFoundationError) throw error;
    throw new DatabaseFoundationError(
      'DATABASE_OPEN_FAILED',
      'The SQLite database could not be opened safely.',
      { cause: error },
    );
  }
}

function checkpointRaw(database: DatabaseSync, mode: 'PASSIVE' | 'FULL' | 'TRUNCATE') {
  const row = database.prepare(`PRAGMA wal_checkpoint(${mode})`).get();
  return {
    busy: numberValue(row?.busy),
    logFrames: numberValue(row?.log),
    checkpointedFrames: numberValue(row?.checkpointed),
  } satisfies WalCheckpointResult;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    'then' in value &&
    typeof value.then === 'function'
  );
}

export abstract class ManagedDatabase {
  readonly kind: DatabaseKind;
  readonly mode: DatabaseMode;
  readonly compatibility: DatabaseCompatibility;
  readonly schemaVersion: number;
  readonly capabilities: SqliteCapabilities;
  readonly lastErrorCode: DatabaseErrorCode | null;
  readonly #reader: DatabaseSync;
  readonly #writer: DatabaseSync | undefined;
  readonly #queue: SerializedWriteQueue | undefined;
  readonly #idempotentResults = new Map<string, Promise<unknown>>();
  #closed = false;

  protected constructor(state: OpenedDatabaseState) {
    this.kind = state.kind;
    this.mode = state.mode;
    this.compatibility = state.compatibility;
    this.schemaVersion = state.schemaVersion;
    this.capabilities = state.capabilities;
    this.lastErrorCode = state.lastErrorCode ?? null;
    this.#reader = state.reader;
    this.#writer = state.writer;
    this.#queue = state.writer ? new SerializedWriteQueue() : undefined;
  }

  read<T>(operation: DatabaseReadOperation<T>): T {
    this.#assertOpen();
    return operation(this.#reader);
  }

  async write<T>(
    requestId: string,
    operation: DatabaseWriteOperation<T>,
  ): Promise<IdempotentWriteResult<T>> {
    this.#assertOpen();
    if (!RequestIdSchema.safeParse(requestId).success) {
      throw new DatabaseFoundationError('REQUEST_ID_INVALID', 'A valid requestId is required.');
    }
    const writer = this.#writer;
    const queue = this.#queue;
    if (!writer || !queue) {
      throw new DatabaseFoundationError(
        'DATABASE_READ_ONLY',
        'The database is open in read-only compatibility mode.',
      );
    }

    const existing = this.#idempotentResults.get(requestId);
    if (existing) {
      return { value: (await existing) as T, replayed: true };
    }

    const result = queue.enqueue(() => this.#transaction(writer, operation));
    this.#idempotentResults.set(requestId, result);
    try {
      const value = await result;
      while (this.#idempotentResults.size > 1_000) {
        const oldest = this.#idempotentResults.keys().next().value;
        if (typeof oldest !== 'string') break;
        this.#idempotentResults.delete(oldest);
      }
      return { value, replayed: false };
    } catch (error) {
      if (this.#idempotentResults.get(requestId) === result) {
        this.#idempotentResults.delete(requestId);
      }
      throw error;
    }
  }

  quickCheck(): IntegrityReport {
    this.#assertOpen();
    return integrityReport(this.#reader, 'quick_check');
  }

  integrityCheck(): IntegrityReport {
    this.#assertOpen();
    return integrityReport(this.#reader, 'integrity_check');
  }

  foreignKeyCheck(): readonly ForeignKeyViolation[] {
    this.#assertOpen();
    return this.#reader
      .prepare('PRAGMA foreign_key_check')
      .all()
      .map((row) => ({
        table: String(row.table),
        rowId: typeof row.rowid === 'bigint' || typeof row.rowid === 'number' ? row.rowid : null,
        parent: String(row.parent),
        foreignKeyId: typeof row.fkid === 'bigint' || typeof row.fkid === 'number' ? row.fkid : 0,
      }));
  }

  async checkpoint(
    mode: 'PASSIVE' | 'FULL' | 'TRUNCATE' = 'PASSIVE',
  ): Promise<WalCheckpointResult> {
    this.#assertOpen();
    const writer = this.#writer;
    const queue = this.#queue;
    if (!writer || !queue) {
      throw new DatabaseFoundationError(
        'DATABASE_READ_ONLY',
        'A read-only database cannot checkpoint.',
      );
    }
    return queue.enqueue(() => checkpointRaw(writer, mode));
  }

  async drain(): Promise<void> {
    await this.#queue?.drain();
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    await this.#queue?.close();
    this.#reader.close();
    try {
      if (this.#writer) checkpointRaw(this.#writer, 'TRUNCATE');
    } finally {
      if (this.#writer?.isOpen) this.#writer.close();
      this.#closed = true;
      this.#idempotentResults.clear();
    }
  }

  #transaction<T>(writer: DatabaseSync, operation: DatabaseWriteOperation<T>): T {
    writer.exec('BEGIN IMMEDIATE');
    try {
      const value = operation(writer);
      if (isPromiseLike(value)) {
        throw new DatabaseFoundationError(
          'DATABASE_WRITE_FAILED',
          'Database write operations must finish synchronously inside their transaction.',
        );
      }
      writer.exec('COMMIT');
      return value;
    } catch (error) {
      if (writer.isTransaction) writer.exec('ROLLBACK');
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        typeof error.code === 'string' &&
        error.code.startsWith('ERR_SQLITE')
      ) {
        throw new DatabaseFoundationError(
          'DATABASE_WRITE_FAILED',
          'The database write failed and was rolled back.',
          { cause: error },
        );
      }
      throw error;
    }
  }

  #assertOpen(): void {
    if (this.#closed) {
      throw new DatabaseFoundationError('DATABASE_CLOSED', 'The database is already closed.');
    }
  }
}

export class AppDatabase extends ManagedDatabase {
  static async open(options: OpenDatabaseOptions): Promise<AppDatabase> {
    return new AppDatabase(await openDatabaseState('app', options));
  }

  private constructor(state: OpenedDatabaseState) {
    super(state);
  }
}

export class ProjectDatabase extends ManagedDatabase {
  static async open(options: OpenDatabaseOptions): Promise<ProjectDatabase> {
    return new ProjectDatabase(await openDatabaseState('project', options));
  }

  private constructor(state: OpenedDatabaseState) {
    super(state);
  }
}
