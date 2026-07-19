from pathlib import Path

ROOT = Path.cwd()

def replace_once(path: str, old: str, new: str) -> None:
    target = ROOT / path
    source = target.read_text(encoding='utf-8')
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{path} anchor count {count}: {old[:100]!r}')
    target.write_text(source.replace(old, new, 1), encoding='utf-8')

replace_once(
    'tests/migration/testkit-faults.test.ts',
    "import { AppDatabase, defineMigration } from '../../packages/core-service/src/database/index.js';",
    "import {\n  AppDatabase,\n  defineMigration,\n  latestMigrationVersion,\n  loadMigrations,\n} from '../../packages/core-service/src/database/index.js';",
)
replace_once(
    'tests/migration/testkit-faults.test.ts',
    "    const workspace = await createTemporaryWorldforgeWorkspace({ parentDirectory });\n    expect(workspace.appDatabase.mode).toBe('read-write');",
    "    const workspace = await createTemporaryWorldforgeWorkspace({ parentDirectory });\n    const latestProjectSchemaVersion = latestMigrationVersion(\n      await loadMigrations('migrations/project', 'project'),\n    );\n    expect(workspace.appDatabase.mode).toBe('read-write');",
)
replace_once(
    'tests/migration/testkit-faults.test.ts',
    '    expect(workspace.projectDatabase.schemaVersion).toBe(12);',
    '    expect(workspace.projectDatabase.schemaVersion).toBe(latestProjectSchemaVersion);',
)
replace_once(
    'tests/integration/entity-canon.test.ts',
    "             ) VALUES(?, 'Foreign', 'test', NULL, 12, ?, ?)`\n          )\n          .run(foreignProjectId, now, now);",
    "             ) VALUES(?, 'Foreign', 'test', NULL, ?, ?, ?)`\n          )\n          .run(foreignProjectId, project.schemaVersion, now, now);",
)
