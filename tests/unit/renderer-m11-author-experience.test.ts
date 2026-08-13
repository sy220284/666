import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const rendererRoot = path.join(process.cwd(), 'apps/desktop/renderer/src');

async function rendererSource(relativePath: string): Promise<string> {
  return readFile(path.join(rendererRoot, relativePath), 'utf8');
}

describe('M11 中文作者体验与智能审阅', () => {
  it('规划入口使用作品核心与场景的中文作者语境', async () => {
    const [brief, planningMode] = await Promise.all([
      rendererSource('features/planning/brief/project-brief-editor.tsx'),
      rendererSource('features/planning/planning-mode-workbench.tsx'),
    ]);

    expect(brief).toContain('<h2>作品核心</h2>');
    expect(brief).toContain('保存作品核心');
    expect(brief).not.toContain('<h2>ProjectBrief</h2>');
    expect(planningMode).toContain('完整大纲、卷章、场景和作品核心');
    expect(planningMode).not.toContain('场景节拍和作品任务书');
  });

  it('智能审阅不要求作者填写JSON或查看百分比可信度', async () => {
    const [panel, authorEdit, reviewModel] = await Promise.all([
      rendererSource('features/canon/state-proposal-panel.tsx'),
      rendererSource('features/canon/state-proposal-author-edit.ts'),
      rendererSource('features/canon/ai-review-model.ts'),
    ]);

    expect(panel).toContain('<h2>智能审阅与章节状态</h2>');
    expect(panel).toContain('修改后接受');
    expect(panel).toContain('data-ai-review-status-filter');
    expect(panel).toContain('data-ai-review-type-filter');
    expect(authorEdit).toContain('parseAuthorValue(valueType, input)');
    expect(reviewModel).toContain("if (confidence >= 0.8) return 'high'");
    expect(reviewModel).toContain("if (confidence >= 0.5) return 'medium'");
    expect(`${panel}\n${authorEdit}`).not.toContain('请输入合法JSON作为最终值');
    expect(`${panel}\n${authorEdit}`).not.toContain('JSON.parse(edited)');
    expect(panel).not.toContain('Math.round(proposal.confidence * 100)');
  });

  it('作者编辑继续保留现有值类型和来源新鲜度保护', async () => {
    const [panel, authorEdit] = await Promise.all([
      rendererSource('features/canon/state-proposal-panel.tsx'),
      rendererSource('features/canon/state-proposal-author-edit.ts'),
    ]);

    expect(authorEdit).toContain("valueType === 'boolean'");
    expect(authorEdit).toContain("valueType === 'list'");
    expect(panel).toContain("review.freshness === 'stale'");
    expect(panel).toContain("review.actionability !== 'accept'");
    expect(panel).toContain('来源定稿已经变化 · 这条旧建议只能忽略');
    expect(authorEdit).toContain("value: { status: 'hit', actualChapterId: proposal.chapterId }");
    expect(authorEdit).toContain("value: { status: 'skipped', actualChapterId: null }");
  });

  it('场景关联、拆章和跨章移段使用可视正文选择且保留安全预览', async () => {
    const [scenePanel, structureOperations, picker] = await Promise.all([
      rendererSource('features/planning/scenes/scene-beat-panel.tsx'),
      rendererSource('features/structure/structure-operation-dialog.tsx'),
      rendererSource('features/writing/draft-block-picker.tsx'),
    ]);

    expect(scenePanel).toContain('pickMultipleBlocks({');
    expect(scenePanel).not.toContain('正文段落序号');
    expect(structureOperations).toContain('pickMultipleBlocks({');
    expect(structureOperations).toContain('pickBlockAnchor({');
    expect(structureOperations).not.toContain('在第几个正文段落后拆分');
    expect(structureOperations).not.toContain('正文段落序号');
    expect(structureOperations).toContain('planHash: preview.planHash');
    expect(structureOperations).toContain('确认移动并创建恢复点');
    expect(picker).toContain('data-draft-block-picker');
    expect(picker).toContain('disableLocked');
  });

  it('普通连续性录入不暴露JSON或内部段落标识输入', async () => {
    const continuity = await rendererSource('features/canon/continuity-editors.tsx');

    expect(continuity).not.toContain('<option value="json">');
    expect(continuity).not.toContain('name="sourceLogicalBlockId"');
    expect(continuity).toContain('选择来源正文段落');
    expect(continuity).toContain("labelMode: 'select'");
    expect(continuity).toContain('sourceLogicalBlockId: knowledgeSourceBlockId');
  });
});
