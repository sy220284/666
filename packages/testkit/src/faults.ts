import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

import type {
  DatabaseWriteOperation,
  MigrationFaultContext,
  MigrationFaultStage,
} from '@worldforge/core-service';

export type FaultKind =
  'migration' | 'transaction-interrupted' | 'sqlite-busy' | 'sqlite-full' | 'sqlite-corrupt';

export class FaultInjectionError extends Error {
  readonly fault: FaultKind;

  constructor(fault: FaultKind, message: string) {
    super(message);
    this.name = 'FaultInjectionError';
    this.fault = fault;
  }
}

export interface MigrationFaultTarget {
  readonly version: number;
  readonly stage: MigrationFaultStage;
}

export function failMigrationAt(target: MigrationFaultTarget) {
  return (context: MigrationFaultContext): void => {
    if (context.version === target.version && context.stage === target.stage) {
      throw new FaultInjectionError(
        'migration',
        `FAULT_INJECTED_MIGRATION_${target.version}_${target.stage}`,
      );
    }
  };
}

export function failTransactionAfter<T>(
  operation: DatabaseWriteOperation<T>,
): DatabaseWriteOperation<never> {
  return (connection): never => {
    operation(connection);
    throw new FaultInjectionError(
      'transaction-interrupted',
      'FAULT_INJECTED_TRANSACTION_INTERRUPTED',
    );
  };
}

function sqliteErrorNumber(error: unknown): number | undefined {
  if (!error || typeof error !== 'object' || !('errcode' in error)) return undefined;
  const value = error.errcode;
  return typeof value === 'number' ? value : undefined;
}

function sqliteErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isSqliteBusyError(error: unknown): boolean {
  return (
    sqliteErrorNumber(error) === 5 ||
    /(?:database is locked|database is busy)/i.test(sqliteErrorMessage(error))
  );
}

export function isSqliteFullError(error: unknown): boolean {
  return (
    sqliteErrorNumber(error) === 13 ||
    /(?:database or disk is full|SQLITE_FULL)/i.test(sqliteErrorMessage(error))
  );
}

export interface SqliteBusyFault {
  attempt<T>(operation: (contender: DatabaseSync) => T): T;
  release(): void;
}

export function acquireSqliteWriteLock(databasePath: string): SqliteBusyFault {
  const blocker = new DatabaseSync(databasePath, {
    timeout: 1,
    allowExtension: false,
    enableForeignKeyConstraints: true,
  });
  const contender = new DatabaseSync(databasePath, {
    timeout: 1,
    allowExtension: false,
    enableForeignKeyConstraints: true,
  });
  blocker.exec('PRAGMA busy_timeout = 1; PRAGMA journal_mode = WAL; BEGIN IMMEDIATE;');
  contender.exec('PRAGMA busy_timeout = 1;');

  let released = false;
  return {
    attempt<T>(operation: (connection: DatabaseSync) => T): T {
      if (released) {
        throw new FaultInjectionError('sqlite-busy', 'The SQLite busy fault was already released.');
      }
      return operation(contender);
    },
    release(): void {
      if (released) return;
      released = true;
      if (blocker.isTransaction) blocker.exec('ROLLBACK');
      contender.close();
      blocker.close();
    },
  };
}

export interface SqliteDiskFullFault {
  readonly pageLimit: number;
  trigger(payloadBytes?: number): never;
  release(): void;
}

function pragmaInteger(database: DatabaseSync, name: 'page_count' | 'max_page_count'): number {
  const row = database.prepare(`PRAGMA ${name}`).get();
  return Number(row ? Object.values(row)[0] : 0);
}

export function createSqliteDiskFullFault(databasePath: string): SqliteDiskFullFault {
  const database = new DatabaseSync(databasePath, {
    timeout: 1,
    allowExtension: false,
    enableForeignKeyConstraints: true,
  });
  database.exec(`
    PRAGMA journal_mode = DELETE;
    PRAGMA page_size = 512;
    VACUUM;
    CREATE TABLE IF NOT EXISTS __worldforge_disk_full_fault (
      id INTEGER PRIMARY KEY,
      payload BLOB NOT NULL
    );
  `);
  const pageLimit = pragmaInteger(database, 'page_count');
  database.exec(`PRAGMA max_page_count = ${pageLimit};`);
  const appliedLimit = pragmaInteger(database, 'max_page_count');
  if (appliedLimit !== pageLimit) {
    database.close();
    throw new FaultInjectionError('sqlite-full', 'SQLite rejected the deterministic page limit.');
  }

  let released = false;
  return {
    pageLimit,
    trigger(payloadBytes = 1_048_576): never {
      if (released) {
        throw new FaultInjectionError('sqlite-full', 'The SQLite full fault was already released.');
      }
      if (!Number.isSafeInteger(payloadBytes) || payloadBytes < 1) {
        throw new RangeError('Disk-full payloadBytes must be a positive safe integer.');
      }
      database.exec('BEGIN IMMEDIATE');
      try {
        database
          .prepare('INSERT INTO __worldforge_disk_full_fault(payload) VALUES(zeroblob(?))')
          .run(payloadBytes);
        throw new FaultInjectionError(
          'sqlite-full',
          'SQLite did not trigger the configured disk-full fault.',
        );
      } catch (error) {
        if (error instanceof FaultInjectionError) throw error;
        if (!isSqliteFullError(error)) throw error;
        throw error;
      } finally {
        if (database.isTransaction) database.exec('ROLLBACK');
      }
    },
    release(): void {
      if (released) return;
      released = true;
      if (database.isTransaction) database.exec('ROLLBACK');
      database.close();
    },
  };
}

export interface CorruptedSqliteHeader {
  readonly originalHeaderSha256: string;
  readonly injectedMarker: string;
}

const sqliteHeader = Buffer.from('SQLite format 3\0', 'utf8');
const corruptionMarker = Buffer.from('WF_CORRUPTED_DB!', 'utf8');

export async function corruptSqliteHeader(databasePath: string): Promise<CorruptedSqliteHeader> {
  const handle = await open(databasePath, 'r+');
  try {
    const original = Buffer.alloc(sqliteHeader.byteLength);
    const { bytesRead } = await handle.read(original, 0, original.byteLength, 0);
    if (bytesRead !== sqliteHeader.byteLength || !original.equals(sqliteHeader)) {
      throw new FaultInjectionError(
        'sqlite-corrupt',
        'The corruption target is not a closed SQLite database.',
      );
    }
    await handle.write(corruptionMarker, 0, corruptionMarker.byteLength, 0);
    await handle.sync();
    return {
      originalHeaderSha256: createHash('sha256').update(original).digest('hex'),
      injectedMarker: corruptionMarker.toString('utf8'),
    };
  } finally {
    await handle.close();
  }
}
