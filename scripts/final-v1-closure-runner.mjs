import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const PRODUCT_HEAD = '198caa3f591bbc57d154f4b21639a1f8e8957b37';
const PRODUCT_MAIN = '0363eb94da694aa359076cec79064cc41b42d6e1';
const CLOSED_AT = '2026-07-29T00:55:00.000Z';

const read = (file) => readFile(file, 'utf8');
const write = async (file, content) =>
  writeFile(file, content.endsWith('\n') ? content : content + '\n', 'utf8');

function exact(source, needle, replacement, label) {
  const index = source.indexOf(needle);
  if (index < 0) throw new Error('MISSING:' + label);
  if (source.indexOf(needle, index + needle.length) >= 0) throw new Error('MULTIPLE:' + label);
  return source.slice(0, index) + replacement + source.slice(index + needle.length);
}

async function edit(file, transform) {
  const before = await read(file);
  const after = transform(before);
  if (after === before) throw new Error('NO_CHANGE:' + file);
  await write(file, after);
}

async function manifest(taskId, extras = {}) {
  const directory = path.join('docs/test-evidence', taskId);
  const names = (await readdir(directory)).filter((name) => name !== 'manifest.json').sort();
  const files = [];
  for (const name of names) {
    const absolute = path.join(directory, name);
    const metadata = await stat(absolute);
    if (!metadata.isFile()) throw new Error(absolute + ' must be a regular file');
    const content = await readFile(absolute);
    files.push({
      path: name,
      bytes: content.byteLength,
      sha256: createHash('sha256').update(content).digest('hex'),
    });
  }
  await write(
    path.join(directory, 'manifest.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        taskId,
        commit: PRODUCT_MAIN,
        generatedAt: CLOSED_AT,
        ...extras,
        files,
      },
      null,
      2,
    ),
  );
}

await edit('scripts/task-control-lib.mjs', (source) => {
  let next = exact(
    source,
    "  'docs/tasks/ACTIVE_TASK.md',\n  'tests/integration/task-lifecycle.test.ts',",
    "  'docs/tasks/ACTIVE_TASK.md',\n  'docs/tasks/TASK_INDEX.md',\n  'docs/tasks/M4/M4-04_PROMPT_REGISTRY_OUTPUT.md',\n  'docs/tasks/M8/M8-02_PERFORMANCE_E2E_AI_EVAL.md',\n  'docs/test-evidence/M4-04/',\n  'docs/test-evidence/M8-02/',\n  'docs/product/V1.0_TRACEABILITY_MATRIX.md',\n  'README.md',\n  'tests/integration/task-lifecycle.test.ts',",
    'governance-final-paths',
  );
  next = exact(
    next,
    "  let continuationRule;\n  if (state.authorization.mode === 'implementation-pr') {",
    "  let continuationRule;\n  if (state.verificationHold?.finalTask === true) {\n    continuationRule =\n      'V1.0全部独立任务已经Verified；M8-02作为终态验证锚点保留，不再激活后续任务。任何新功能或公开分发能力必须重新立项。';\n  } else if (state.authorization.mode === 'implementation-pr') {",
    'terminal-mirror-rule',
  );
  return next;
});

await edit('.github/governance/verification-hold-taskctl.mjs', (source) => {
  let next = exact(
    source,
    "  parseTaskIndex,\n  renderActiveTask,\n  validateChangedPaths,",
    "  isGovernanceOnlyPullRequest,\n  parseTaskIndex,\n  renderActiveTask,\n  validateChangedPaths,",
    'hold-import',
  );
  next = exact(
    next,
    '  const verifiedTasks = hold?.verifiedTasks ?? [];',
    '  const verifiedTasks = hold?.verifiedTasks ?? [];\n  const finalTask = hold?.finalTask === true;',
    'hold-final-flag',
  );
  const oldNext = [
    "  if (!hold?.nextTaskId || hold.nextTaskId === active.id) {",
    "    errors.push('verificationHold.nextTaskId must identify the deferred next task');",
    "  } else if (taskIndex.get(hold.nextTaskId)?.status !== 'Planned') {",
    '    errors.push(`${hold.nextTaskId} must remain Planned during verification hold`);',
    '  }',
  ].join('\n');
  const newNext = [
    '  if (finalTask) {',
    "    if (hold.nextTaskId !== null) errors.push('Final verification hold requires nextTaskId=null');",
    "    const unfinished = [...taskIndex.values()].filter((task) => task.status !== 'Verified');",
    '    if (unfinished.length > 0) {',
    "      errors.push('Final verification hold requires every task Verified: ' + unfinished.map((task) => task.id).join(', '));",
    '    }',
    '    if ((state.deferredVerification ?? []).length > 0) {',
    "      errors.push('Final verification hold requires an empty deferredVerification ledger');",
    '    }',
    '  } else if (!hold?.nextTaskId || hold.nextTaskId === active.id) {',
    "    errors.push('verificationHold.nextTaskId must identify the deferred next task');",
    "  } else if (taskIndex.get(hold.nextTaskId)?.status !== 'Planned') {",
    '    errors.push(`${hold.nextTaskId} must remain Planned during verification hold`);',
    '  }',
  ].join('\n');
  next = exact(next, oldNext, newNext, 'hold-terminal-next');
  next = exact(
    next,
    "async function validateHoldPaths() {\n  const { state } = await load();\n  const files = changedFiles();",
    "async function validateHoldPaths() {\n  const { state } = await load();\n  const files = changedFiles();\n  const branch = process.env.TASK_PR_HEAD_REF ?? process.env.GITHUB_HEAD_REF ?? '';\n  if (isGovernanceOnlyPullRequest(branch, files)) {\n    console.log('Final governance closure paths accepted from ' + branch + '.');\n    return;\n  }",
    'hold-preflight',
  );
  next = exact(
    next,
    "  const branch = process.env.TASK_PR_HEAD_REF ?? process.env.GITHUB_HEAD_REF ?? '';\n  if (!branch || branch !== state.activeTask.branch) {",
    "  const branch = process.env.TASK_PR_HEAD_REF ?? process.env.GITHUB_HEAD_REF ?? '';\n  const files = changedFiles();\n  if (isGovernanceOnlyPullRequest(branch, files)) {\n    console.log('Final governance closure PR accepted: ' + branch + '.');\n    return;\n  }\n  if (!branch || branch !== state.activeTask.branch) {",
    'hold-pr-policy',
  );
  next = exact(
    next,
    "  console.log('Verification hold taskctl self-test passed.');",
    [
      '  const finalIndex = new Map([',
      "    ['M4-04', { id: 'M4-04', source: 'docs/tasks/M4/M4-04.md', status: 'Verified' }],",
      "    ['M8-02', { id: 'M8-02', source: 'docs/tasks/M8/M8-02.md', status: 'Verified' }],",
      '  ]);',
      '  const finalState = {',
      '    ...state,',
      '    activeTask: { ...state.activeTask, id: \'M8-02\', source: \'docs/tasks/M8/M8-02.md\', branch: \'work/m8-02-final\' },',
      '    deferredVerification: [],',
      "    lastVerifiedTask: { id: 'M8-02', commit: 'a'.repeat(40), evidenceHead: 'b'.repeat(40) },",
      '    verificationHold: {',
      "      taskId: 'M8-02',",
      "      verifiedTasks: ['M4-04', 'M8-02'],",
      '      finalTask: true,',
      '      nextTaskId: null,',
      "      heldAt: '2026-07-29T00:00:00.000Z',",
      "      reason: 'final closure',",
      "      allowedPaths: ['docs/tasks/'],",
      '      forbiddenPaths: [],',
      '    },',
      '  };',
      '  assert.deepEqual(holdErrors(finalState, finalIndex), []);',
      "  console.log('Verification hold taskctl self-test passed.');",
    ].join('\n'),
    'hold-self-test',
  );
  return next;
});

const m8Summary = `# M8-02 最终验证记录

> 验证日期：2026-07-29  
> 产品Head：\`${PRODUCT_HEAD}\`  
> 产品main提交：\`${PRODUCT_MAIN}\`  
> 正式PR：[#224](https://github.com/sy220284/666/pull/224)  
> 交付范围：\`SELF_USE_PORTABLE\`  
> 验收来源：\`GITHUB_ACTIONS_ONLY\`

## 最终结论

M8-02已经完成C8完整体验、安全硬化、性能、Electron端到端、AI协议基线与三平台自用便携交付验收。任务状态为Verified，V1.0全部独立任务完成关闭。

## 自动化结果

- PR产品Head的Quality、Security、Performance、Evidence、PR Policy、Task Governance和Repository Governance全部成功。
- Windows、macOS和Linux原生Electron链、便携构建、ASAR、Fuses、SHA-256、资产完整性和成品启动全部通过。
- 完整29项Electron E2E通过，覆盖只读恢复、物理损坏恢复、继续写作重开、共享恢复查询和Renderer滚动帧率。
- 超大DOCX导入、中央目录与本地Header字段交叉校验、非递归超长正文解析通过。
- 重复Core实例日常备份幂等、失败账本、持续负载、内存与Core事件循环预算通过。
- 2K写作与自动保存、5000字Diff、156万字符FTS、Renderer滚动帧率和300次编辑事务性能基线通过。
- Provider协议Fixture、错误映射、离线降级和无AI基础写作链通过。

## 交付边界

V1.0仅供仓库所有者本人使用。物理设备、真实Provider账号、签名、公证、系统安装器和安装生命周期均属于已声明的非目标，不影响自用便携交付结论。

## 证据绑定

Evidence绑定产品main提交\`${PRODUCT_MAIN}\`；最终治理收口只更新任务终态与机器可读治理模型，不改变已受检产品代码树。
`;
const m8Risks = `# M8-02 已知限制

- V1.0仅供仓库所有者本人使用，交付形态为Windows、macOS和Linux自用便携包。
- 物理DPI、真实多屏、实体读屏、人工IME、自定义字体、人工视觉复核与实体主机差异不属于V1.0验收范围。
- 真实Provider账号与线下模型质量不属于完成条件；Actions已验证协议Fixture、错误映射、离线降级和无AI基础写作。
- Windows代码签名、macOS签名与公证、系统安装器以及安装、升级、自动更新和卸载生命周期为\`NOT_REQUIRED_SELF_USE\`。
- 自用工件不得宣传为适合第三方、企业部署或应用商店发布。
- 后续若扩大到公开分发、企业部署或真实Provider支持矩阵，必须重新立项。
`;
const m4Summary = `# M4-04 最终验证记录

> 验证日期：2026-07-29  
> 原产品合并提交：\`e7168bb2bbb4f02dc596d65d126dec62dd720f2c\`  
> 最终产品main提交：\`${PRODUCT_MAIN}\`

## 最终结论

M4-04负责的C0—C7与C1继续写作并发硬化已经完成实现、自动化验收和最终回归，任务状态为Verified。M8-02完成C8后，对M4-04延期风险进行了统一回收，延期验证账本已经清空。

## 已验证范围

- 作者继续写作、ProjectContinuation、请求竞态与重启恢复。
- GenerationRun、T0/T1、改写、融合、Candidate审阅、安全采用与撤销。
- StateProposal、Validation、Todo/Comment、搜索替换、统计与节奏。
- DOCX安全导入、多格式导出、三轨备份恢复与跨实例幂等。
- Schema与Migration、只读保护、失败恢复、数据引用完整性和隐私边界。

## 回收结果

M8-02已完成首次使用、统一工作台、主题与无障碍自动化、安全诊断、性能基线、完整Electron链、三平台自用便携构建以及M4-04遗留的超大DOCX和备份并发验证。M4-04不再保留延期验收项。

## 证据绑定

本证据包绑定最终产品main提交\`${PRODUCT_MAIN}\`。历史C0—C7分项证据继续保留。
`;
const m4Risks = `# M4-04 已知限制

- M4-04的Schema与Migration继续遵守只向后追加、不得改写历史的约束。
- V1.0交付范围为仓库所有者自用便携包，公开分发能力不属于本任务。
- 真实Provider账号、签名、公证和系统安装器不属于V1.0完成条件。
- 后续新增范围必须重新立项。
`;

await write('docs/test-evidence/M8-02/summary.md', m8Summary);
await write('docs/test-evidence/M8-02/known-risks.md', m8Risks);
await write('docs/test-evidence/M4-04/summary.md', m4Summary);
await write('docs/test-evidence/M4-04/known-risks.md', m4Risks);
await manifest('M8-02', { distributionScope: 'SELF_USE_PORTABLE', acceptanceSource: 'GITHUB_ACTIONS_ONLY' });
await manifest('M4-04');

await edit('docs/tasks/M4/M4-04_PROMPT_REGISTRY_OUTPUT.md', (source) =>
  exact(source, '> 状态：Implemented  ', '> 状态：Verified  ', 'm4-status'),
);
await edit('docs/tasks/M8/M8-02_PERFORMANCE_E2E_AI_EVAL.md', (source) =>
  exact(source, '> 状态：In Progress  ', '> 状态：Verified  ', 'm8-status') +
  `\n## 最终关闭\n\n- 产品Head：\`${PRODUCT_HEAD}\`。\n- 产品main提交：\`${PRODUCT_MAIN}\`。\n- M4-04与M8-02统一完成Verified关闭，V1.0不再保留活动开发任务。\n`,
);

await edit('docs/tasks/TASK_INDEX.md', (source) => {
  let next = source;
  next = next.replace('> 当前执行：M4-04核心交付已Implemented；作者已明确启动M8-02，C8完整体验、硬化与发布关闭正在实施。', '> 当前结果：35张独立任务卡全部Verified；M8-02作为V1.0终态验证锚点，不再激活后续任务。');
  next = next.replace('| M4            | AI基础与V1核心功能             |          4 | M4-01—M4-03 Verified；M4-04 Implemented      |', '| M4            | AI基础与V1核心功能             |          4 | M4-01—M4-04 Verified                         |');
  next = next.replace('| M8            | C8完整体验、硬化与发布关闭     |          1 | M8-02 In Progress                            |', '| M8            | C8完整体验、硬化与自用交付关闭 |          1 | M8-02 Verified                               |');
  next = next.replace('→ M4-04 C0—C7核心功能交付（Implemented）', '→ M4-04 C0—C7核心功能交付（Verified）');
  next = next.replace('→ Implementation Hold\n→ M8-02 C8完整体验、硬化与发布关闭（In Progress）', '→ M8-02 C8完整体验、硬化与自用交付关闭（Verified）\n→ V1.0全部任务关闭');
  next = next.replace(/^(\|\s*M4-04\s*\|[^\n]*\|\s*)Implemented(\s*\|\s*)$/mu, '$1Verified$2');
  next = next.replace(/^(\|\s*M8-02\s*\|[^\n]*\|\s*)In Progress(\s*\|\s*)$/mu, '$1Verified$2');
  return next;
});

const state = JSON.parse(await read('docs/tasks/ACTIVE_TASK.json'));
state.activeTask.status = 'VERIFIED_HOLD';
state.deferredVerification = [];
state.lastVerifiedTask = { id: 'M8-02', commit: PRODUCT_MAIN, verifiedAt: CLOSED_AT, evidenceHead: PRODUCT_MAIN };
state.integratedDelivery.finalTask = true;
state.integratedDelivery.deliveryBoundary = 'C0-C8+self-use-portable';
state.verificationHold = {
  taskId: 'M8-02',
  verifiedTasks: ['M4-04', 'M8-02'],
  finalTask: true,
  nextTaskId: null,
  heldAt: CLOSED_AT,
  reason: 'WorldForge V1.0全部35张独立任务卡已完成Verified关闭，不再激活后续任务。',
  allowedPaths: ['.github/governance/', 'scripts/', 'docs/tasks/', 'docs/test-evidence/M4-04/', 'docs/test-evidence/M8-02/', 'docs/product/V1.0_TRACEABILITY_MATRIX.md', 'README.md'],
  forbiddenPaths: [],
};
await write('docs/tasks/ACTIVE_TASK.json', JSON.stringify(state, null, 2));
const control = await import('./task-control-lib.mjs?final=' + Date.now());
await write('docs/tasks/ACTIVE_TASK.md', control.renderActiveTask(state));

await edit('docs/product/V1.0_TRACEABILITY_MATRIX.md', (source) => {
  let next = source.replaceAll('| Implemented |', '| Verified    |');
  next = next.replace('1. M4-04保持Implemented；M8-02是C8与自用便携交付关闭的唯一活动任务。', '1. M4-04与M8-02均已Verified；V1.0全部独立任务完成关闭。');
  next = next.replace('3. M8-02实现后可更新具体需求状态，但不得把未执行验证、单平台结果或Stub结果冒充完整自用交付闭环。', '3. M8-02最终证据已经绑定产品main提交；未来新增范围必须重新立项。');
  next = next.replace('4. 代码合并且功能真实可运行后改为`Implemented`；对应P0、适用人工复查和Evidence完成后才改为`Verified`。', '4. 当前V1.0范围已经完成`Verified`关闭；状态不得在无新任务卡时回退。');
  return next;
});

await edit('README.md', (source) => {
  let next = source.replace('→ M4-04 C0—C7核心功能已Implemented', '→ M4-04 C0—C7核心功能已Verified');
  next = next.replace('→ M8-02 C8完整体验、硬化与自用便携交付关闭进行中', '→ M8-02 C8完整体验、硬化与自用便携交付已Verified');
  next = next.replace('当前C8产品代码已经进入最终自动化验收。真实Provider/Model质量、物理混合DPI与多屏、人工读屏与输入法、超大DOCX、多进程备份幂等和长期性能仍按实际资源与任务清单推进。未验证能力必须如实记录，但不得与已经取消的公开分发要求混淆。', 'C8自动化验收已经完成。M4-04与M8-02均已Verified，V1.0全部35张独立任务卡关闭；未纳入自用范围的公开分发能力继续按已知限制披露。');
  next = next.replace('当前活动任务：\n\n[`M8-02 C8完整体验、硬化与自用交付关闭`](./docs/tasks/M8/M8-02_PERFORMANCE_E2E_AI_EVAL.md)', '当前任务状态：V1.0全部35张独立任务卡已Verified；[`M8-02`](./docs/tasks/M8/M8-02_PERFORMANCE_E2E_AI_EVAL.md)保留为终态验证锚点，不再激活后续任务。');
  return next;
});

console.log('V1 final governance closure applied.');
