import { readFile, writeFile } from 'node:fs/promises';

async function replaceAllExact(path, replacements) {
  let source = await readFile(path, 'utf8');
  for (const [before, after] of replacements) {
    if (!source.includes(before)) throw new Error(`Missing migration baseline anchor in ${path}: ${before}`);
    source = source.replaceAll(before, after);
  }
  await writeFile(path, source, 'utf8');
}

await replaceAllExact('tests/migration/project-structure-migration.test.ts', [
  ["{ schemaVersion: 11, compatibility: 'migrated' }", "{ schemaVersion: 12, compatibility: 'migrated' }"],
  [/^project-v1-to-v11-[0-9a-f-]+\\.sqlite$/u.toString(), /^project-v1-to-v12-[0-9a-f-]+\\.sqlite$/u.toString()],
  ['version: 11n', 'version: 12n'],
  ['schema_version: 11n', 'schema_version: 12n'],
  ['projectSchemaVersion: 11', 'projectSchemaVersion: 12'],
]);

await replaceAllExact('tests/migration/recovery-migration.test.ts', [
  ["{ schemaVersion: 11, compatibility: 'migrated' }", "{ schemaVersion: 12, compatibility: 'migrated' }"],
]);

await replaceAllExact('tests/migration/scene-beat-migration.test.ts', [
  ['at schema version 11', 'through project schema version 12'],
  ['expect(database.schemaVersion).toBe(11);', 'expect(database.schemaVersion).toBe(12);'],
]);

await replaceAllExact('tests/migration/testkit-faults.test.ts', [
  ['expect(workspace.projectDatabase.schemaVersion).toBe(11);', 'expect(workspace.projectDatabase.schemaVersion).toBe(12);'],
]);

await replaceAllExact('tests/migration/sqlite-foundation.test.ts', [
  ["      'candidates',\n      'chapters',", "      'candidates',\n      'canon_facts',\n      'chapters',"],
  ["      'drafts',\n      'migration_journal',", "      'drafts',\n      'entities',\n      'migration_journal',"],
  ["      'scene_beat_block_links',\n      'scene_beats',", "      'scene_beat_block_links',\n      'scene_beat_entities',\n      'scene_beats',"],
  [']).toBe(11n);', ']).toBe(12n);'],
]);

console.log('M3-03 migration baselines advanced to schema 12.');
