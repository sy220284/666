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
    const source = await rendererSource('features/canon/state-proposal-panel.tsx');

    expect(source).toContain('<h2>AI设定建议与章节状态</h2>');
    expect(source).toContain('修改后接受');
    expect(source).toContain('parseAuthorValue(valueType, input)');
    expect(source).toContain("if (confidence >= 0.8) return '高'");
    expect(source).toContain("if (confidence >= 0.5) return '中'");
    expect(source).not.toContain('请输入合法JSON作为最终值');
    expect(source).not.toContain('JSON.parse(edited)');
    expect(source).not.toContain('Math.round(proposal.confidence * 100)');
  });

  it('作者编辑继续保留现有值类型和来源新鲜度保护', async () => {
    const source = await rendererSource('features/canon/state-proposal-panel.tsx');

    expect(source).toContain("valueType === 'boolean'");
    expect(source).toContain("valueType === 'list'");
    expect(source).toContain("proposal.freshness === 'stale'");
    expect(source).toContain("proposal.actionability !== 'accept'");
    expect(source).toContain('来源定稿已经变化 · 这条旧建议只能忽略');
    expect(source).toContain("value: { status: 'hit', actualChapterId: proposal.chapterId }");
    expect(source).toContain("value: { status: 'skipped', actualChapterId: null }");
  });
});
