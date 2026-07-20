import { describe, expect, it } from 'vitest';

import {
  defineMigration,
  normalizeMigrations,
} from '../../packages/core-service/src/database/index.js';

describe('migration transaction boundaries', () => {
  it('allows SQLite trigger bodies while rejecting migration-owned transactions', () => {
    const triggerMigration = defineMigration(
      'project',
      1,
      'trigger_body',
      `CREATE TABLE source(id TEXT PRIMARY KEY) STRICT;
       CREATE TABLE audit(source_id TEXT NOT NULL) STRICT;
       CREATE TRIGGER source_audit
       AFTER INSERT ON source
       BEGIN
         INSERT INTO audit(source_id) VALUES(NEW.id);
       END;`,
    );
    expect(normalizeMigrations([triggerMigration], 'project')).toEqual([triggerMigration]);

    for (const sql of [
      'BEGIN IMMEDIATE; CREATE TABLE forbidden(id TEXT PRIMARY KEY) STRICT; COMMIT;',
      'CREATE TABLE allowed(id TEXT PRIMARY KEY) STRICT; ROLLBACK;',
      'VACUUM;',
    ]) {
      expect(() =>
        normalizeMigrations([defineMigration('project', 1, 'forbidden_control', sql)], 'project'),
      ).toThrow(/Migration sequence is invalid/);
    }
  });
});
