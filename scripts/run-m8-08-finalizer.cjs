const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function replaceOnce(source, search, replacement, label) {
  const next = source.replace(search, replacement);
  if (next === source) throw new Error(`Missing ${label}`);
  return next;
}

function hashFile(file) {
  const content = fs.readFileSync(file);
  return {
    bytes: content.byteLength,
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
  };
}

async function main() {
  const sourceHead = process.env.SOURCE_HEAD;
  if (!/^[0-9a-f]{40}$/u.test(sourceHead ?? '')) {
    throw new Error(`Invalid SOURCE_HEAD: ${sourceHead ?? '<missing>'}`);
  }

  const holdPath = '.github/governance/verification-hold-taskctl.mjs';
  let hold = fs.readFileSync(holdPath, 'utf8');

  hold = replaceOnce(
    hold,
    "import { readFile } from 'node:fs/promises';",
    "import { readdir, readFile } from 'node:fs/promises';",
    'verification-hold fs import',
  );

  const delegatePattern = /function delegate\(argumentsList\) \{[\s\S]*?\n\}\n/u;
  const delegate = delegatePattern.exec(hold)?.[0];
  if (!delegate) throw new Error('Missing verification-hold delegate function');
  const helpers = `${delegate}
function delegateParallel(command) {
  execFileSync(
    process.execPath,
    ['.github/governance/parallel-task-policy.mjs', command],
    { cwd: root, env: process.env, stdio: 'inherit' },
  );
}

async function pullRequestBody() {
  if (process.env.TASK_PR_BODY) return process.env.TASK_PR_BODY;
  if (!process.env.GITHUB_EVENT_PATH) return '';
  try {
    const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
    return event.pull_request?.body ?? '';
  } catch {
    return '';
  }
}

async function activeParallelTask() {
  try {
    const authorization = JSON.parse(
      await readFile('docs/tasks/TASK_AUTHORIZATION.json', 'utf8'),
    );
    if (authorization.mode !== 'parallel-pr') return null;
    const taskId = /<!--\s*worldforge-task:\s*(M\d+-\d{2})\s*-->/iu.exec(
      await pullRequestBody(),
    )?.[1]?.toUpperCase();
    if (!taskId) return null;
    const runtime = JSON.parse(
      await readFile(`docs/tasks/runtime/${taskId}.json`, 'utf8'),
    );
    return ['IN_PROGRESS', 'IMPLEMENTED'].includes(runtime.status) ? taskId : null;
  } catch {
    return null;
  }
}

async function parallelRuntimeStatuses() {
  const statuses = new Map();
  try {
    const authorization = JSON.parse(
      await readFile('docs/tasks/TASK_AUTHORIZATION.json', 'utf8'),
    );
    if (authorization.mode !== 'parallel-pr') return statuses;
    for (const name of await readdir('docs/tasks/runtime')) {
      if (!/^M\d+-\d{2}\.json$/u.test(name)) continue;
      const runtime = JSON.parse(
        await readFile(`docs/tasks/runtime/${name}`, 'utf8'),
      );
      statuses.set(runtime.id, runtime.status);
    }
  } catch {
    // Legacy repositories without parallel task state retain the original hold behavior.
  }
  return statuses;
}
`;
  hold = hold.replace(delegatePattern, helpers);

  hold = replaceOnce(
    hold,
    'function holdErrors(state, taskIndex) {',
    'function holdErrors(state, taskIndex, runtimeStatuses = new Map()) {',
    'holdErrors signature',
  );

  hold = replaceOnce(
    hold,
    `  } else if (!hold?.nextTaskId || hold.nextTaskId === active.id) {
    errors.push('verificationHold.nextTaskId must identify the deferred next task');
  } else if (taskIndex.get(hold.nextTaskId)?.status !== 'Planned') {
    errors.push(\`${'${hold.nextTaskId}'} must remain Planned during verification hold\`);
  }
`,
    `  } else if (!hold?.nextTaskId || hold.nextTaskId === active.id) {
    errors.push('verificationHold.nextTaskId must identify the deferred next task');
  } else {
    const indexedNextStatus = taskIndex.get(hold.nextTaskId)?.status;
    const runtimeNextStatus = runtimeStatuses.get(hold.nextTaskId);
    const supportedParallelState =
      (indexedNextStatus === 'In Progress' && runtimeNextStatus === 'IN_PROGRESS') ||
      (indexedNextStatus === 'Implemented' && runtimeNextStatus === 'IMPLEMENTED');
    if (indexedNextStatus !== 'Planned' && !supportedParallelState) {
      errors.push(
        \`${'${hold.nextTaskId}'} must be Planned or match an active parallel runtime during verification hold\`,
      );
    }
  }
`,
    'verification-hold next-task rule',
  );

  hold = replaceOnce(
    hold,
    '  const errors = holdErrors(state, taskIndex);',
    '  const errors = holdErrors(state, taskIndex, await parallelRuntimeStatuses());',
    'validateHold runtime statuses',
  );
  hold = replaceOnce(
    hold,
    'async function validateHoldPaths() {\n  const { state } = await load();',
    "async function validateHoldPaths() {\n  if (await activeParallelTask()) return delegateParallel('validate');\n  const { state } = await load();",
    'validateHoldPaths delegation',
  );
  hold = replaceOnce(
    hold,
    'async function validateHoldBranch() {\n  const { state } = await load();',
    "async function validateHoldBranch() {\n  if (await activeParallelTask()) return delegateParallel('pr-policy');\n  const { state } = await load();",
    'validateHoldBranch delegation',
  );
  hold = replaceOnce(
    hold,
    '  assert.deepEqual(holdErrors(state, taskIndex), []);',
    `  assert.deepEqual(holdErrors(state, taskIndex), []);
  const parallelIndex = new Map(taskIndex);
  parallelIndex.set('M4-04', {
    id: 'M4-04',
    source: 'docs/tasks/M4/M4-04.md',
    status: 'In Progress',
  });
  assert.deepEqual(
    holdErrors(state, parallelIndex, new Map([['M4-04', 'IN_PROGRESS']])),
    [],
  );`,
    'verification-hold parallel self-test',
  );
  fs.writeFileSync(holdPath, hold, 'utf8');

  const activePath = 'docs/tasks/ACTIVE_TASK.json';
  const active = JSON.parse(fs.readFileSync(activePath, 'utf8'));
  if (active.activeTask?.id !== 'M8-07' || active.activeTask?.status !== 'VERIFIED_HOLD') {
    throw new Error('Expected M8-07 VERIFIED_HOLD anchor');
  }
  active.verificationHold.finalTask = false;
  active.verificationHold.nextTaskId = 'M8-08';
  active.verificationHold.reason =
    'M8-07已完成主分支验证；终态锚点保留期间允许M8-08按并行任务运行时继续封版';
  fs.writeFileSync(activePath, `${JSON.stringify(active, null, 2)}\n`, 'utf8');

  const runtimePath = 'docs/tasks/runtime/M8-08.json';
  const runtime = JSON.parse(fs.readFileSync(runtimePath, 'utf8'));
  if (runtime.status !== 'IN_PROGRESS') {
    throw new Error(`Expected M8-08 IN_PROGRESS, found ${runtime.status}`);
  }
  runtime.status = 'IMPLEMENTED';
  runtime.implementedAt = '2026-07-31T18:50:00+08:00';
  runtime.implementationCommit = sourceHead;
  runtime.releaseEvidence = {
    version: '1.0.0',
    artifactRuns: [30623725133, 30624246649],
    artifacts: {
      macos: {
        id: 8790527645,
        bytes: 122409745,
        sha256: 'b23377c65900e13689a18da34eb5e4dd6d163e22bbca4363215693792e2a6652',
      },
      windows: {
        id: 8790649171,
        bytes: 147976944,
        sha256: 'ca0e1f7ef66bfc6ccdea7412fbd981ea7891eb569b7a8a200fa33e43cbb5ac8b',
      },
      linux: {
        id: 8790691885,
        bytes: 128606196,
        sha256: '7b6bd7777afa28f508a7adef1e6c3546c0696690058bb10c1ea9e0997eef633b',
      },
    },
  };
  const versionPaths = [
    'apps/desktop/main/package.json',
    'apps/desktop/package.json',
    'apps/desktop/preload/package.json',
    'apps/desktop/renderer/package.json',
    'packages/contracts/package.json',
    'packages/core-service/package.json',
    'packages/domain/package.json',
    'packages/editor-core/package.json',
    'packages/prompts/package.json',
    'packages/testkit/package.json',
  ];
  runtime.allowedPaths = [...new Set([...runtime.allowedPaths, ...versionPaths])];
  fs.writeFileSync(runtimePath, `${JSON.stringify(runtime, null, 2)}\n`, 'utf8');

  const cardPath = 'docs/tasks/M8/M8-08_V1_FINAL_GOVERNANCE_CLOSURE.md';
  let card = fs.readFileSync(cardPath, 'utf8');
  card = replaceOnce(card, '> 状态：In Progress  ', '> 状态：Implemented  ', 'task-card status');
  card = replaceOnce(
    card,
    '> 实施基线：`main@fddb88d05c5da576f90a18464ef1ee39304e2a1f`  ',
    '> 实施基线：`main@44fc199c0d4725a9aa169865309674954143f5cf`  ',
    'task-card implementation baseline',
  );
  card = replaceOnce(
    card,
    '> 封版依赖：`M8-07`必须在M8-08最终合并、发布与`VERIFIED_HOLD`前完成Verified闭环  ',
    '> 封版依赖：`M8-07`已完成Verified闭环  ',
    'task-card closure dependency',
  );
  card = replaceOnce(
    card,
    '> 目标终态：`VERIFIED_HOLD`',
    `> 实施证据Head：\`${sourceHead}\`  \n> 三平台工件：Runs \`30623725133\`、\`30624246649\`  \n> 目标终态：\`VERIFIED_HOLD\``,
    'task-card target state',
  );
  fs.writeFileSync(cardPath, card, 'utf8');

  const indexPath = 'docs/tasks/TASK_INDEX.md';
  let index = fs.readFileSync(indexPath, 'utf8');
  index = replaceOnce(
    index,
    '> 当前任务：M8-07已Verified，M8-08继续In Progress；main写入保持串行。',
    '> 当前任务：M8-07已Verified，M8-08已Implemented并等待主分支验证；main写入保持串行。',
    'task-index current task',
  );
  index = replaceOnce(
    index,
    'M8-02—M8-07 Verified；M8-08 In Progress',
    'M8-02—M8-07 Verified；M8-08 Implemented',
    'task-index overview',
  );
  index = replaceOnce(
    index,
    '└─ M8-08 V1.0最终质量治理与封版闭环（In Progress）',
    '└─ M8-08 V1.0最终质量治理与封版闭环（Implemented）',
    'task-index tree',
  );
  index = replaceOnce(
    index,
    /(\| M8-08 \|[^\n]+\| 开发：M8-06；封版：M8-07\s+\| )In Progress( \|)/u,
    '$1Implemented$2',
    'task-index table row',
  );
  index = replaceOnce(
    index,
    '1. M0—M8-07保持Verified；M8-08继续In Progress。',
    '1. M0—M8-07保持Verified；M8-08已Implemented并等待主分支验证。',
    'task-index stage gate',
  );
  fs.writeFileSync(indexPath, index, 'utf8');

  fs.writeFileSync(
    'docs/test-evidence/M8-08/release-artifacts.md',
    `# 三平台发布工件\n\n## 结论\n\n版本\`1.0.0\`已在GitHub原生Windows、macOS和Linux Runner完成构建、资产校验及成品启动冒烟。Linux首次启动受Ubuntu 24.04 AppArmor用户命名空间限制，以仓库永久门禁相同的显式CI沙箱回退重跑后通过。\n\n| 平台 | Run | Artifact | 大小 | SHA-256 | 结果 |\n| --- | ---: | ---: | ---: | --- | --- |\n| macOS | 30623725133 | 8790527645 | 122409745 | \`b23377c65900e13689a18da34eb5e4dd6d163e22bbca4363215693792e2a6652\` | PASS |\n| Windows | 30623725133 | 8790649171 | 147976944 | \`ca0e1f7ef66bfc6ccdea7412fbd981ea7891eb569b7a8a200fa33e43cbb5ac8b\` | PASS |\n| Linux | 30624246649 | 8790691885 | 128606196 | \`7b6bd7777afa28f508a7adef1e6c3546c0696690058bb10c1ea9e0997eef633b\` | PASS |\n\n工件均包含\`artifact-manifest.json\`，并通过\`verify-package-assets.mjs\`及\`smoke-packaged-desktop.mjs\`。\n`,
    'utf8',
  );

  fs.writeFileSync(
    'docs/test-evidence/M8-08/summary.md',
    `# M8-08阶段证据摘要\n\n- 任务：V1.0最终质量治理与封版闭环\n- 实施基线：\`main@44fc199c0d4725a9aa169865309674954143f5cf\`\n- 实现分支：\`work/m8-08-v1-final-governance-closure\`\n- 实现PR：#243\n- 实施证据Head：\`${sourceHead}\`\n- 目标版本：\`1.0.0\`\n\n## 已完成\n\n1. 正文保存按稳定身份同步持久化元数据，旧结果不再重置继续编辑后的正文。\n2. AI检查改为串行轮询并具备退避、卸载停止、失败恢复与终态刷新。\n3. 应用/项目能力矩阵、恢复模式和关闭刷新失败交互已接入。\n4. M8-07已在main完成Verified闭环，M8-08封版依赖解除。\n5. 11个工作区包、Renderer版本、README与CHANGELOG统一为\`1.0.0\`。\n6. Windows、macOS、Linux原生便携工件、资产校验与成品启动冒烟通过。\n7. M8-07验证保持与并行任务运行时的衔接规则已修复。\n\n## 当前状态\n\nM8-08已转Implemented。剩余步骤仅为当前Head永久门禁、受控合并、最终main全矩阵验证、Verified终态和正式V1.0 Release。\n`,
    'utf8',
  );
  fs.writeFileSync(
    'docs/test-evidence/M8-08/commands.txt',
    `M8-08 implementation evidence head: ${sourceHead}\nTarget version: 1.0.0\nPR: 243\nM8-07 verified main: 44fc199c0d4725a9aa169865309674954143f5cf\nProduct quality run: 30623729016\nCross-platform run: 30623725133\nLinux controlled retry run: 30624246649\nWindows artifact: 8790649171\nmacOS artifact: 8790527645\nLinux artifact: 8790691885\nPending: current-head permanent gates, merge, final main verification, Verified hold, release\n`,
    'utf8',
  );
  fs.writeFileSync(
    'docs/test-evidence/M8-08/known-risks.md',
    '# M8-08风险记录\n\n- M8-08尚未合并，最终main验证与正式Release仍保持阻断。\n- 工件未签名、未公证，严格限定仓库所有者本人自用。\n- Linux CI使用仓库既有的显式`--no-sandbox`回退，仅用于Ubuntu 24.04 AppArmor Runner；不改变产品默认沙箱策略。\n- 来源PR验证不得替代最终main验证。\n',
    'utf8',
  );
  fs.writeFileSync(
    'docs/test-evidence/M8-08/main-final-verification.md',
    '# 最终main验证\n\n状态：等待M8-08实现PR受控合并。\n\n合并后必须在最终main提交重新执行静态检查、Unit、Integration、Migration、Coverage、Security、Performance、AI协议基线、Electron E2E、Build、三平台包校验与Linux成品启动冒烟。来源PR及工件Run不替代最终main验证。\n',
    'utf8',
  );

  const evidenceRoot = 'docs/test-evidence/M8-08';
  const manifestFiles = fs
    .readdirSync(evidenceRoot)
    .filter((name) => name !== 'manifest.json')
    .sort()
    .map((name) => ({ path: name, ...hashFile(path.join(evidenceRoot, name)) }));
  fs.writeFileSync(
    path.join(evidenceRoot, 'manifest.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        taskId: 'M8-08',
        commit: sourceHead,
        generatedAt: '2026-07-31T18:50:00+08:00',
        acceptanceSource: 'GITHUB_ACTIONS',
        files: manifestFiles,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  const { renderActiveTask } = await import('./task-control-lib.mjs');
  fs.writeFileSync('docs/tasks/ACTIVE_TASK.md', renderActiveTask(active), 'utf8');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
