import type { DatabaseSync } from 'node:sqlite';

export type DatabaseKind = 'app' | 'project';
export type DatabaseMode = 'read-write' | 'read-only';
export type DatabaseCompatibility =
  | 'current'
  | 'migrated'
  | 'migration-failed'
  | 'future-schema'
  | 'checksum-mismatch'
  | 'integrity-failed';

export type DatabaseErrorCode =
  | 'DATABASE_OPEN_FAILED'
  | 'DATABASE_READ_ONLY'
  | 'DATABASE_CLOSED'
  | 'DATABASE_WRITE_FAILED'
  | 'DATABASE_INTEGRITY_FAILED'
  | 'DATABASE_FUTURE_SCHEMA'
  | 'SQLITE_TRIGRAM_UNAVAILABLE'
  | 'WRITE_QUEUE_CLOSED'
  | 'REQUEST_ID_INVALID'
  | 'MIGRATION_SEQUENCE_INVALID'
  | 'MIGRATION_HISTORY_INVALID'
  | 'MIGRATION_CHECKSUM_MISMATCH'
  | 'MIGRATION_RECOVERY_POINT_REQUIRED'
  | 'MIGRATION_RECOVERY_POINT_FAILED'
  | 'MIGRATION_FAILED';

export class DatabaseFoundationError extends Error {
  readonly code: DatabaseErrorCode;

  constructor(code: DatabaseErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DatabaseFoundationError';
    this.code = code;
  }
}

export interface SqlMigration {
  readonly kind: DatabaseKind;
  readonly version: number;
  readonly name: string;
  readonly checksum: string;
  readonly sql: string;
}

export type MigrationFaultStage = 'before-sql' | 'after-sql' | 'after-record-before-commit';

export interface MigrationFaultContext {
  readonly version: number;
  readonly stage: MigrationFaultStage;
}

export type MigrationFaultInjector = (context: MigrationFaultContext) => void;

export interface DatabaseClock {
  now(): Date;
}

export interface MigrationRecoveryContext {
  readonly kind: DatabaseKind;
  readonly databasePath: string;
  readonly fromVersion: number;
  readonly toVersion: number;
}

export interface OpenDatabaseOptions {
  readonly path: string;
  readonly migrations: readonly SqlMigration[];
  readonly appVersion: string;
  readonly clock?: DatabaseClock;
  readonly faultInjector?: MigrationFaultInjector;
  readonly prepareRecoveryPoint?: (context: MigrationRecoveryContext) => Promise<void>;
}

export interface SqliteCapabilities {
  readonly fts5: boolean;
  readonly trigram: boolean;
}

export interface IntegrityReport {
  readonly ok: boolean;
  readonly messages: readonly string[];
}

export interface ForeignKeyViolation {
  readonly table: string;
  readonly rowId: number | bigint | null;
  readonly parent: string;
  readonly foreignKeyId: number | bigint;
}

export interface WalCheckpointResult {
  readonly busy: number;
  readonly logFrames: number;
  readonly checkpointedFrames: number;
}

export interface IdempotentWriteResult<T> {
  readonly value: T;
  readonly replayed: boolean;
}

export type DatabaseReadOperation<T> = (connection: DatabaseSync) => T;
export type DatabaseWriteOperation<T> = (connection: DatabaseSync) => T;
