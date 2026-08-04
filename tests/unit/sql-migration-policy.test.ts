import { describe, expect, it } from 'vitest';

import { validateMigrationSource } from '../../scripts/check-sql-migrations.mjs';

describe('SQL migration policy', () => {
  it('accepts scoped writes and normalized text', () => {
    expect(
      validateMigrationSource(
        'CREATE TABLE records (id TEXT PRIMARY KEY);\nUPDATE records SET id = id WHERE id IS NOT NULL;\n',
      ),
    ).toEqual([]);
  });

  it('rejects unscoped destructive writes without an explicit migration annotation', () => {
    expect(validateMigrationSource('DELETE FROM records;\n')).toContain(
      'unscoped DELETE requires -- migration-policy: allow-unscoped-write',
    );
    expect(validateMigrationSource("UPDATE records SET id = 'next';\n")).toContain(
      'unscoped UPDATE requires -- migration-policy: allow-unscoped-write',
    );
  });

  it('allows reviewed unscoped data migrations through an explicit annotation', () => {
    expect(
      validateMigrationSource(
        "-- migration-policy: allow-unscoped-write\nUPDATE records SET id = 'normalized';\n",
      ),
    ).toEqual([]);
  });

  it('enforces LF and final newline', () => {
    expect(validateMigrationSource('SELECT 1;')).toContain('must end with a newline');
    expect(validateMigrationSource('SELECT 1;\r\n')).toContain('must use LF line endings');
  });
});
