import path from 'node:path';

export const GOVERNANCE_ALLOWED_PATHS = [
  '.gitignore',
  '.github/CODEOWNERS',
  '.github/governance/',
  '.github/pull_request_template.md',
  '.github/workflows/',
  'package.json',
  'agent.md',
  'packages/testkit/src/evidence.ts',
  'scripts/automerge.mjs',
  'scripts/branch-hygiene.mjs',
  'scripts/ci-policy.mjs',
  'scripts/evidence-policy.mjs',
  'scripts/ruleset-policy.mjs',
  'scripts/scan-secrets.mjs',
  'scripts/task-control-lib.mjs',
  'scripts/taskctl.mjs',
  'docs/PROJECT_EXECUTION_ENTRY.md',
  'docs/process/CODEX_EXECUTION_PLAYBOOK.md',
  'docs/process/DEVELOPMENT_AUTOMATION.md',
  'docs/process/CI_WORKFLOW_ARCHITECTURE.md',
  'docs/process/MAIN_BRANCH_PROTECTION.md',
  'docs/tasks/ACTIVE_TASK.json',
  'docs/tasks/ACTIVE_TASK.md',
  'tests/unit/evidence-policy.test.ts',
  'tests/unit/task-control.test.ts',
  'tests/unit/testkit-fixtures-evidence.test.ts',
];

export function parseTaskIndex(markdown) {
  const tasks = new Map();
  const rowPattern =
    /^\|\s*(M\d-\d{2})\s*\|\s*\[[^\]]+\]\(([^)]+)\)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/gm;

  for (const match of markdown.matchAll(rowPattern)) {
    const [, id, source, dependencyText, status] = match;
    if (!id || !source || !dependencyText || !status) continue;
    tasks.set(id, {
      id,
      source: path.posix.join('docs/tasks', source),
      dependencyText: dependencyText.trim(),
      status: status.trim(),
    });
  }

  return tasks;
}

const TASK_CARD_STATUSES = new Set(['Planned', 'In Progress', 'Implemented', 'Verified']);

export function replaceTaskCardStatus(markdown, currentStatus, nextStatus) {
  if (!TASK_CARD_STATUSES.has(currentStatus) || !TASK_CARD_STATUSES.has(nextStatus)) {
    throw new Error('Unsupported task card status transition');
  }
  return markdown.replace(
    new RegExp(`^> 状态：${currentStatus}[ \\t]*$`, 'm'),
    `> 状态：${nextStatus}  `,
  );
}

export function isPathInside(filePath, allowedPath) {
  const normalizedFile = filePath.replaceAll('\\', '/').replace(/^\.\//, '');
  const normalizedAllowed = allowedPath.replaceAll('\\', '/').replace(/^\.\//, '');
  if (normalizedAllowed.endsWith('/')) return normalizedFile.startsWith(normalizedAllowed);
  return normalizedFile === normalizedAllowed;
}

export function validateChangedPaths(changedFiles, allowedPaths, forbiddenPaths) {
  const violations = [];
  for (const file of changedFiles) {
    if (forbiddenPaths.some((blocked) => isPathInside(file, blocked))) {
      violations.push(`${file}: forbidden by active task`);
      continue;
    }
    if (!allowedPaths.some((allowed) => isPathInside(file, allowed))) {
      violations.push(`${file}: outside active task allowed paths`);
    }
  }
  return violations;
}

export function validateChangedPathsForTransition(changedFiles, state, baseState = null) {
  const states = [state, baseState].filter(Boolean);
  const allowedPaths = states.flatMap((value) => value.activeTask?.allowedPaths ?? []);
  const forbiddenPaths = states.flatMap((value) => value.activeTask?.forbiddenPaths ?? []);
  return validateChangedPaths(
    changedFiles,
    [...new Set(allowedPaths)],
    [...new Set(forbiddenPaths)],
  );
}

export function isGovernanceOnlyPullRequest(branch, changedFiles) {
  const governanceBranch = /^(?:policy\/|chore\/governance-|fix\/governance-)/u.test(branch ?? '');
  return (
    governanceBranch &&
    changedFiles.length > 0 &&
    changedFiles.every((file) =>
      GOVERNANCE_ALLOWED_PATHS.some((allowed) => isPathInside(file, allowed)),
    )
  );
}

export function taskBranchFor(task) {
  const cardName = path.posix.basename(task.source, '.md').toLowerCase().replaceAll('_', '-');
  return `work/${cardName}`;
}

export function validateActiveState(state, taskIndex) {
  const errors = [];
  const activeStatusMap = new Map([
    ['IN_PROGRESS', 'In Progress'],
    ['IMPLEMENTED', 'Implemented'],
  ]);
  if (state.schemaVersion !== 1) errors.push('Unsupported ACTIVE_TASK schemaVersion');
  const authorizationModes = new Set([
    'continuous-mainline',
    'implementation-mainline',
    'implementation-pr',
  ]);
  if (!authorizationModes.has(state.authorization?.mode)) {
    errors.push('Unsupported task authorization mode');
  }
  const implementationFirst = ['implementation-mainline', 'implementation-pr'].includes(
    state.authorization?.mode,
  );
  if (implementationFirst && state.authorization?.deferVerificationUntilBatch !== true) {
    errors.push('Implementation-first execution must explicitly defer verification until batch');
  }
  if (implementationFirst && !Array.isArray(state.deferredVerification)) {
    errors.push('Implementation-first execution requires a deferredVerification ledger');
  }

  const pullRequestOnly = state.authorization?.mode === 'implementation-pr';
  if (state.authorization?.branch !== 'main') {
    errors.push('Authorized integration branch must be main');
  }
  if (pullRequestOnly && state.authorization?.allowDirectMainCommits !== false) {
    errors.push('PR-only execution must disable direct main commits');
  }

  const active = state.activeTask;
  if (!active || !activeStatusMap.has(active.status)) {
    errors.push('Exactly one IN_PROGRESS or IMPLEMENTED task is required');
  }
  if (!active?.id || !/^M\d-\d{2}$/.test(active.id)) errors.push('Invalid active task id');
  if (pullRequestOnly) {
    if (!active?.branch || active.branch === 'main') {
      errors.push('PR-only execution requires a non-main task branch');
    } else if (
      !/^(?:work|feat|fix|refactor|test|docs|chore)\/[a-z0-9._/-]+$/u.test(active.branch)
    ) {
      errors.push('PR-only task branch must use an approved work prefix');
    }
  }

  const indexed = active?.id ? taskIndex.get(active.id) : undefined;
  if (!indexed) errors.push(`Active task ${active?.id ?? '<missing>'} is absent from TASK_INDEX`);
  if (indexed && indexed.source !== active.source) {
    errors.push(`Active task source differs from TASK_INDEX: ${indexed.source}`);
  }
  const expectedIndexStatus = activeStatusMap.get(active?.status);
  if (indexed && expectedIndexStatus && indexed.status !== expectedIndexStatus) {
    errors.push(`TASK_INDEX status must be ${expectedIndexStatus}, found ${indexed.status}`);
  }
  if (!Array.isArray(active?.allowedPaths) || active.allowedPaths.length === 0) {
    errors.push('Active task must declare allowedPaths');
  }
  if (!Array.isArray(active?.verification) || active.verification.length === 0) {
    errors.push('Active task must declare verification commands');
  }

  return errors;
}

export function extractBacktickBullets(markdown, heading) {
  const start = markdown.indexOf(`## ${heading}`);
  if (start < 0) return [];
  const remainder = markdown.slice(start + heading.length + 3);
  const nextHeading = remainder.search(/^##\s/m);
  const section = nextHeading >= 0 ? remainder.slice(0, nextHeading) : remainder;
  return [...section.matchAll(/^\s*-\s+`([^`]+)`/gm)].map((match) => match[1]).filter(Boolean);
}

export function dependenciesSatisfied(task, taskIndex, options = {}) {
  const dependencyText = task.dependencyText.trim();
  if (dependencyText === '无') return true;

  const dependencyReady = (status) =>
    status === 'Verified' || (options.allowImplemented === true && status === 'Implemented');

  const requiredIds = new Set(dependencyText.match(/M\d-\d{2}/g) ?? []);
  for (const requiredId of requiredIds) {
    if (!dependencyReady(taskIndex.get(requiredId)?.status)) return false;
  }

  const stageNumbers = new Set();
  for (const match of dependencyText.matchAll(/M(\d)(?!-)/g)) {
    if (match[1]) stageNumbers.add(Number(match[1]));
  }
  for (const match of dependencyText.matchAll(/M(\d)\s*[—–]\s*M?(\d)(?!\d)/g)) {
    const start = Number(match[1]);
    const end = Number(match[2]);
    for (let stage = start; stage <= end; stage += 1) stageNumbers.add(stage);
  }

  for (const stage of stageNumbers) {
    const stageTasks = [...taskIndex.values()].filter(({ id }) => id.startsWith(`M${stage}-`));
    if (stageTasks.length === 0 || stageTasks.some(({ status }) => !dependencyReady(status))) {
      return false;
    }
  }

  return true;
}

export function findNextReadyTask(taskIndex, options = {}) {
  return [...taskIndex.values()].find(
    (task) => task.status === 'Planned' && dependenciesSatisfied(task, taskIndex, options),
  );
}

export function replaceTaskIndexStatus(markdown, taskId, nextStatus) {
  const matcher = new RegExp(`^(\\|\\s*${taskId}\\s*\\|[^\\n]*\\|\\s*)([^|]+?)(\\s*\\|\\s*)$`, 'm');
  if (!matcher.test(markdown)) throw new Error(`Cannot find ${taskId} row in TASK_INDEX`);
  return markdown.replace(matcher, `$1${nextStatus}$3`);
}

export function verificationForTask(card) {
  const commands = ['pnpm lint', 'pnpm typecheck', 'pnpm test'];
  if (/数据库|SQLite|Migration/i.test(card)) {
    commands.push('pnpm test:migration', 'pnpm test:integration');
  }
  if (/Electron|IPC|路径|安全/i.test(card)) commands.push('pnpm test:security', 'pnpm test:e2e');
  if (/Editor|Candidate|锁定|Revision|Patch/i.test(card)) {
    commands.push('pnpm test:unit', 'pnpm test:integration', 'pnpm test:e2e');
  }
  if (/Prompt|Provider|约束包/i.test(card)) {
    commands.push('pnpm test:eval', 'pnpm test:integration');
  }
  if (/性能|DPI|高分屏/i.test(card)) commands.push('pnpm test:perf', 'pnpm test:e2e');
  return [...new Set(commands)];
}

export function renderActiveTask(state) {
  const task = state.activeTask;
  const list = (values) => values.map((value) => `  - ${value}`).join('\n');
  let continuationRule;
  if (state.authorization.mode === 'implementation-pr') {
    continuationRule =
      '当前作者已授权实现优先的PR模式：每张任务必须在独立非main分支完成并提交Pull Request；PR Policy、Task Governance、Security、Performance、Evidence与Quality全部通过后，才允许执行受控合并。机器人和GitHub Actions不得直接推送main；任何代码、测试、安全或数据边界失败立即阻断。';
  } else if (state.authorization.mode === 'implementation-mainline') {
    continuationRule =
      '当前作者已授权实现优先顺序推进：每次只编程一张任务卡；真实代码、必要专项测试和远端质量门通过后标记 Implemented，并把证据、截图、人工验收与最终 Verified 关闭登记到 deferredVerification 后推进下一张。任何代码、测试、安全或数据边界失败仍立即阻断；延期项不得冒充 Verified 或用于发布。';
  } else {
    continuationRule =
      '当前作者已预授权在 `main` 上连续执行。每次仍只允许一张任务卡；当前任务达到 Verified、证据完整且依赖门通过后，可自动激活下一张依赖已满足的任务。失败时必须转为 Blocked，禁止跳过失败或伪造通过。';
  }
  return `# WorldForge 当前活动任务

> 本文件由 \`docs/tasks/ACTIVE_TASK.json\` 生成，请勿手工维护任务字段。

## 当前状态

\`\`\`text
${task.status}
\`\`\`

- 任务ID：\`${task.id}\`
- 唯一任务卡：\`${task.source}\`
- 工作分支：\`${task.branch}\`
- 开始时间：\`${task.startedAt}\`
- 授权模式：\`${state.authorization.mode}\`
- 授权人：\`${state.authorization.approvedBy}\`

## 执行范围

\`\`\`yaml
allowed_paths:
${list(task.allowedPaths)}
forbidden_paths:
${list(task.forbiddenPaths)}
required_docs:
${list(task.requiredDocs)}
verification:
${list(task.verification)}
\`\`\`

## 连续执行规则

${continuationRule}
`;
}
