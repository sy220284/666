import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const rendererRoot = path.join(process.cwd(), 'apps/desktop/renderer/src');

async function rendererSource(relativePath: string): Promise<string> {
  return readFile(path.join(rendererRoot, relativePath), 'utf8');
}

describe('M11-01 中文作者体验与交互减负', () => {
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

  it('AI设定建议不再要求作者填写JSON或查看百分比可信度', async () => {
    const [panel, authorEdit] = await Promise.all([
      rendererSource('features/canon/state-proposal-panel.tsx'),
      rendererSource('features/canon/state-proposal-author-edit.ts'),
    ]);

    expect(panel).toContain('<h2>AI设定建议与章节状态</h2>');
    expect(panel).toContain('修改后接受');
    expect(authorEdit).toContain('parseAuthorValue(valueType, input)');
    expect(authorEdit).toContain("if (confidence >= 0.8) return '高'");
    expect(authorEdit).toContain("if (confidence >= 0.5) return '中'");
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
    expect(panel).toContain("proposal.freshness === 'stale'");
    expect(panel).toContain("proposal.actionability !== 'accept'");
    expect(panel).toContain('来源定稿已经变化 · 这条旧建议只能忽略');
    expect(authorEdit).toContain("value: { status: 'hit', actualChapterId: proposal.chapterId }");
    expect(authorEdit).toContain("value: { status: 'skipped', actualChapterId: null }");
  });
});
