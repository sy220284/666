import { describe, expect, it } from 'vitest';
import { findNextReadyTask, parseTaskIndex } from '../../scripts/task-control-lib.mjs';

function index(rows: string[]) {
  return parseTaskIndex(`
| ID | 任务卡 | 依赖 | 状态 |
|---|---|---|---|
${rows.join('\n')}
`);
}

describe('task execution frontier', () => {
  it('starts from the first planned task when no progress exists', () => {
    const tasks = index([
      '| M0-01 | [One](M0/M0-01_MONOREPO_QUALITY_CI.md) | 无 | Planned |',
      '| M0-02 | [Two](M0/M0-02_ELECTRON_CORE_LIFECYCLE.md) | M0-01 | Planned |',
    ]);

    expect(findNextReadyTask(tasks)?.id).toBe('M0-01');
  });

  it('ignores stale planned holes before the latest completed frontier', () => {
    const tasks = index([
      '| M0-01 | [One](M0/M0-01_MONOREPO_QUALITY_CI.md) | 无 | Planned |',
      '| M0-02 | [Two](M0/M0-02_ELECTRON_CORE_LIFECYCLE.md) | 无 | Verified |',
      '| M0-03 | [Three](M0/M0-03_SQLITE_MIGRATION_WRITE_QUEUE.md) | M0-02 | Planned |',
    ]);

    expect(findNextReadyTask(tasks)?.id).toBe('M0-03');
  });

  it('naturally resumes the task that followed completed work after an older repair closes', () => {
    const tasks = index([
      '| M1-08 | [Recovery](M1/M1-08_RECOVERY_READONLY_FOUNDATION.md) | M1-02 | Verified |',
      '| M1-09 | [Import](M1/M1-09_TEXT_IMPORT_EXPORT_MVP.md) | M1-08 | Verified |',
      '| M2-01 | [Lock](M2/M2-01_LOCK_GUARD.md) | M1-05 | Implemented |',
      '| M2-02 | [Candidate](M2/M2-02_CANDIDATE_VERSION_MODEL.md) | M2-01 | Implemented |',
      '| M3-01 | [Brief](M3/M3-01_PROJECT_BRIEF_OUTLINE.md) | M2 | Implemented |',
      '| M3-02 | [Beat](M3/M3-02_SCENE_BEAT_CROSS_CHAPTER.md) | M3-01 | Implemented |',
      '| M3-03 | [Canon](M3/M3-03_ENTITY_CANON.md) | M3-01 | Planned |',
    ]);

    expect(findNextReadyTask(tasks, { allowImplemented: true })?.id).toBe('M3-03');
  });

  it('does not skip a blocked first task after the execution frontier', () => {
    const tasks = index([
      '| M0-01 | [One](M0/M0-01_MONOREPO_QUALITY_CI.md) | 无 | Verified |',
      '| M0-02 | [Two](M0/M0-02_ELECTRON_CORE_LIFECYCLE.md) | M9-99 | Planned |',
      '| M0-03 | [Three](M0/M0-03_SQLITE_MIGRATION_WRITE_QUEUE.md) | 无 | Planned |',
    ]);

    expect(findNextReadyTask(tasks)).toBeUndefined();
  });
});
