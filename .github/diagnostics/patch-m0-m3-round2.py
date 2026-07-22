from pathlib import Path
import json
import re


def literal(path: str, old: str, new: str, count: int = 1) -> None:
    file = Path(path)
    source = file.read_text()
    actual = source.count(old)
    if actual != count:
        raise SystemExit(f'{path}: expected {count} literal match(es), found {actual}')
    file.write_text(source.replace(old, new, count))


def regex(path: str, pattern: str, replacement: str, count: int = 1) -> None:
    file = Path(path)
    source, actual = re.subn(pattern, replacement, file.read_text(), count=count, flags=re.S)
    if actual != count:
        raise SystemExit(f'{path}: expected {count} regex match(es), found {actual}')
    file.write_text(source)


scene_test = 'tests/migration/scene-beat-entity-truth-migration.test.ts'
literal(
    scene_test,
    "import { ProjectDatabase, loadMigrations } from '../../packages/core-service/src/database/index.js';",
    """import {
  ProjectDatabase,
  latestMigrationVersion,
  loadMigrations,
} from '../../packages/core-service/src/database/index.js';""",
)
literal(
    scene_test,
    """    const database = await ProjectDatabase.open({
      path: path.join(directory, 'project.sqlite'),
      migrations: await loadMigrations('migrations/project', 'project'),
      appVersion: '0.1.0',
    });
    try {
      expect(database.schemaVersion).toBe(17);""",
    """    const migrations = await loadMigrations('migrations/project', 'project');
    const currentSchemaVersion = latestMigrationVersion(migrations);
    const database = await ProjectDatabase.open({
      path: path.join(directory, 'project.sqlite'),
      migrations,
      appVersion: '0.1.0',
    });
    try {
      expect(database.schemaVersion).toBe(currentSchemaVersion);""",
)
literal(
    scene_test,
    """           ) VALUES(?, ?, 'test', NULL, 17, ?, ?)`,
        );
        insertProject.run(projectId, '本项目', timestamp, timestamp);
        insertProject.run(foreignProjectId, '异项目', timestamp, timestamp);""",
    """           ) VALUES(?, ?, 'test', NULL, ?, ?, ?)`,
        );
        insertProject.run(
          projectId,
          '本项目',
          currentSchemaVersion,
          timestamp,
          timestamp,
        );
        insertProject.run(
          foreignProjectId,
          '异项目',
          currentSchemaVersion,
          timestamp,
          timestamp,
        );""",
)

literal(
    'tests/migration/sqlite-foundation.test.ts',
    """      'scene_beat_entities',
      'scene_beats',""",
    """      'scene_beat_entities',
      'scene_beat_link_rebind_queue',
      'scene_beats',""",
)

wrapper = 'apps/desktop/renderer/src/features/writing/writing-workbench.tsx'
literal(wrapper, "import { useEffect, useMemo, useRef } from 'react';", "import { useMemo } from 'react';")
regex(wrapper, r"\ninterface PersistedDomSelection \{[\s\S]*?\n\}\n", "\n")
literal(
    wrapper,
    """  const selectionToRestore = useRef<PersistedDomSelection | null>(null);
  const sourceContentToReplace = useRef<HTMLElement | null>(null);
  const restoreScheduled = useRef(false);
""",
    "",
)
regex(
    wrapper,
    r"\n  useEffect\(\(\) => \{\n    const rememberSelectionBeforeExit[\s\S]*?\n  \}, \[\]\);\n",
    "\n",
)
regex(
    wrapper,
    r"\nfunction pathFromRoot\([\s\S]*?\nfunction waitForDraftEditorHost\(\): Promise<void> \{[\s\S]*?\n\}\n?$",
    """
function waitForDraftEditorHost(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}
""",
)

core = 'apps/desktop/renderer/src/features/writing/writing-core-workbench.tsx'
literal(
    core,
    """const EMPTY_STATISTICS: WritingStatistics = {
  characterCount: 0,
  textCount: 0,
  paragraphCount: 0,
  progressPercent: null,
};
""",
    """const EMPTY_STATISTICS: WritingStatistics = {
  characterCount: 0,
  textCount: 0,
  paragraphCount: 0,
  progressPercent: null,
};

const persistedSelectionByChapter = new Map<
  string,
  { readonly from: number; readonly to: number }
>();

function selectionKey(projectId: string, chapterId: string): string {
  return `${projectId}:${chapterId}`;
}
""",
)
regex(core, r"\n  const selectionByChapter = useRef\([\s\S]*?\n  \);", "")
literal(
    core,
    'selectionByChapter.current.set(currentChapter.id, {',
    'persistedSelectionByChapter.set(selectionKey(project.projectId, currentChapter.id), {',
)
literal(
    core,
    'selectionByChapter.current.set(nextChapter.id, {',
    'persistedSelectionByChapter.set(selectionKey(project.projectId, nextChapter.id), {',
)
literal(
    core,
    'const remembered = selectionByChapter.current.get(nextChapter.id);',
    'const remembered = persistedSelectionByChapter.get(selectionKey(project.projectId, nextChapter.id));',
)
literal(core, "  }, []);\n\n  const mountEditor", "  }, [project.projectId]);\n\n  const mountEditor")
literal(
    core,
    '  return clean.innerHTML;',
    """  const serializer = new XMLSerializer();
  return Array.from(clean.childNodes, (node) => serializer.serializeToString(node)).join('');""",
)

manifest_path = Path('.github/audit-remediations/m0-m3-integrated-coordination-2026-07-23.json')
manifest = json.loads(manifest_path.read_text())
repairs = manifest['verifiedTaskRepairs']
if not any(item['taskId'] == 'M0-03' for item in repairs):
    repairs.insert(
        1,
        {
            'taskId': 'M0-03',
            'finding': 'Schema 18 changed the authoritative project schema and table inventory; foundation migration assertions must follow the current migration ledger.',
            'allowedPaths': ['tests/migration/sqlite-foundation.test.ts'],
        },
    )
for item in repairs:
    if item['taskId'] == 'M3-02':
        item['allowedPaths'].append('tests/migration/scene-beat-entity-truth-migration.test.ts')
    if item['taskId'] == 'M3-10':
        item['allowedPaths'].extend(
            [
                'apps/desktop/renderer/src/features/writing/writing-core-workbench.tsx',
                'apps/desktop/renderer/src/features/writing/writing-workbench.tsx',
            ]
        )
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
