import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { serializeConstraintPackage } from '../../packages/prompts/src/constraint-package-serializer.js';
import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { ConstraintPackageService } from '../../packages/core-service/src/constraint-package.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { SearchIndexService } from '../../packages/core-service/src/search-index.js';

const temporaryDirectories: string[] = [];
const now = '2026-07-24T12:00:00.000Z';
const clock = { now: () => new Date(now) };

interface Harness {
  readonly parent: string;
  readonly appRuntime: AppRuntime;
  readonly workspace: ProjectWorkspaceService;
  readonly structure: ProjectStructureService;
  readonly search: SearchIndexService;
  readonly constraints: ConstraintPackageService;
}

async function createHarness(): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-constraint-package-'));
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
  const search = new SearchIndexService(workspace, { clock });
  return {
    parent,
    appRuntime,
    workspace,
    structure: new ProjectStructureService(workspace, { clock }),
    search,
    constraints: new ConstraintPackageService(workspace, { searchIndex: search }),
  };
}

async function closeHarness(harness: Harness): Promise<void> {
  await harness.workspace.shutdown();
  await harness.appRuntime.close();
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M4-02 constraint package integration', () => {
  it('assembles traceable P0-P4 inputs, uses valid snapshots, and falls back from stale snapshots', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '约束包项目', channel: '悬疑长篇' },
        harness.parent,
      );
      const initial = harness.structure.list(project.projectId);
      const volume = initial.volumes[0]!;
      const first = volume.chapters[0]!;
      const withSecond = await harness.structure.createChapter(randomUUID(), {
        projectId: project.projectId,
        volumeId: volume.id,
        title: '玄烛追索',
        placement: { kind: 'end' },
      });
      const second = withSecond.volumes[0]!.chapters[1]!;
      const entityId = randomUUID();
      const beatId = randomUUID();
      const versionId = randomUUID();
      const snapshotId = randomUUID();
      await harness.workspace.writeProject(randomUUID(), project.projectId, (connection) => {
        connection
          .prepare(
            `INSERT INTO project_briefs(
               id, project_id, concept, reading_promise, protagonist_goal,
               core_conflict, ending_intent, required_json, forbidden_json, updated_at
             ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            randomUUID(),
            project.projectId,
            '一座被遗忘的雨城',
            '线索清晰且人物克制',
            '找到失踪的守灯人',
            '真相与城市秩序冲突',
            '揭开玄烛来源',
            JSON.stringify(['不得改变主角身份']),
            JSON.stringify(['不得让反派提前知晓暗号']),
            now,
          );
        connection
          .prepare(
            `INSERT INTO entities(
               id, project_id, entity_type, name, aliases_json, summary,
               status, archived_at, created_at, updated_at
             ) VALUES(?, ?, 'character', ?, ?, ?, 'active', NULL, ?, ?)`,
          )
          .run(
            entityId,
            project.projectId,
            '玄烛使',
            JSON.stringify(['守灯人']),
            '雨城守灯者',
            now,
            now,
          );
        connection
          .prepare(
            `INSERT INTO canon_facts(
               id, project_id, entity_id, fact_key, value_json, description,
               source_type, source_id, status, confirmed_at, superseded_at, created_at
             ) VALUES(?, ?, ?, 'location', ?, ?, 'author', NULL, 'current', ?, NULL, ?)`,
          )
          .run(
            randomUUID(),
            project.projectId,
            entityId,
            JSON.stringify('钟楼'),
            '当前驻守地点',
            now,
            now,
          );
        connection
          .prepare(
            `INSERT INTO scene_beats(
               id, project_id, chapter_id, plot_node_id, title, goal, core_conflict,
               expected_result, beat_type, word_target_percent, is_required, order_key,
               character_ids_json, location_ids_json, deleted_at, updated_at
             ) VALUES(?, ?, ?, NULL, ?, ?, ?, ?, 'turn', 100, 1, 1024, ?, '[]', NULL, ?)`,
          )
          .run(
            beatId,
            project.projectId,
            second.id,
            '玄烛使现身',
            '确认守灯人的真实身份',
            '主角不信任证词',
            '得到钟楼暗号',
            JSON.stringify([entityId]),
            now,
          );
        connection
          .prepare(
            `INSERT INTO versions(
               id, chapter_id, source_draft_id, source_revision, title, description,
               label, word_count, content_hash, created_at
             ) VALUES(?, ?, ?, 0, ?, '', NULL, 0, ?, ?)`,
          )
          .run(versionId, first.id, first.activeDraftId, '第一章定稿', 'a'.repeat(64), now);
        connection
          .prepare('UPDATE chapters SET final_version_id = ? WHERE id = ?')
          .run(versionId, first.id);
        connection
          .prepare(
            `INSERT INTO ending_snapshots(
               id, project_id, chapter_id, source_version_id, status,
               content_json, stale_reasons_json, created_at, stale_at
             ) VALUES(?, ?, ?, ?, 'valid', ?, '[]', ?, NULL)`,
          )
          .run(
            snapshotId,
            project.projectId,
            first.id,
            versionId,
            JSON.stringify({
              entityStates: [
                { entityId, stateKey: 'location', value: '城门', sourceVersionId: versionId },
              ],
              knowledgeStates: [
                { characterId: entityId, informationKey: '暗号', knowledgeStatus: 'knows' },
              ],
              foreshadowings: [],
              arcMilestones: [],
            }),
            now,
          );
      });
      await harness.search.rebuild(randomUUID(), project.projectId);

      const input = {
        projectId: project.projectId,
        chapterId: second.id,
        taskType: 'chapter' as const,
        query: '玄烛使',
        maxInputTokens: 8_192,
        safetyMarginTokens: 512,
        maxSupplementalResults: 5,
      };
      const firstBuild = harness.constraints.build(input);
      const repeated = harness.constraints.build(input);
      expect(firstBuild.snapshotSource).toBe('snapshot');
      expect(firstBuild.sections.P0.map((source) => source.content)).toEqual(
        expect.arrayContaining(['不得改变主角身份', '不得让反派提前知晓暗号']),
      );
      expect(firstBuild.sections.P1.some((source) => source.sourceType === 'scene_beat')).toBe(
        true,
      );
      expect(firstBuild.sections.P2.some((source) => source.sourceType === 'entity_state')).toBe(
        true,
      );
      expect(firstBuild.sections.P2.some((source) => source.sourceType === 'canon_fact')).toBe(
        true,
      );
      expect(
        firstBuild.sections.P4.some((source) => source.sourceType === 'supplemental_search'),
      ).toBe(true);
      expect(firstBuild.sourceVersionIds).toContain(versionId);
      expect(firstBuild.constraintHash).toBe(repeated.constraintHash);
      expect(firstBuild.contentHash).toBe(repeated.contentHash);
      expect(serializeConstraintPackage(firstBuild)).toBe(serializeConstraintPackage(repeated));
      expect(
        firstBuild.conflicts.some((conflict) => conflict.semanticKey.includes('location')),
      ).toBe(true);

      await harness.workspace.writeProject(randomUUID(), project.projectId, (connection) => {
        connection
          .prepare(
            `UPDATE ending_snapshots
                SET status = 'stale', stale_reasons_json = '["entity_state"]', stale_at = ?
              WHERE id = ?`,
          )
          .run(now, snapshotId);
        connection
          .prepare(
            `INSERT INTO entity_states(
               id, project_id, entity_id, state_key, value_json,
               valid_from_chapter_id, valid_until_chapter_id, record_status,
               evidence_json, source_version_id, created_at, superseded_at
             ) VALUES(?, ?, ?, 'location', ?, ?, NULL, 'current', '[]', ?, ?, NULL)`,
          )
          .run(
            randomUUID(),
            project.projectId,
            entityId,
            JSON.stringify('钟楼'),
            first.id,
            versionId,
            now,
          );
      });
      const fallback = harness.constraints.build(input);
      expect(fallback.snapshotSource).toBe('fallback_live_query');
      expect(fallback.sections.P2.some((source) => source.sourceType === 'ending_snapshot')).toBe(
        false,
      );
      expect(
        fallback.sections.P2.some(
          (source) => source.sourceType === 'entity_state' && source.content.includes('钟楼'),
        ),
      ).toBe(true);
    } finally {
      await closeHarness(harness);
    }
  });
});
