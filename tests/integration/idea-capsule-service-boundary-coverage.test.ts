import { randomUUID } from 'node:crypto';

import type { IdeaConversionTarget, IdeaSourceContext } from '@worldforge/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { EntityCanonService } from '../../packages/core-service/src/entity-canon.js';
import {
  IdeaCapsuleService,
  type IdeaCapsuleServiceError,
} from '../../packages/core-service/src/idea-capsule-service.js';
import { SceneBeatService } from '../../packages/core-service/src/scene-beat.js';
import {
  candidateApplyClock,
  cleanupCandidateApplyDirectories,
  closeCandidateApplyHarness,
  createCandidateApplyHarness,
  createTwoBlockDraft,
} from './candidate-apply-fixture.js';

afterEach(async () => {
  await cleanupCandidateApplyDirectories();
});

function baseIdea(projectId: string, sourceContext: IdeaSourceContext, title: string) {
  return {
    projectId,
    ideaKind: 'plot' as const,
    title,
    summary: `${title}摘要`,
    content: `${title}正文`,
    divergenceLevel: 'different' as const,
    depthLevel: 'expand' as const,
    sourceContext,
  };
}

async function createIdea(
  ideas: IdeaCapsuleService,
  projectId: string,
  title: string,
  sourceContext: IdeaSourceContext = {
    scopeType: 'project',
    scopeId: projectId,
    chapterId: null,
  },
) {
  return ideas.create(randomUUID(), baseIdea(projectId, sourceContext, title));
}

function projectBriefTarget(): IdeaConversionTarget {
  return {
    targetType: 'project_brief',
    draft: {
      concept: '新的作品核心',
      readingPromise: '持续升级的悬念',
      protagonistGoal: '找出真相',
      coreConflict: '旧秩序与新选择',
      endingIntent: '主动破局',
      required: ['保留暗号伏笔'],
      forbidden: ['禁止失忆'],
    },
  };
}

function plotTarget(title = '镜像城门'): IdeaConversionTarget {
  return {
    targetType: 'plot_node',
    draft: {
      parentId: null,
      nodeType: 'arc',
      title,
      goal: '进入主线',
      coreConflict: '真相提前泄露',
      expectedResult: '主角改变计划',
      status: 'outlined',
    },
  };
}

function entityTarget(name = '守门人'): IdeaConversionTarget {
  return {
    targetType: 'entity',
    draft: {
      entityType: 'character',
      name,
      aliases: ['老周'],
      summary: '知道城门过去版本的人。',
    },
  };
}

function canonFactTarget(entityId: string): IdeaConversionTarget {
  return {
    targetType: 'canon_fact',
    draft: {
      entityId,
      factKey: 'secret',
      value: '知道城门暗号',
      description: '由灵感转换进入正式设定',
    },
  };
}

function timelineTarget(): IdeaConversionTarget {
  return {
    targetType: 'timeline_event',
    draft: {
      title: '夜渡清河',
      startValue: '三更',
      endValue: null,
      precision: 'approximate',
      chapterId: null,
      locationId: null,
      description: '追兵抵达前渡河',
      participantIds: [],
      witnessIds: [],
      subjectIds: [],
      dependencyIds: [],
    },
  };
}

function foreshadowingTarget(): IdeaConversionTarget {
  return {
    targetType: 'foreshadowing',
    draft: {
      title: '渡口暗号',
      description: '后续回收',
      revealFromChapterId: null,
      revealByChapterId: null,
      chapterLinks: [],
      relations: [],
    },
  };
}

async function previewAndApply(
  ideas: IdeaCapsuleService,
  projectId: string,
  ideaId: string,
  target: IdeaConversionTarget,
) {
  const preview = ideas.previewConversion({ projectId, ideaId, target });
  return {
    preview,
    applied: await ideas.applyConversion(randomUUID(), {
      projectId,
      ideaId,
      target,
      previewHash: preview.previewHash,
    }),
  };
}

describe('IdeaCapsuleService boundary coverage', () => {
  it('accepts all six source scopes and rejects stale or cross-project source identities', async () => {
    const harness = await createCandidateApplyHarness();
    try {
      const { project, chapter, draft } = await createTwoBlockDraft(harness);
      const ideas = new IdeaCapsuleService(harness.workspace, { clock: candidateApplyClock });
      const volume = harness.structure.list(project.projectId).volumes[0]!;
      const beat = (
        await new SceneBeatService(harness.workspace, { clock: candidateApplyClock }).create(
          randomUUID(),
          {
            projectId: project.projectId,
            chapterId: chapter.id,
            plotNodeId: null,
            title: '灵感来源场景',
            goal: '',
            coreConflict: '',
            expectedResult: '',
            beatType: 'setup',
            wordTargetPercent: 10,
            required: true,
            characterIds: [],
            locationIds: [],
          },
        )
      ).beats[0]!;
      const entity = (
        await new EntityCanonService(harness.workspace, { clock: candidateApplyClock }).create(
          randomUUID(),
          {
            projectId: project.projectId,
            authority: 'author',
            entityType: 'character',
            name: '灵感来源人物',
            aliases: [],
            summary: '',
          },
        )
      ).entities[0]!;
      const selectionId = draft.blocks[0]!.logicalBlockId;

      const contexts: IdeaSourceContext[] = [
        { scopeType: 'project', scopeId: project.projectId, chapterId: chapter.id },
        { scopeType: 'volume', scopeId: volume.id, chapterId: null },
        { scopeType: 'chapter', scopeId: chapter.id, chapterId: chapter.id },
        { scopeType: 'scene', scopeId: beat.id, chapterId: chapter.id },
        { scopeType: 'entity', scopeId: entity.id, chapterId: chapter.id },
        { scopeType: 'selection', scopeId: selectionId, chapterId: chapter.id },
      ];
      for (const [index, sourceContext] of contexts.entries()) {
        const idea = await createIdea(
          ideas,
          project.projectId,
          `范围-${sourceContext.scopeType}-${index}`,
          sourceContext,
        );
        expect(idea.sourceContext).toEqual(sourceContext);
      }

      await expect(
        createIdea(ideas, project.projectId, '错误项目范围', {
          scopeType: 'project',
          scopeId: randomUUID(),
          chapterId: null,
        }),
      ).rejects.toMatchObject<IdeaCapsuleServiceError>({ code: 'IDEA_INVALID' });
      await expect(
        createIdea(ideas, project.projectId, '章节身份不一致', {
          scopeType: 'chapter',
          scopeId: chapter.id,
          chapterId: randomUUID(),
        }),
      ).rejects.toMatchObject<IdeaCapsuleServiceError>({ code: 'IDEA_INVALID' });
      await expect(
        createIdea(ideas, project.projectId, '兼容章节不存在', {
          scopeType: 'entity',
          scopeId: entity.id,
          chapterId: randomUUID(),
        }),
      ).rejects.toMatchObject<IdeaCapsuleServiceError>({ code: 'IDEA_INVALID' });
      for (const scopeType of ['volume', 'scene', 'entity', 'selection'] as const) {
        await expect(
          createIdea(ideas, project.projectId, `失效-${scopeType}`, {
            scopeType,
            scopeId: randomUUID(),
            chapterId: null,
          }),
        ).rejects.toMatchObject<IdeaCapsuleServiceError>({ code: 'IDEA_INVALID' });
      }
    } finally {
      await closeCandidateApplyHarness(harness);
    }
  });

  it('covers default options, pagination/status filters, missing rows and persisted source corruption', async () => {
    const harness = await createCandidateApplyHarness();
    try {
      const { project } = await createTwoBlockDraft(harness);
      const ideas = new IdeaCapsuleService(harness.workspace);
      const created = [];
      for (const title of ['分页甲', '分页乙', '分页丙']) {
        created.push(await createIdea(ideas, project.projectId, title));
      }
      await ideas.setStatus(randomUUID(), {
        projectId: project.projectId,
        ideaId: created[0]!.id,
        status: 'favorite',
      });

      const first = ideas.list({
        projectId: project.projectId,
        status: null,
        limit: 2,
        cursor: null,
      });
      expect(first.ideas).toHaveLength(2);
      expect(first.nextCursor).not.toBeNull();
      const second = ideas.list({
        projectId: project.projectId,
        status: null,
        limit: 2,
        cursor: first.nextCursor,
      });
      expect(second.ideas).toHaveLength(1);
      expect(second.nextCursor).toBeNull();
      expect(
        ideas.list({ projectId: project.projectId, status: 'favorite', limit: 50, cursor: null })
          .ideas,
      ).toHaveLength(1);
      expect(
        ideas.list({ projectId: project.projectId, status: 'discarded', limit: 50, cursor: null })
          .ideas,
      ).toHaveLength(0);
      await expect(
        Promise.resolve().then(() =>
          ideas.get({ projectId: project.projectId, ideaId: randomUUID() }),
        ),
      ).rejects.toMatchObject<IdeaCapsuleServiceError>({ code: 'IDEA_NOT_FOUND' });

      await harness.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database.exec('PRAGMA ignore_check_constraints = ON');
        database
          .prepare('UPDATE idea_cards SET source_context_json = ? WHERE id = ?')
          .run('{broken', created[1]!.id);
        database.exec('PRAGMA ignore_check_constraints = OFF');
      });
      expect(() => ideas.get({ projectId: project.projectId, ideaId: created[1]!.id })).toThrow(
        expect.objectContaining({ code: 'IDEA_INVARIANT' }),
      );
    } finally {
      await closeCandidateApplyHarness(harness);
    }
  });

  it('previews and atomically applies every conversion target, then reports dynamic target lifecycle', async () => {
    const harness = await createCandidateApplyHarness();
    try {
      const { project } = await createTwoBlockDraft(harness);
      const ideas = new IdeaCapsuleService(harness.workspace, { clock: candidateApplyClock });

      const briefIdea = await createIdea(ideas, project.projectId, '作品核心灵感');
      const brief = await previewAndApply(
        ideas,
        project.projectId,
        briefIdea.id,
        projectBriefTarget(),
      );
      expect(brief.preview.summary).toBe('更新作品核心');

      const plotIdea = await createIdea(ideas, project.projectId, '情节灵感');
      const plot = await previewAndApply(ideas, project.projectId, plotIdea.id, plotTarget());
      expect(plot.preview.summary).toBe('创建情节节点：镜像城门');

      const entityIdea = await createIdea(ideas, project.projectId, '人物灵感');
      const entity = await previewAndApply(ideas, project.projectId, entityIdea.id, entityTarget());
      expect(entity.preview.summary).toBe('创建character实体：守门人');

      const factIdea = await createIdea(ideas, project.projectId, '设定事实灵感');
      const factTarget = canonFactTarget(entity.applied.conversion.targetId);
      const fact = await previewAndApply(ideas, project.projectId, factIdea.id, factTarget);
      expect(fact.preview.summary).toBe('写入设定事实：secret');

      const timelineIdea = await createIdea(ideas, project.projectId, '时间线灵感');
      const timeline = await previewAndApply(
        ideas,
        project.projectId,
        timelineIdea.id,
        timelineTarget(),
      );
      expect(timeline.preview.summary).toBe('创建时间线事件：夜渡清河');

      const foreshadowIdea = await createIdea(ideas, project.projectId, '伏笔灵感');
      const foreshadow = await previewAndApply(
        ideas,
        project.projectId,
        foreshadowIdea.id,
        foreshadowingTarget(),
      );
      expect(foreshadow.preview.summary).toBe('创建伏笔：渡口暗号');

      for (const item of [brief, plot, entity, fact, timeline, foreshadow]) {
        expect(item.applied.conversion.status).toBe('applied');
      }

      await harness.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database
          .prepare("UPDATE entities SET status = 'archived', archived_at = ? WHERE id = ?")
          .run(candidateApplyClock.now().toISOString(), entity.applied.conversion.targetId);
        database
          .prepare("UPDATE canon_facts SET status = 'historical', superseded_at = ? WHERE id = ?")
          .run(candidateApplyClock.now().toISOString(), fact.applied.conversion.targetId);
        database
          .prepare("UPDATE timeline_events SET status = 'archived', archived_at = ? WHERE id = ?")
          .run(candidateApplyClock.now().toISOString(), timeline.applied.conversion.targetId);
        database
          .prepare('DELETE FROM foreshadowings WHERE id = ?')
          .run(foreshadow.applied.conversion.targetId);
        database
          .prepare('DELETE FROM project_briefs WHERE id = ?')
          .run(brief.applied.conversion.targetId);
      });
      expect(
        ideas.get({ projectId: project.projectId, ideaId: entityIdea.id }).conversion?.status,
      ).toBe('target_stale');
      expect(
        ideas.get({ projectId: project.projectId, ideaId: factIdea.id }).conversion?.status,
      ).toBe('target_stale');
      expect(
        ideas.get({ projectId: project.projectId, ideaId: timelineIdea.id }).conversion?.status,
      ).toBe('target_stale');
      expect(
        ideas.get({ projectId: project.projectId, ideaId: foreshadowIdea.id }).conversion?.status,
      ).toBe('target_missing');
      expect(
        ideas.get({ projectId: project.projectId, ideaId: briefIdea.id }).conversion?.status,
      ).toBe('target_missing');

      await harness.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database
          .prepare('DELETE FROM canon_facts WHERE id = ?')
          .run(fact.applied.conversion.targetId);
        database
          .prepare('DELETE FROM timeline_events WHERE id = ?')
          .run(timeline.applied.conversion.targetId);
      });
      expect(
        ideas.get({ projectId: project.projectId, ideaId: factIdea.id }).conversion?.status,
      ).toBe('target_missing');
      expect(
        ideas.get({ projectId: project.projectId, ideaId: timelineIdea.id }).conversion?.status,
      ).toBe('target_missing');

      const missingEntityIdea = await createIdea(ideas, project.projectId, '实体缺失灵感');
      const missingEntity = await previewAndApply(
        ideas,
        project.projectId,
        missingEntityIdea.id,
        entityTarget('临时人物'),
      );
      await harness.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database
          .prepare('DELETE FROM entities WHERE id = ?')
          .run(missingEntity.applied.conversion.targetId);
      });
      expect(
        ideas.get({ projectId: project.projectId, ideaId: missingEntityIdea.id }).conversion
          ?.status,
      ).toBe('target_missing');
    } finally {
      await closeCandidateApplyHarness(harness);
    }
  });

  it('rejects terminal and duplicate conversion states and proves the missing-audit invariant rolls back', async () => {
    const harness = await createCandidateApplyHarness();
    try {
      const { project } = await createTwoBlockDraft(harness);
      const ideas = new IdeaCapsuleService(harness.workspace, { clock: candidateApplyClock });

      const discarded = await createIdea(ideas, project.projectId, '已丢弃灵感');
      await ideas.setStatus(randomUUID(), {
        projectId: project.projectId,
        ideaId: discarded.id,
        status: 'discarded',
      });
      await expect(
        ideas.setStatus(randomUUID(), {
          projectId: project.projectId,
          ideaId: discarded.id,
          status: 'favorite',
        }),
      ).rejects.toMatchObject<IdeaCapsuleServiceError>({ code: 'IDEA_CONFLICT' });
      expect(() =>
        ideas.previewConversion({
          projectId: project.projectId,
          ideaId: discarded.id,
          target: plotTarget(),
        }),
      ).toThrow(expect.objectContaining({ code: 'IDEA_CONFLICT' }));
      const fakeHash = '0'.repeat(64);
      await expect(
        ideas.applyConversion(randomUUID(), {
          projectId: project.projectId,
          ideaId: discarded.id,
          target: plotTarget(),
          previewHash: fakeHash,
        }),
      ).rejects.toMatchObject<IdeaCapsuleServiceError>({ code: 'IDEA_CONFLICT' });

      const converted = await createIdea(ideas, project.projectId, '已转换灵感');
      const convertedResult = await previewAndApply(
        ideas,
        project.projectId,
        converted.id,
        plotTarget(),
      );
      await expect(
        ideas.setStatus(randomUUID(), {
          projectId: project.projectId,
          ideaId: converted.id,
          status: 'favorite',
        }),
      ).rejects.toMatchObject<IdeaCapsuleServiceError>({ code: 'IDEA_CONFLICT' });
      expect(() =>
        ideas.previewConversion({
          projectId: project.projectId,
          ideaId: converted.id,
          target: plotTarget(),
        }),
      ).toThrow(expect.objectContaining({ code: 'IDEA_CONFLICT' }));
      await expect(
        ideas.applyConversion(randomUUID(), {
          projectId: project.projectId,
          ideaId: converted.id,
          target: plotTarget(),
          previewHash: convertedResult.preview.previewHash,
        }),
      ).rejects.toMatchObject<IdeaCapsuleServiceError>({ code: 'IDEA_CONFLICT' });

      const duplicate = await createIdea(ideas, project.projectId, '重复审计灵感');
      await harness.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database
          .prepare(
            `INSERT INTO idea_conversions(
               id, project_id, idea_id, target_type, target_id, preview_hash, status, created_at
             ) VALUES(?, ?, ?, 'plot_node', ?, ?, 'applied', ?)`,
          )
          .run(
            randomUUID(),
            project.projectId,
            duplicate.id,
            randomUUID(),
            '1'.repeat(64),
            candidateApplyClock.now().toISOString(),
          );
      });
      expect(() =>
        ideas.previewConversion({
          projectId: project.projectId,
          ideaId: duplicate.id,
          target: plotTarget(),
        }),
      ).toThrow(expect.objectContaining({ code: 'IDEA_CONFLICT' }));
      await expect(
        ideas.applyConversion(randomUUID(), {
          projectId: project.projectId,
          ideaId: duplicate.id,
          target: plotTarget(),
          previewHash: '1'.repeat(64),
        }),
      ).rejects.toMatchObject<IdeaCapsuleServiceError>({ code: 'IDEA_CONFLICT' });

      await harness.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database.exec('PRAGMA ignore_check_constraints = ON');
        database
          .prepare('UPDATE idea_conversions SET target_type = ? WHERE idea_id = ?')
          .run('corrupt_target_type', duplicate.id);
        database.exec('PRAGMA ignore_check_constraints = OFF');
      });
      expect(() => ideas.get({ projectId: project.projectId, ideaId: duplicate.id })).toThrow();

      const missingAudit = await createIdea(ideas, project.projectId, '审计丢失灵感');
      const preview = ideas.previewConversion({
        projectId: project.projectId,
        ideaId: missingAudit.id,
        target: plotTarget('审计丢失节点'),
      });
      await harness.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database.exec(`CREATE TRIGGER idea_boundary_delete_audit
          AFTER UPDATE OF status ON idea_cards
          WHEN NEW.id = '${missingAudit.id}' AND NEW.status = 'converted'
          BEGIN
            DELETE FROM idea_conversions WHERE idea_id = NEW.id;
          END;`);
      });
      await expect(
        ideas.applyConversion(randomUUID(), {
          projectId: project.projectId,
          ideaId: missingAudit.id,
          target: plotTarget('审计丢失节点'),
          previewHash: preview.previewHash,
        }),
      ).rejects.toMatchObject<IdeaCapsuleServiceError>({ code: 'IDEA_INVARIANT' });
      expect(ideas.get({ projectId: project.projectId, ideaId: missingAudit.id }).idea.status).toBe(
        'active',
      );
      expect(
        harness.workspace.readProject(project.projectId, (database) =>
          Number(
            database
              .prepare('SELECT COUNT(*) AS count FROM plot_nodes WHERE title = ?')
              .get('审计丢失节点')!.count,
          ),
        ),
      ).toBe(0);
    } finally {
      await closeCandidateApplyHarness(harness);
    }
  });
});
