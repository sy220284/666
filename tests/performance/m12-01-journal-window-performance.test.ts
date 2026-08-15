import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { JournalService } from '../../packages/core-service/src/journal-service.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';

const timestamp = '2026-08-13T10:00:00.000Z';
const clock = { now: () => new Date(timestamp) };
const temporaryDirectories: string[] = [];
const FIVE_MILLION_CHARACTERS = 5_000_000;

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

describe('M12-01 500万字 Journal 窗口聚合性能', () => {
  it('does not rescan the 5M-character immutable body for a one-day Journal preview', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-m12-01-journal-scale-'));
    temporaryDirectories.push(root);
    const parent = path.join(root, 'projects');
    await mkdir(parent, { recursive: true });

    const appRuntime = await openAppRuntime({
      databasePath: path.join(root, 'app.sqlite'),
      migrationsDirectory: 'migrations/app',
      recoveryDirectory: path.join(root, 'app-recovery'),
      appVersion: '0.1.0',
      clock,
    });
    const workspace = new ProjectWorkspaceService({
      projectMigrationsDirectory: 'migrations/project',
      projectMigrationRecoveryDirectory: path.join(root, 'project-migration-recovery'),
      appVersion: '0.1.0',
      recentProjects: appRuntime.recentProjects,
      clock,
    });

    try {
      const project = await workspace.create(
        randomUUID(),
        { name: '500万字 Journal 性能夹具', channel: '长篇', initialStructure: 'blank' },
        parent,
      );
      const volumeId = randomUUID();
      const chapterId = randomUUID();
      const draftId = randomUUID();
      const versionId = randomUUID();
      const logicalBlockId = randomUUID();
      const body = '长篇正文'
        .repeat(Math.ceil(FIVE_MILLION_CHARACTERS / 4))
        .slice(0, FIVE_MILLION_CHARACTERS);
      const bodyHash = hash(body);

      await workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database
          .prepare(
            `INSERT INTO volumes(id, project_id, title, order_key, status, deleted_at)
             VALUES(?, ?, '第一卷', 1024, 'writing', NULL)`,
          )
          .run(volumeId, project.projectId);
        database
          .prepare(
            `INSERT INTO chapters(
               id, volume_id, title, order_key, status, target_word_min, target_word_max,
               active_draft_id, final_version_id, deleted_at
             ) VALUES(?, ?, '第一章', 1024, 'writing', NULL, NULL, NULL, NULL, NULL)`,
          )
          .run(chapterId, volumeId);
        database
          .prepare(
            `INSERT INTO drafts(id, chapter_id, status, revision, created_at, updated_at)
             VALUES(?, ?, 'active', 0, ?, ?)`,
          )
          .run(draftId, chapterId, timestamp, timestamp);
        database
          .prepare('UPDATE chapters SET active_draft_id = ? WHERE id = ?')
          .run(draftId, chapterId);
        database
          .prepare(
            `INSERT INTO versions(
               id, chapter_id, source_draft_id, source_revision, version_type,
               parent_version_id, source_candidate_id, title, description, label,
               word_count, content_hash, created_at
             ) VALUES(?, ?, ?, 0, 'manual', NULL, NULL, '500万字定稿', '', NULL, ?, ?, ?)`,
          )
          .run(versionId, chapterId, draftId, body.length, bodyHash, timestamp);
        database
          .prepare(
            `INSERT INTO version_blocks(
               version_id, logical_block_id, order_key, block_type, text,
               attributes_json, source, locked, content_hash
             ) VALUES(?, ?, 1024, 'paragraph', ?, '{}', 'manual', 0, ?)`,
          )
          .run(versionId, logicalBlockId, body, bodyHash);
        database
          .prepare("UPDATE chapters SET final_version_id = ?, status = 'finalized' WHERE id = ?")
          .run(versionId, chapterId);
        database
          .prepare('UPDATE chapters SET finalized_at = ? WHERE id = ?')
          .run(timestamp, chapterId);
      });

      const journal = new JournalService(workspace, { clock });
      const started = performance.now();
      const preview = journal.preview({
        projectId: project.projectId,
        periodType: 'manual',
        periodStart: '2026-08-13T00:00:00.000Z',
        periodEnd: '2026-08-14T00:00:00.000Z',
      });
      const elapsedMs = performance.now() - started;

      expect(preview.deterministicSummary.versions).toEqual({ created: 1, finalized: 1 });
      expect(preview.deterministicSummary.writing.netCharacters).toBe(0);
      expect(elapsedMs).toBeLessThan(1_500);
    } finally {
      await workspace.shutdown();
      await appRuntime.close();
    }
  });
});
