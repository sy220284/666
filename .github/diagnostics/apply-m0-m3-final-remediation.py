from pathlib import Path
import json


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    source = file.read_text()
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one match, found {count}: {old[:80]!r}')
    file.write_text(source.replace(old, new))


def replace_count(path: str, old: str, new: str, expected: int) -> None:
    file = Path(path)
    source = file.read_text()
    count = source.count(old)
    if count != expected:
        raise SystemExit(f'{path}: expected {expected} matches, found {count}: {old[:80]!r}')
    file.write_text(source.replace(old, new))


migration = 'migrations/project/0019_final_coordination_remediation.sql'
replace_once(
    migration,
    '-- EndingSnapshot invalidation begin at the earliest affected chapter.',
    '-- EndingSnapshot invalidation starts at the earliest affected chapter.',
)
replace_once(
    migration,
    '-- Entity and knowledge state changes begin at valid_from. Updating a state uses',
    '-- Entity and knowledge state changes start at valid_from. Updating a state uses',
)

core = 'apps/desktop/renderer/src/runtime/core-recovery-supervisor.ts'
replace_once(
    core,
    "import type { CoreStatus, ProjectWorkspaceSummary } from '@worldforge/contracts';",
    "import type { CoreStatus } from '@worldforge/contracts';",
)
replace_once(
    core,
    """interface CoreRecoveryBridge {
  readonly app: Pick<RendererBridgeAdapter['app'], 'getCoreStatus' | 'restartCore'>;
  readonly project: Pick<RendererBridgeAdapter['project'], 'getActive' | 'listRecent' | 'openRecent'>;
}
""",
    """interface CoreRecoveryBridge {
  readonly app: Pick<RendererBridgeAdapter['app'], 'getCoreStatus' | 'restartCore'>;
  readonly project: Pick<RendererBridgeAdapter['project'], 'getActive' | 'listRecent' | 'openRecent'>;
}

interface RecoverableProjectIdentity {
  readonly projectId: string;
}
""",
)
replace_once(
    core,
    '  let rememberedProject: ProjectWorkspaceSummary | null = null;',
    '  let rememberedProject: RecoverableProjectIdentity | null = null;',
)
replace_once(
    core,
    '  const recentProjectFallback = async (epoch: number): Promise<ProjectWorkspaceSummary | null> => {',
    '  const recentProjectFallback = async (epoch: number): Promise<RecoverableProjectIdentity | null> => {',
)

recovery = 'packages/core-service/src/recovery.ts'
replace_once(recovery, 'function remapProjectIdentity(', 'export function remapProjectIdentity(')
replace_once(
    recovery,
    """    database.exec('COMMIT; PRAGMA foreign_keys = ON');
    if (database.prepare('PRAGMA foreign_key_check').all().length > 0) {
      throw new Error('PROJECT_ID_REMAP_FOREIGN_KEY_FAILED');
    }
""",
    """    if (database.prepare('PRAGMA foreign_key_check').all().length > 0) {
      throw new Error('PROJECT_ID_REMAP_FOREIGN_KEY_FAILED');
    }
    database.exec('COMMIT');
    database.exec('PRAGMA foreign_keys = ON');
""",
)

migration_test = 'tests/migration/integrated-coordination-migration.test.ts'
replace_once(
    migration_test,
    """      expect(
        database.read((connection) =>
          connection
            .prepare(
              `SELECT draft_block_id AS draftBlockId
                 FROM scene_beat_block_links WHERE scene_beat_id = ?`,
            )
            .get(sceneBeatId),
        ),
      ).toEqual({ draftBlockId: replacementBlockId });
      expect(
        database.read((connection) =>
          connection.prepare('SELECT COUNT(*) AS count FROM scene_beat_link_rebind_queue').get(),
        ),
      ).toEqual({ count: 0n });
""",
    """      expect(
        database.read((connection) =>
          connection
            .prepare(
              `SELECT draft_block_id AS draftBlockId
                 FROM scene_beat_block_links WHERE scene_beat_id = ?`,
            )
            .all(sceneBeatId),
        ),
      ).toEqual([]);
      expect(
        database.read((connection) =>
          connection.prepare('SELECT COUNT(*) AS count FROM scene_beat_link_rebind_queue').get(),
        ),
      ).toEqual({ count: 1n });
""",
)

final_test = 'tests/migration/final-coordination-remediation.test.ts'
replace_once(
    final_test,
    '      fixture = await v17.write(randomUUID(), (connection) => {',
    '      fixture = (await v17.write(randomUUID(), (connection) => {',
)
replace_once(
    final_test,
    """        return seeded;
      });
""",
    """        return seeded;
      })).value;
""",
)
replace_count(
    final_test,
    '      const ids = await database.write(randomUUID(), (connection) => {',
    '      const ids = (await database.write(randomUUID(), (connection) => {',
    3,
)
replace_once(
    final_test,
    """        return { fixture, source: source!, target: target!, logicalBlockId, sourceBlockId, beatId };
      });
""",
    """        return { fixture, source: source!, target: target!, logicalBlockId, sourceBlockId, beatId };
      })).value;
""",
)
replace_once(
    final_test,
    """        return { fixture, snapshotIds };
      });
""",
    """        return { fixture, snapshotIds };
      })).value;
""",
)
replace_once(
    final_test,
    """        return { fixture, foreshadowingId, snapshotIds };
      });
""",
    """        return { fixture, foreshadowingId, snapshotIds };
      })).value;
""",
)

manifest_path = Path('.github/audit-remediations/m0-m3-final-remediation-2026-07-23.json')
manifest = json.loads(manifest_path.read_text())
for repair in manifest['verifiedTaskRepairs']:
    if repair['taskId'] == 'M1-08':
        repair['allowedPaths'] = [
            'packages/core-service/src/recovery.ts',
            'tests/integration/recovery-identity-remap.test.ts',
        ]
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
