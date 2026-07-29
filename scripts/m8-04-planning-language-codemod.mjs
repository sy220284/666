/* global console */
import { readFile, writeFile } from 'node:fs/promises';

const replacementsByFile = {
  'apps/desktop/renderer/src/features/home/home-page.tsx': [
    [
      '可先补充作品规划和人物边界，也可以直接继续正文；项目能力不会受影响。',
      '可先补充作品规划和人物边界，也可以直接继续正文；作品功能不会受影响。',
    ],
    [
      "<legend>{entry === 'complete' ? '1. 项目基础' : '项目基础'}</legend>",
      "<legend>{entry === 'complete' ? '1. 作品基础' : '作品基础'}</legend>",
    ],
    [
      '创建安全工作区后进入导入预览；只有确认预览才会写入稿件内容。',
      '创建安全作品目录后进入导入预览；只有确认预览才会写入稿件内容。',
    ],
  ],
  'apps/desktop/renderer/src/features/settings/settings-page.tsx': [
    [
      '选择启动行为和默认信息披露模式。模式切换不会改变数据与命令。',
      '选择启动行为和默认信息显示方式。切换显示方式不会改变作品数据与功能。',
    ],
    ['<span>创作路径</span>', '<span>创作方式</span>'],
  ],
  'apps/desktop/renderer/src/features/planning/professional-planning-workbench.tsx': [
    [
      "import { useBridgeCommand, useBridgeQuery } from '../../bridge/use-bridge-resource.js';",
      `import { useBridgeCommand, useBridgeQuery } from '../../bridge/use-bridge-resource.js';\nimport { AuthorErrorNotice } from '../../components/author-error-notice.js';\nimport { authorErrorSummary } from '../../presentation/author-error-message.js';\nimport {\n  authorCharacterArcStatusLabel,\n  authorEntityTypeLabel,\n  authorForeshadowingStatusLabel,\n  authorPlotNodeTypeLabel,\n  authorSceneBeatTypeLabel,\n} from '../../presentation/author-value-format.js';`,
    ],
    ['<span>{entity.entityType}</span>', '<span>{authorEntityTypeLabel(entity.entityType)}</span>'],
    ['<span>{item.status}</span>', '<span>{authorForeshadowingStatusLabel(item.status)}</span>'],
    [
      '{arc.status} · 节点 {arc.milestones.length}',
      '{authorCharacterArcStatusLabel(arc.status)} · 节点 {arc.milestones.length}',
    ],
    [
      '{node.nodeType} · {statusLabel(node.status)}',
      '{authorPlotNodeTypeLabel(node.nodeType)} · {statusLabel(node.status)}',
    ],
    [
      '{beat.beatType} · {beat.wordTargetPercent}%',
      '{authorSceneBeatTypeLabel(beat.beatType)} · {beat.wordTargetPercent}%',
    ],
    [
      `              <option key={type} value={type}>\n                {type}\n              </option>`,
      `              <option key={type} value={type}>\n                {authorSceneBeatTypeLabel(type)}\n              </option>`,
    ],
    ['生命周期与目标字数由Core维护。', '生命周期与目标字数由本地服务维护。'],
    ['恢复保留原始排序；永久删除先由Core计算影响。', '恢复保留原始排序；永久删除先由本地服务计算影响。'],
    ['影响已由Core校验。', '影响已由本地服务校验。'],
    ['删除SceneBeat“${beat.title}”？正文不会变化。', '删除场景节拍“${beat.title}”？正文不会变化。'],
    ['SceneBeat已移入已删除列表；正文未变化。', '场景节拍已移入已删除列表；正文未变化。'],
    ['正文块序号无效，未修改SceneBeat。', '正文块序号无效，未修改场景节拍。'],
    ['SceneBeat正文块引用已更新；正文内容和顺序未变化。', '场景节拍的正文块引用已更新；正文内容和顺序未变化。'],
    ['SceneBeat顺序已更新；正文未变化。', '场景节拍顺序已更新；正文未变化。'],
    ['需要至少两个章节才能跨章移动SceneBeat。', '需要至少两个章节才能跨章移动场景节拍。'],
    ['SceneBeat跨章预览：${impact}', '场景节拍跨章预览：${impact}'],
    ['SceneBeat已跨章移动；正文块未自动移动。', '场景节拍已跨章移动；正文块未自动移动。'],
    ['新建SceneBeat', '新建场景节拍'],
    ['当前章节尚无SceneBeat。', '当前章节尚无场景节拍。'],
    ['已删除SceneBeat', '已删除场景节拍'],
    ['SceneBeat已保存；正文未发生变化。', '场景节拍已保存；正文未发生变化。'],
    ['编辑SceneBeat', '编辑场景节拍'],
    ['${command.error.message} · ${command.error.code}', '${authorErrorSummary(command.error)}'],
    [
      `        {command.error ? (\n          <p className="form-error">\n            {authorErrorSummary(command.error)}\n          </p>\n        ) : null}`,
      `        {command.error ? <AuthorErrorNotice error={command.error} /> : null}`,
    ],
    [
      `      <span>\n        {error.message} · {error.code}\n      </span>`,
      `      <AuthorErrorNotice error={error} className="inline-error__message" />`,
    ],
  ],
};

async function replaceRequired(filePath, replacements) {
  let source = await readFile(filePath, 'utf8');
  for (const [before, after] of replacements) {
    if (!source.includes(before)) {
      throw new Error(`${filePath} 缺少预期片段：${before.slice(0, 120)}`);
    }
    source = source.replaceAll(before, after);
  }
  await writeFile(filePath, source, 'utf8');
}

async function updateGovernedPaths() {
  const filePath = 'docs/product/AUTHOR_LANGUAGE_GOVERNED_PATHS.json';
  const state = JSON.parse(await readFile(filePath, 'utf8'));
  const additions = [
    'apps/desktop/renderer/src/components/author-error-notice.tsx',
    'apps/desktop/renderer/src/features/planning/professional-planning-workbench.tsx',
  ];
  state.paths = [...new Set([...state.paths, ...additions])];
  await writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

for (const [filePath, replacements] of Object.entries(replacementsByFile)) {
  await replaceRequired(filePath, replacements);
}
await updateGovernedPaths();
console.log('规划、首页与设置正式中文名称改写已完成。');
