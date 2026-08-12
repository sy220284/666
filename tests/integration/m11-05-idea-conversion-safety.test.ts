import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import { ProjectPlanningService } from '../../packages/core-service/src/project-planning.js';
import { SafeIdeaCapsuleService } from '../../packages/core-service/src/safe-idea-capsule-service.js';
import {
  cleanupCandidateApplyDirectories,
  closeCandidateApplyHarness,
  createCandidateApplyHarness,
} from './candidate-apply-fixture.js';

afterEach(cleanupCandidateApplyDirectories);

describe('M11-05 Idea conversion author-data safety', () => {
  it('preserves existing Project Brief fields and rejects a preview after the author edits the target', async () => {
    const harness = await createCandidateApplyHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '灵感转换保护', channel: '长篇', initialStructure: 'blank' },
        harness.parent,
      );
      const planning = new ProjectPlanningService(harness.workspace);
      const ideas = new SafeIdeaCapsuleService(harness.workspace);

      await planning.updateBrief(randomUUID(), {
        projectId: project.projectId,
        concept: '旧作品核心',
        readingPromise: '旧阅读承诺',
        protagonistGoal: '找到失踪的姐姐',
        coreConflict: '家族真相与个人选择冲突',
        endingIntent: '主角主动离开旧秩序',
        required: ['姐姐必须在中期回归'],
        forbidden: ['禁止失忆解谜'],
      });

      const idea = await ideas.create(randomUUID(), {
        projectId: project.projectId,
        ideaKind: 'new_book',
        title: '镜城新书方向',
        summary: '一座城市每天都会重写自己的历史。',
        content: '主角发现只有自己保留前一天的记忆，并逐步追查历史被改写的原因。',
        divergenceLevel: 'different',
        depthLevel: 'deep',
        sourceContext: {
          scopeType: 'project',
          scopeId: project.projectId,
          chapterId: null,
        },
      });

      const target = {
        targetType: 'project_brief' as const,
        draft: {
          concept: idea.summary,
          readingPromise: idea.content,
          protagonistGoal: '',
          coreConflict: '',
          endingIntent: '',
          required: [],
          forbidden: [],
        },
      };
      const preview = ideas.previewConversion({
        projectId: project.projectId,
        ideaId: idea.id,
        target,
      });

      expect(preview.target).toEqual({
        targetType: 'project_brief',
        draft: {
          concept: idea.summary,
          readingPromise: idea.content,
          protagonistGoal: '找到失踪的姐姐',
          coreConflict: '家族真相与个人选择冲突',
          endingIntent: '主角主动离开旧秩序',
          required: ['姐姐必须在中期回归'],
          forbidden: ['禁止失忆解谜'],
        },
      });

      await planning.updateBrief(randomUUID(), {
        projectId: project.projectId,
        concept: '作者刚刚手工修改的作品核心',
        readingPromise: '作者刚刚手工修改的阅读承诺',
        protagonistGoal: '先救姐姐，再查城市真相',
        coreConflict: '家族真相与个人选择冲突',
        endingIntent: '主角主动离开旧秩序',
        required: ['姐姐必须在中期回归'],
        forbidden: ['禁止失忆解谜'],
      });

      await expect(
        ideas.applyConversion(randomUUID(), {
          projectId: project.projectId,
          ideaId: idea.id,
          target: preview.target,
          previewHash: preview.previewHash,
        }),
      ).rejects.toMatchObject({ code: 'IDEA_CONFLICT' });
      expect(planning.getBrief(project.projectId)).toMatchObject({
        concept: '作者刚刚手工修改的作品核心',
        protagonistGoal: '先救姐姐，再查城市真相',
      });

      const freshPreview = ideas.previewConversion({
        projectId: project.projectId,
        ideaId: idea.id,
        target,
      });
      await ideas.applyConversion(randomUUID(), {
        projectId: project.projectId,
        ideaId: idea.id,
        target: freshPreview.target,
        previewHash: freshPreview.previewHash,
      });

      expect(planning.getBrief(project.projectId)).toMatchObject({
        concept: idea.summary,
        readingPromise: idea.content,
        protagonistGoal: '先救姐姐，再查城市真相',
        coreConflict: '家族真相与个人选择冲突',
        endingIntent: '主角主动离开旧秩序',
        required: ['姐姐必须在中期回归'],
        forbidden: ['禁止失忆解谜'],
      });
    } finally {
      await closeCandidateApplyHarness(harness);
    }
  });
});
