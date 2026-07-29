/* global console */
import { readFile, writeFile } from 'node:fs/promises';

const replacementsByFile = {
  'apps/desktop/renderer/src/features/writing/writing-core-workbench.tsx': [
    [
      '`已保存 · Revision ${result.data.revision}${JSON.stringify(instance.getJSON()) === signature ? \'\' : \' · 编辑器仍有新输入\'}`',
      '`已保存 · 保存序号 ${result.data.revision}${JSON.stringify(instance.getJSON()) === signature ? \'\' : \' · 编辑器仍有新输入\'}`',
    ],
    ['当前章节没有可用于生成的 SceneBeat。', '当前章节没有可用于生成的场景节拍。'],
    ['<option value="canonical_scene_beats">正式 SceneBeat</option>', '<option value="canonical_scene_beats">正式场景节拍</option>'],
    ['我已知晓正式 SceneBeat 或基础稿已变化，仍使用此骨架生成正文', '我已知晓正式场景节拍或基础稿已变化，仍使用此骨架生成正文'],
    ['<option value="beat">按正式 SceneBeat</option>', '<option value="beat">按正式场景节拍</option>'],
    ['不完整建议稿只能按块或SceneBeat采用，不能整稿替换。', '不完整建议稿只能按正文块或场景节拍采用，不能整稿替换。'],
    ['navigationVersionId={navigationVersionId}', 'navigationVersionId={navigationVersionId ?? null}'],
  ],
  'apps/desktop/renderer/src/features/canon/canon-core-workbench.tsx': [
    ['aria-label="生效章节ID"', 'aria-label="生效章节"'],
    ['placeholder="可选：生效章节UUID"', 'placeholder="可选：生效章节内部标识"'],
    ['实体UUID', '设定条目内部标识'],
    ['起始章节UUID', '起始章节内部标识'],
    ['结束章节UUID', '结束章节内部标识'],
    ['来源Version UUID', '来源历史版本内部标识'],
    ['章节UUID', '章节内部标识'],
    ['地点UUID', '地点内部标识'],
    ['人物UUID', '人物内部标识'],
    ['来源正文块UUID', '来源正文块内部标识'],
    ['真实 Provider 状态提取已启动', 'AI连接状态提取已启动'],
    ['          Final Version 章节', '          定稿版本章节'],
    ["{item.finalVersionId ? '' : '（尚无 Final Version）'}", "{item.finalVersionId ? '' : '（尚无定稿版本）'}"],
    ['          Provider\n', '          AI连接\n'],
    ['<option value="">选择 Provider</option>', '<option value="">选择AI连接</option>'],
    ['从 Final Version 提取', '从定稿版本提取'],
    [' · Version {batch.sourceVersionId}', ' · 历史版本 {batch.sourceVersionId}'],
    ['selectedEntityId={selectedEntityId}', 'selectedEntityId={selectedEntityId ?? null}'],
  ],
};

for (const [filePath, replacements] of Object.entries(replacementsByFile)) {
  let source = await readFile(filePath, 'utf8');
  for (const [before, after] of replacements) {
    if (!source.includes(before)) {
      throw new Error(`${filePath} 缺少预期片段：${before.slice(0, 140)}`);
    }
    source = source.replaceAll(before, after);
  }
  await writeFile(filePath, source, 'utf8');
}

console.log('精准跳转涉及页面的剩余作者可见工程词已清理。');
