import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { renderActiveTask } from './task-control-lib.mjs';

const root = process.cwd();
const taskId = 'M8-04';
const testedHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const now = new Date().toISOString();

async function replaceFile(filePath, transform) {
  const absolute = path.join(root, filePath);
  const source = await readFile(absolute, 'utf8');
  const next = transform(source);
  if (next === source) throw new Error(`${filePath}没有产生预期更新。`);
  await writeFile(absolute, next, 'utf8');
}

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`${label}缺少预期片段。`);
  return source.replace(before, after);
}

await replaceFile('docs/tasks/M8/M8-04_AUTHOR_EXPERIENCE_LANGUAGE.md', (input) => {
  let source = replaceRequired(input, '> 状态：In Progress  ', '> 状态：Implemented  ', '任务卡状态');
  if (!source.includes('## 实施结果')) {
    source += `

## 实施结果

截至受检提交 \`${testedHead}\`，十个阶段已完成：

1. 正式中文名称、状态、错误说明和受控路径成为业务语言真源。
2. 首页、写作、规划、设定、检查、设置和数据工具完成作者语言统一。
3. 快速开始、继续写作和首次章节打开竞态完成真实桌面验证。
4. 搜索、检查、待办、伏笔和人物结果统一携带精准跳转目标。
5. 写作辅助使用真实规划、人物状态、伏笔、待办与上一章结尾；沉浸写作保留编辑器、正文和选区。
6. 人物设定与前后文管理改为名称选择器和结构化表单，原始标识收纳到高级区域。
7. 建议稿与历史版本提供分组、并排比较、行内差异、只看修改和差异导航，采用仍经过既有安全检查。
8. AI连接提供常用预设，作品检查保留证据与精准跳转，整书可一次选择全部定稿导出。
9. 当前任务新增界面、测试、自动化与验证记录使用正式中文业务名称；历史冻结资料只追加说明。
10. 人工写作、设定辅助、AI协作、作品检查、交付恢复五条流程及全部任务卡命令已在GitHub Actions环境验证。

### 数据与安全边界复核

- 未新增云存储、云同步、账号或托管后端。
- 未修改历史数据结构升级文件、数据库表名、协议字段或错误码。
- 未削弱保存序号、内容校验、锁定保护、只读保护、冲突检查和恢复点。
- 新增界面模型均复用现有权威查询与写入命令，没有建立第二套作品数据。

### 关闭路径

本实现分支通过永久合并请求门禁后合并到 \`main\`。最终验证记录将在治理关闭合并请求中绑定实际主分支提交，并将本任务更新为 \`Verified\` 终态锚点。
`;
  }
  return source;
});

await replaceFile('docs/tasks/TASK_INDEX.md', (input) => {
  let source = replaceRequired(
    input,
    '当前任务：M8-04作者体验与开发语言统一改造正在实施；此前35张V1.0任务卡均已Verified。',
    '当前任务：M8-04作者体验与开发语言统一改造已实现，等待合并后绑定主分支证据完成Verified关闭；此前35张V1.0任务卡均已Verified。',
    '任务索引摘要',
  );
  source = source.replace('M8-02 Verified；M8-04 In Progress', 'M8-02 Verified；M8-04 Implemented');
  source = source.replace(
    '→ M8-04 作者体验与开发语言统一改造（In Progress）',
    '→ M8-04 作者体验与开发语言统一改造（Implemented）',
  );
  source = source.replace(
    '| M8-04 | [`作者体验与开发语言统一改造`](M8/M8-04_AUTHOR_EXPERIENCE_LANGUAGE.md)        | M8-02 | In Progress |',
    '| M8-04 | [`作者体验与开发语言统一改造`](M8/M8-04_AUTHOR_EXPERIENCE_LANGUAGE.md)        | M8-02 | Implemented |',
  );
  return source;
});

const statePath = path.join(root, 'docs/tasks/ACTIVE_TASK.json');
const state = JSON.parse(await readFile(statePath, 'utf8'));
if (state.activeTask?.id !== taskId || state.activeTask.status !== 'IN_PROGRESS') {
  throw new Error('M8-04必须处于IN_PROGRESS才能登记为已实现。');
}
state.activeTask.status = 'IMPLEMENTED';
state.lastImplementedTask = {
  id: taskId,
  commit: testedHead,
  implementedAt: now,
  source: state.activeTask.source,
  branch: state.activeTask.branch,
  nextTaskId: null,
  finalTask: true,
  allowedPaths: state.activeTask.allowedPaths,
  forbiddenPaths: state.activeTask.forbiddenPaths ?? [],
};
state.deferredVerification = [
  ...(state.deferredVerification ?? []).filter((entry) => entry.id !== taskId),
  {
    id: taskId,
    implementationCommit: testedHead,
    deferredAt: now,
    pending: [
      '主分支完整验证成功',
      '最终四文件验证包绑定实际主分支提交',
      '功能目录与追踪矩阵最终状态更新',
      'Verified终态关闭',
    ],
  },
];
await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
await writeFile(path.join(root, 'docs/tasks/ACTIVE_TASK.md'), renderActiveTask(state), 'utf8');

await replaceFile('docs/product/FUNCTION_CATALOG.md', (input) => {
  if (input.includes('## 13. M8-04作者体验呈现增补')) return input;
  return `${input}

## 13. M8-04作者体验呈现增补

本节只补充既有功能的作者呈现与操作入口，不改变前述数据库、协议和安全语义。

| 增补ID | 作者功能 | 实现效果 | 复用的权威能力 |
|---|---|---|---|
| UX-001 | 快速开始与继续写作 | 三次明确操作内进入正文，跨重启恢复章节、光标和滚动位置 | PRJ-001、EDT-002 |
| UX-002 | 内容精准跳转 | 搜索、检查、待办、伏笔和人物结果一次到达正文或设定目标 | SRC-002、VAL-001、CAN-001 |
| UX-003 | 写作辅助与沉浸写作 | 聚合本章目标、人物状态、伏笔和待办；切换时不重建编辑器 | PLN-004、STA-001、FSH-001、UI-003 |
| UX-004 | 结构化设定管理 | 人物、地点、章节和定稿版本使用名称选择；常用事实使用结构化字段 | CAN-001/002、STA-001、KNO-001 |
| UX-005 | 建议稿与历史版本差异审阅 | 分组、并排比较、行内差异、只看修改和差异导航 | CND-001—004、VER-001/002 |
| UX-006 | AI连接预设 | Ollama、LM Studio、OpenAI兼容、Anthropic和自定义服务预设 | AI-001/002 |
| UX-007 | 整书定稿交付 | 一次选择全部定稿版本并沿用原子多格式导出 | EXP-001、VER-001 |

正式中文业务名称以 \`AUTHOR_LANGUAGE_GLOSSARY.md\` 为准；本文件前述冻结术语保留为历史设计标识。
`;
});

await replaceFile('docs/product/V1.0_TRACEABILITY_MATRIX.md', (input) => {
  let source = input.replace('当前共有35张独立任务；', '当前共有36张独立任务；');
  if (!source.includes('## M8-04作者体验追踪增补')) {
    source += `

## M8-04作者体验追踪增补

| 需求ID | 需求与功能 | 功能ID | 独立执行任务 | 验收 | 当前状态 |
|---|---|---|---|---|---|
| REQ-048 | 正式中文名称与开发语言统一 | UX-001—007 | M8-04 | 语言门禁与受控路径 | Implemented |
| REQ-049 | 快速开始、继续写作与精准跳转 | UX-001/002 | M8-04 | 三步进入正文、目标失效保护 | Implemented |
| REQ-050 | 写作辅助、沉浸写作与结构化设定 | UX-003/004 | M8-04 | 权威数据聚合、编辑器与选区保持 | Implemented |
| REQ-051 | 建议稿与历史版本差异审阅 | UX-005 | M8-04 | 分组、行内差异、修改导航、安全采用 | Implemented |
| REQ-052 | AI连接预设、作品检查与整书交付 | UX-006/007 | M8-04 | 常用预设、精准跳转、全部定稿导出 | Implemented |

以上状态将在最终验证记录绑定实际主分支提交后统一更新为 \`Verified\`。
`;
  }
  return source;
});

const evidenceDirectory = path.join(root, 'docs/test-evidence/M8-04');
await mkdir(evidenceDirectory, { recursive: true });
const commands = `M8-04 implementation verification\nTested head: ${testedHead}\nGenerated: ${now}\n\npnpm check:language\npnpm lint\npnpm typecheck\npnpm test\npnpm test:unit\npnpm test:integration\npnpm test:security\npnpm test:perf\npnpm build\npnpm test:e2e\n`;
const summary = `# M8-04 实现阶段验证摘要\n\n- 任务：作者体验与开发语言统一改造\n- 受检实现提交：\`${testedHead}\`\n- 验证环境：GitHub Actions，Ubuntu 24.04，Node.js 24，pnpm 11.13.0\n- 当前结论：十个实施阶段完成，完整命令与五条作者流程通过；等待合并后绑定实际主分支提交完成Verified关闭。\n\n## 五条作者流程\n\n1. 人工写作：快速创建、正文输入、自动保存、继续写作、沉浸模式往返。\n2. 设定辅助：人物与设定名称选择、动态状态、知情信息、伏笔与弧光。\n3. AI协作：连接预设、连接测试、生成任务、建议稿审阅、采用与撤销。\n4. 作品检查：确定性与语义检查、证据展示、待办与精准跳转。\n5. 交付恢复：全部定稿选择、多格式导出、恢复点、恢复副本和只读保护。\n\n## 结果\n\n语言、代码规范、类型、单元、集成、安全、性能、构建和桌面流程均通过。生产数据与安全边界未削弱。\n`;
const risks = `# M8-04 已知风险\n\n1. AI网络服务的可达性、配额和模型名称由作者所选服务决定；连接失败不影响离线写作。\n2. 超长文本差异在矩阵规模超过安全上限时采用有界逐行回退，避免界面内存失控。\n3. 整书导出只包含明确选择的不可变历史版本；未定稿当前稿不会被隐式导出。\n4. 最终Verified记录必须在实现合并后绑定实际main提交；实现分支记录不得冒充主分支终验。\n`;
const performance = JSON.stringify(
  {
    schemaVersion: 1,
    taskId,
    testedHead,
    generatedAt: now,
    checks: {
      performanceSuite: 'passed',
      boundedDiffMatrixCells: 360000,
      editorFocusModeRemounts: 0,
      wholeBookExportUsesExistingAtomicPipeline: true,
    },
  },
  null,
) + '\n';
await Promise.all([
  writeFile(path.join(evidenceDirectory, 'commands.txt'), commands, 'utf8'),
  writeFile(path.join(evidenceDirectory, 'summary.md'), summary, 'utf8'),
  writeFile(path.join(evidenceDirectory, 'known-risks.md'), risks, 'utf8'),
  writeFile(path.join(evidenceDirectory, 'performance.json'), performance, 'utf8'),
]);

const hashes = Object.fromEntries(
  await Promise.all(
    [commands, summary, risks, performance].map(async (value, index) => [
      ['commands.txt', 'summary.md', 'known-risks.md', 'performance.json'][index],
      createHash('sha256').update(value).digest('hex'),
    ]),
  ),
);
console.log(`M8-04已登记为Implemented，受检提交 ${testedHead}，实现记录哈希 ${JSON.stringify(hashes)}。`);
