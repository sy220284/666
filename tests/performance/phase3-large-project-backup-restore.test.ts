import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { draftContentHash } from '../../packages/core-service/src/draft/draft-model.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { RecoveryService } from '../../packages/core-service/src/recovery/recovery-service.js';
import { VersionService } from '../../packages/core-service/src/version.js';
import {
  evaluateBackupRestoreBudget,
  summarizeBackupRestoreSamples,
} from '../../scripts/large-project-backup-restore-policy.mjs';

const CHAPTER_COUNT = 500;
const VOLUME_COUNT = 10;
const CHAPTERS_PER_VOLUME = CHAPTER_COUNT / VOLUME_COUNT;
const CHAPTER_CHARACTERS = 3_000;
const ENTITY_COUNT = 150;
const FORESHADOWING_COUNT = 200;
const CHARACTER_ARC_COUNT = 50;
const VERSION_COUNT = 100;
const timestamp = '2026-08-12T00:00:00.000Z';
const clock = { now: () => new Date(timestamp) };
const budgetPath = path.join('docs', 'process', 'LARGE_PROJECT_BACKUP_RESTORE_BUDGET.json');

interface BudgetFile {
  readonly schemaVersion: number;
  readonly status: 'calibration-required' | 'enforced';
  readonly sampleCount: number;
  readonly budget: {
    readonly maxBackupP95Ms: number;
    readonly maxRestoreP95Ms: number;
  } | null;
}

interface ChapterFixture {
  readonly chapterId: string;
  readonly draftId: string;
  readonly text: string;
}

function createChapterText(index: number): string {
  const seed = `第${String(index + 1).padStart(3, '0')}章真实长篇恢复基线。人物行动、伏笔推进、场景细节与关系变化持续展开。`;
  return seed.repeat(Math.ceil(CHAPTER_CHARACTERS / seed.length)).slice(0, CHAPTER_CHARACTERS);
}

async function loadBudget(): Promise<BudgetFile> {
  const parsed = JSON.parse(await readFile(budgetPath, 'utf8')) as BudgetFile;
  if (parsed.schemaVersion !== 1) throw new Error('BACKUP_RESTORE_BUDGET_INVALID: schemaVersion');
  if (!Number.isInteger(parsed.sampleCount) || parsed.sampleCount < 3) {
    throw new Error('BACKUP_RESTORE_BUDGET_INVALID: sampleCount');
  }
  if (parsed.status !== 'calibration-required' && parsed.status !== 'enforced') {
    throw new Error('BACKUP_RESTORE_BUDGET_INVALID: status');
  }
  return parsed;
}

async function writeEvidence(evidence: unknown): Promise<string> {
  const performanceRoot = path.dirname(
    process.env.WORLDFORGE_M8_PERF_OUTPUT ?? path.join('test-results', 'performance', 'm8-02.json'),
  );
  const output = path.join(performanceRoot, 'phase3-large-project-backup-restore.json');
  await mkdir(performanceRoot, { recursive: true });
  await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  return output;
}

describe('Phase 3 realistic large-project backup/restore performance', () => {
  it('measures verified backup and restored-copy latency before enforcing calibrated budgets', async () => {
    const budget = await loadBudget();
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-phase3-backup-restore-'));
    const projectParent = path.join(root, 'projects');
    const restoreRoot = path.join(root, 'restored');
    await mkdir(projectParent, { recursive: true });
    await mkdir(restoreRoot, { recursive: true });

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
    const versions = new VersionService(workspace, { clock });
    const recovery = new RecoveryService(workspace, {
      backupRootDirectory: path.join(root, 'backups'),
      clock,
    });

    try {
      const project = await workspace.create(
        randomUUID(),
        { name: 'Phase3大作品备份恢复', channel: '长篇', initialStructure: 'blank' },
        projectParent,
      );
      const chapters: ChapterFixture[] = [];
      const entityIds: string[] = [];

      await workspace.writeProject(randomUUID(), project.projectId, (connection) => {
        const insertVolume = connection.prepare(
          `INSERT INTO volumes(id, project_id, title, order_key, status, deleted_at)
             VALUES(?, ?, ?, ?, 'writing', NULL)`,
        );
        const insertChapter = connection.prepare(
          `INSERT INTO chapters(
               id, volume_id, title, order_key, status, target_word_min, target_word_max,
               active_draft_id, final_version_id, deleted_at
             ) VALUES(?, ?, ?, ?, 'writing', 2500, 4000, NULL, NULL, NULL)`,
        );
        const insertDraft = connection.prepare(
          `INSERT INTO drafts(id, chapter_id, status, revision, created_at, updated_at)
             VALUES(?, ?, 'active', 0, ?, ?)`,
        );
        const attachDraft = connection.prepare(
          'UPDATE chapters SET active_draft_id = ? WHERE id = ?',
        );
        const insertBlock = connection.prepare(
          `INSERT INTO draft_blocks(
               id, draft_id, logical_block_id, order_key, block_type, text,
               attributes_json, source, locked, content_hash, revision
             ) VALUES(?, ?, ?, 1024, 'paragraph', ?, '{}', 'manual', 0, ?, 0)`,
        );

        for (let volumeIndex = 0; volumeIndex < VOLUME_COUNT; volumeIndex += 1) {
          const volumeId = randomUUID();
          insertVolume.run(
            volumeId,
            project.projectId,
            `第${volumeIndex + 1}卷`,
            (volumeIndex + 1) * 1024,
          );
          for (let localIndex = 0; localIndex < CHAPTERS_PER_VOLUME; localIndex += 1) {
            const chapterIndex = volumeIndex * CHAPTERS_PER_VOLUME + localIndex;
            const chapterId = randomUUID();
            const draftId = randomUUID();
            const logicalBlockId = randomUUID();
            const text = createChapterText(chapterIndex);
            const contentHash = draftContentHash({
              blockType: 'paragraph',
              content: text,
              attributes: {},
            });
            insertChapter.run(
              chapterId,
              volumeId,
              `第${chapterIndex + 1}章`,
              (localIndex + 1) * 1024,
            );
            insertDraft.run(draftId, chapterId, timestamp, timestamp);
            attachDraft.run(draftId, chapterId);
            insertBlock.run(randomUUID(), draftId, logicalBlockId, text, contentHash);
            chapters.push({ chapterId, draftId, text });
          }
        }

        const insertEntity = connection.prepare(
          `INSERT INTO entities(
               id, project_id, entity_type, name, aliases_json, summary, status,
               archived_at, created_at, updated_at
             ) VALUES(?, ?, ?, ?, ?, ?, 'active', NULL, ?, ?)`,
        );
        const insertFact = connection.prepare(
          `INSERT INTO canon_facts(
               id, project_id, entity_id, fact_key, value_json, description,
               source_type, source_id, status, confirmed_at, superseded_at, created_at
             ) VALUES(?, ?, ?, '定位', ?, ?, 'author', NULL, 'current', ?, NULL, ?)`,
        );
        for (let index = 0; index < ENTITY_COUNT; index += 1) {
          const entityId = randomUUID();
          const entityType = index < 100 ? 'character' : index < 125 ? 'location' : 'faction';
          entityIds.push(entityId);
          insertEntity.run(
            entityId,
            project.projectId,
            entityType,
            `实体${String(index + 1).padStart(3, '0')}`,
            JSON.stringify([`别名${index + 1}`]),
            `大作品恢复基线${entityType}设定${index + 1}`,
            timestamp,
            timestamp,
          );
          insertFact.run(
            randomUUID(),
            project.projectId,
            entityId,
            JSON.stringify(`设定值${index + 1}`),
            `权威事实${index + 1}`,
            timestamp,
            timestamp,
          );
        }

        const insertForeshadowing = connection.prepare(
          `INSERT INTO foreshadowings(
               id, project_id, title, description, status, reveal_from_chapter_id,
               reveal_by_chapter_id, created_at, updated_at
             ) VALUES(?, ?, ?, ?, 'planned', ?, ?, ?, ?)`,
        );
        for (let index = 0; index < FORESHADOWING_COUNT; index += 1) {
          const from = chapters[index * 2]!;
          const to = chapters[Math.min(CHAPTER_COUNT - 1, index * 2 + 80)]!;
          insertForeshadowing.run(
            randomUUID(),
            project.projectId,
            `伏笔${String(index + 1).padStart(3, '0')}`,
            `跨章节伏笔链${index + 1}`,
            from.chapterId,
            to.chapterId,
            timestamp,
            timestamp,
          );
        }

        const insertArc = connection.prepare(
          `INSERT INTO character_arcs(
               id, project_id, character_id, title, arc_type, custom_type, status,
               author_intent, created_at, updated_at
             ) VALUES(?, ?, ?, ?, 'growth', NULL, 'active', ?, ?, ?)`,
        );
        for (let index = 0; index < CHARACTER_ARC_COUNT; index += 1) {
          insertArc.run(
            randomUUID(),
            project.projectId,
            entityIds[index]!,
            `人物弧光${String(index + 1).padStart(2, '0')}`,
            `人物${index + 1}在大作品恢复基线中的阶段性成长`,
            timestamp,
            timestamp,
          );
        }
      });

      for (let index = 0; index < VERSION_COUNT; index += 1) {
        const chapter = chapters[index * 5]!;
        await versions.create(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.chapterId,
          draftId: chapter.draftId,
          baseRevision: 0,
          versionType: 'manual',
          title: `大作品恢复基线版本${String(index + 1).padStart(3, '0')}`,
          description: 'Phase 3 large-project backup/restore fixture',
          label: null,
        });
      }

      const characterCount = chapters.reduce((total, chapter) => total + chapter.text.length, 0);
      expect(characterCount).toBeGreaterThanOrEqual(1_500_000);

      const samples: { backupMs: number; restoreMs: number; sizeBytes: number }[] = [];
      let lastRestoredProjectId = '';
      let lastRestoredWorkspacePath = '';
      for (let sample = 0; sample < budget.sampleCount; sample += 1) {
        const backupStartedAt = performance.now();
        const backup = await recovery.createNamedSnapshot(randomUUID(), {
          projectId: project.projectId,
          authority: 'author',
          name: `Phase3大作品性能样本${sample + 1}`,
          note: 'backup/restore calibration',
        });
        const backupMs = performance.now() - backupStartedAt;

        const restoreParent = path.join(restoreRoot, `sample-${sample + 1}`);
        await mkdir(restoreParent, { recursive: true });
        const restoreStartedAt = performance.now();
        const restored = await recovery.restoreCheckpoint(
          randomUUID(),
          { projectId: project.projectId, backupId: backup.backupId },
          restoreParent,
        );
        const restoreMs = performance.now() - restoreStartedAt;
        samples.push({ backupMs, restoreMs, sizeBytes: backup.sizeBytes });
        lastRestoredProjectId = restored.projectId;
        lastRestoredWorkspacePath = restored.workspacePath;
      }

      expect(lastRestoredProjectId).not.toBe('');
      await workspace.close(randomUUID(), project.projectId);
      await workspace.open(randomUUID(), { workspacePath: lastRestoredWorkspacePath });
      const restoredShape = workspace.readProject(lastRestoredProjectId, (connection) => ({
        volumes: Number(connection.prepare('SELECT COUNT(*) AS count FROM volumes').get()?.count),
        chapters: Number(connection.prepare('SELECT COUNT(*) AS count FROM chapters').get()?.count),
        entities: Number(connection.prepare('SELECT COUNT(*) AS count FROM entities').get()?.count),
        foreshadowings: Number(
          connection.prepare('SELECT COUNT(*) AS count FROM foreshadowings').get()?.count,
        ),
        characterArcs: Number(
          connection.prepare('SELECT COUNT(*) AS count FROM character_arcs').get()?.count,
        ),
        versions: Number(connection.prepare('SELECT COUNT(*) AS count FROM versions').get()?.count),
      }));
      expect(restoredShape).toEqual({
        volumes: VOLUME_COUNT,
        chapters: CHAPTER_COUNT,
        entities: ENTITY_COUNT,
        foreshadowings: FORESHADOWING_COUNT,
        characterArcs: CHARACTER_ARC_COUNT,
        versions: VERSION_COUNT,
      });

      const summary = summarizeBackupRestoreSamples(samples);
      const evaluation = evaluateBackupRestoreBudget(
        summary,
        budget.status === 'enforced' ? budget.budget : null,
      );
      const output = await writeEvidence({
        schemaVersion: 1,
        phase: 'Phase 3',
        capability: 'large-project-backup-restore',
        generatedAt: new Date().toISOString(),
        budgetStatus: budget.status,
        environment: {
          platform: process.platform,
          architecture: process.arch,
          node: process.version,
          runner: process.env.CI ? 'ci' : 'local',
        },
        fixture: {
          volumes: VOLUME_COUNT,
          chapters: CHAPTER_COUNT,
          chapterCharacters: CHAPTER_CHARACTERS,
          minimumDraftCharacters: CHAPTER_COUNT * CHAPTER_CHARACTERS,
          entities: ENTITY_COUNT,
          foreshadowings: FORESHADOWING_COUNT,
          characterArcs: CHARACTER_ARC_COUNT,
          versions: VERSION_COUNT,
        },
        methodology: {
          sampleCount: budget.sampleCount,
          backupOperation: 'RecoveryService.createNamedSnapshot',
          restoreOperation: 'RecoveryService.restoreCheckpoint',
          backupIncludes: [
            'sqlite-online-backup',
            'database-verification',
            'sha256',
            'atomic-finalize',
          ],
          restoreIncludes: [
            'source-hash-verification',
            'source-database-verification',
            'copy-to-staging',
            'project-identity-remap',
            'restored-database-verification',
            'atomic-register',
          ],
          fixtureConstructionExcluded: true,
          restoredShapeVerified: true,
        },
        samples,
        summary,
        evaluation,
      });

      if (!evaluation.calibrated) {
        throw new Error(`BACKUP_RESTORE_BUDGET_PENDING: calibration evidence written to ${output}`);
      }
      if (!evaluation.passed) {
        throw new Error(
          `BACKUP_RESTORE_BUDGET_EXCEEDED: ${evaluation.violations.join(', ')}; evidence=${output}`,
        );
      }
    } finally {
      await workspace.shutdown();
      await appRuntime.close();
      await rm(root, { recursive: true, force: true });
    }
  }, 180_000);
});
