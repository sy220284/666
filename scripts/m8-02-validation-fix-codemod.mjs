import { readFile, rm, writeFile } from 'node:fs/promises';

async function read(path) {
  return readFile(path, 'utf8');
}

async function write(path, content) {
  await writeFile(path, content, 'utf8');
}

function replaceExact(content, before, after, label) {
  const count = content.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, received ${count}`);
  return content.replace(before, after);
}

let recovery = await read('packages/core-service/src/recovery.ts');
recovery = replaceExact(
  recovery,
  `    let backupFailures: BackupFailureRecord[] = [];
    try {
      backupFailures = this.#workspace.readProject(projectId, (database) =>
        database
          .prepare(
            \`SELECT id AS failureId, project_id AS projectId, operation,
                    backup_track AS track, error_code AS errorCode,
                    occurred_at AS occurredAt, resolved_at AS resolvedAt
               FROM backup_failures
              WHERE project_id = ? AND resolved_at IS NULL
              ORDER BY occurred_at DESC, id DESC
              LIMIT 20\`,
          )
          .all(projectId)
          .map((row) => BackupFailureRecordSchema.parse(row)),
      );
    } catch {
      backupFailures = [];
    }`,
  `    const backupFailures: BackupFailureRecord[] = (() => {
      try {
        return this.#workspace.readProject(projectId, (database) =>
          database
            .prepare(
              \`SELECT id AS failureId, project_id AS projectId, operation,
                      backup_track AS track, error_code AS errorCode,
                      occurred_at AS occurredAt, resolved_at AS resolvedAt
                 FROM backup_failures
                WHERE project_id = ? AND resolved_at IS NULL
                ORDER BY occurred_at DESC, id DESC
                LIMIT 20\`,
            )
            .all(projectId)
            .map((row) => BackupFailureRecordSchema.parse(row)),
        );
      } catch {
        return [];
      }
    })();`,
  'remove useless backup failure assignment',
);
await write('packages/core-service/src/recovery.ts', recovery);

let searchMigration = await read('tests/migration/search-index-migration.test.ts');
searchMigration = replaceExact(
  searchMigration,
  'expect(latestMigrationVersion(migrations)).toBe(28);',
  'expect(latestMigrationVersion(migrations)).toBe(29);',
  'latest project migration version',
);
await write('tests/migration/search-index-migration.test.ts', searchMigration);

let stateMigration = await read('tests/migration/state-validation-migration.test.ts');
stateMigration = replaceExact(
  stateMigration,
  `    for (const trigger of schema28Triggers) database.exec(\`DROP TRIGGER \${trigger}\`);
    database.prepare('DELETE FROM schema_migrations WHERE version = 28').run();
    database.prepare('UPDATE projects SET schema_version = 27').run();`,
  `    for (const trigger of schema28Triggers) database.exec(\`DROP TRIGGER \${trigger}\`);
    database.exec('DROP TABLE IF EXISTS backup_failures');
    database.prepare('DELETE FROM schema_migrations WHERE version IN (28, 29)').run();
    database.prepare('UPDATE projects SET schema_version = 27').run();`,
  'construct genuine schema 27 fixture',
);
stateMigration = replaceExact(
  stateMigration,
  `      expect.stringMatching(/^project-v27-to-v28-.*\\.sqlite$/u),`,
  `      expect.stringMatching(/^project-v27-to-v29-.*\\.sqlite$/u),`,
  'migration recovery target version',
);
stateMigration = replaceExact(
  stateMigration,
  `        schemaVersion: 28,
        databaseMode: 'read-write',`,
  `        schemaVersion: 29,
        databaseMode: 'read-write',`,
  'clean fixture opened version',
);
stateMigration = replaceExact(
  stateMigration,
  `      schemaVersion: 28n,
      triggerCount: 4n,`,
  `      schemaVersion: 29n,
      triggerCount: 4n,`,
  'clean fixture persisted version',
);
await write('tests/migration/state-validation-migration.test.ts', stateMigration);

await rm('scripts/m8-02-validation-fix-codemod.mjs');
await rm('.github/workflows/m8-02-validation-fix-codemod.yml');
