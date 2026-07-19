import { readFile, writeFile } from 'node:fs/promises';

async function replaceChecked(path, before, after, expectedMinimum = 1) {
  let source = await readFile(path, 'utf8');
  const occurrences = source.split(before).length - 1;
  if (occurrences < expectedMinimum) {
    throw new Error(`Missing migration baseline anchor in ${path}: ${before}`);
  }
  source = source.replaceAll(before, after);
  await writeFile(path, source, 'utf8');
}

await replaceChecked(
  'tests/migration/project-structure-migration.test.ts',
  "schemaVersion: 11, compatibility: 'migrated'",
  "schemaVersion: 12, compatibility: 'migrated'",
  2,
);
await replaceChecked(
  'tests/migration/project-structure-migration.test.ts',
  'project-v1-to-v11-',
  'project-v1-to-v12-',
);
await replaceChecked(
  'tests/migration/project-structure-migration.test.ts',
  'version: 11n',
  'version: 12n',
);
await replaceChecked(
  'tests/migration/project-structure-migration.test.ts',
  'projectSchemaVersion: 11',
  'projectSchemaVersion: 12',
);

await replaceChecked(
  'tests/migration/recovery-migration.test.ts',
  "schemaVersion: 11, compatibility: 'migrated'",
  "schemaVersion: 12, compatibility: 'migrated'",
);
await replaceChecked(
  'tests/migration/scene-beat-migration.test.ts',
  'at schema version 11',
  'through project schema version 12',
);
await replaceChecked(
  'tests/migration/scene-beat-migration.test.ts',
  'expect(database.schemaVersion).toBe(11);',
  'expect(database.schemaVersion).toBe(12);',
);
await replaceChecked(
  'tests/migration/testkit-faults.test.ts',
  'expect(workspace.projectDatabase.schemaVersion).toBe(11);',
  'expect(workspace.projectDatabase.schemaVersion).toBe(12);',
);

await replaceChecked(
  'tests/migration/sqlite-foundation.test.ts',
  "      'candidates',\n      'chapters',",
  "      'candidates',\n      'canon_facts',\n      'chapters',",
);
await replaceChecked(
  'tests/migration/sqlite-foundation.test.ts',
  "      'drafts',\n      'migration_journal',",
  "      'drafts',\n      'entities',\n      'migration_journal',",
);
await replaceChecked(
  'tests/migration/sqlite-foundation.test.ts',
  "      'scene_beat_block_links',\n      'scene_beats',",
  "      'scene_beat_block_links',\n      'scene_beat_entities',\n      'scene_beats',",
);
await replaceChecked(
  'tests/migration/sqlite-foundation.test.ts',
  ').toBe(11n);',
  ').toBe(12n);',
);

console.log('M3-03 migration baselines advanced to schema 12.');
