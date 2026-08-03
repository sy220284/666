import path from 'node:path';

export const TASK_PLANNING_ALLOWED_PATHS = [
  'AGENTS.md',
  'README.md',
  'agent.md',
  'docs/INDEX.md',
  'docs/ai/LOCAL_AI_SERVICE_SPEC.md',
  'docs/ai/PROMPT_AND_EVAL_SPEC.md',
  'docs/ai/PROVIDER_PROTOCOL.md',
  'docs/product/V1_TASK_SYSTEM_REBASE.md',
  'docs/product/V1.0_TRACEABILITY_MATRIX.md',
  'docs/product/WORLDFORGE_V6.5_FULL_SPEC.md',
  'docs/roadmap/V1.0_ROADMAP.md',
  'docs/security/PRIVACY_AND_LOGGING.md',
  'docs/security/THREAT_MODEL.md',
  'docs/tasks/TASK_INDEX.md',
  'docs/tasks/TASK_TEMPLATE.md',
  'docs/tasks/M4_TASKS.md',
  'docs/tasks/M4/M4-04_PROMPT_REGISTRY_OUTPUT.md',
  'docs/tasks/M4/M4-05_GENERATION_RUNTIME_EVAL.md',
  'docs/tasks/M5_TASKS.md',
  'docs/tasks/M5/M5-00_AUTHOR_WORKFLOW_PRODUCT_EXPERIENCE.md',
  'docs/tasks/M5/M5-01_T0_SKELETON.md',
  'docs/tasks/M5/M5-02_T1_CHAPTER_GENERATION.md',
  'docs/tasks/M5/M5-03_REWRITE_WORKFLOWS.md',
  'docs/tasks/M5/M5-04_CANDIDATE_MERGE_PARTIAL.md',
  'docs/tasks/M5/M5-05_CANDIDATE_REVIEW_APPLY.md',
  'docs/tasks/M5/M5-06_STATE_EXTRACTION_PROPOSAL_INTEGRATION.md',
  'docs/tasks/M6_TASKS.md',
  'docs/tasks/M6/M6-02_AI_SEMANTIC_ARC_VALIDATION.md',
  'docs/tasks/M6/M6-03_PROJECT_SEARCH_SAFE_REPLACE.md',
  'docs/tasks/M6/M6-04_GENRE_RHYTHM_SERIAL_METRICS.md',
  'docs/tasks/M6/M6-05_DOCX_TRANSFER.md',
  'docs/tasks/M6/M6-06_THREE_TRACK_BACKUP_RECOVERY.md',
  'docs/tasks/M7_TASKS.md',
  'docs/tasks/M7/M7-01_ONBOARDING_MODES_PATHS.md',
  'docs/tasks/M7/M7-02_UNIFIED_WORKBENCH_INTERACTIONS.md',
  'docs/tasks/M7/M7-03_THEMES_ACCESSIBILITY_RESPONSIVE.md',
  'docs/tasks/M8_TASKS.md',
  'docs/tasks/M8/M8-01_SECURITY_DATA_PRIVACY_HARDENING.md',
  'docs/tasks/M8/M8-02_PERFORMANCE_E2E_AI_EVAL.md',
  'docs/tasks/M3_TASKS.md',
  'docs/tasks/M3/M3-07_RENDERER_REACT_FOUNDATION.md',
  'docs/tasks/M3/M3-08_RENDERER_SHELL_HOME_SETTINGS.md',
  'docs/tasks/M3/M3-09_RENDERER_PLANNING_CANON_STRUCTURE.md',
  'docs/tasks/M3/M3-10_RENDERER_WRITING_CANDIDATE_CUTOVER.md',
  'docs/tasks/M3/RENDERER_ARCHITECTURE_MIGRATION.md',
];

export const SCHEMA_GOVERNANCE_ALLOWED_PATHS = [
  'packages/core-service/src/database/index.ts',
  'packages/core-service/src/database/migrations.ts',
  'packages/core-service/src/project-workspace.ts',
  'tests/migration/project-structure-migration.test.ts',
  'tests/security/project-workspace.test.ts',
];

export const GOVERNANCE_ALLOWED_PATHS = [
  'AGENTS.md',
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
  'scripts/main-verification.mjs',
  'scripts/ruleset-policy.mjs',
  'scripts/scan-secrets.mjs',
  'scripts/task-control-lib.mjs',
  'scripts/taskctl.mjs',
  'docs/PROJECT_EXECUTION_ENTRY.md',
  'docs/process/CODEX_EXECUTION_PLAYBOOK.md',
  'docs/process/DEVELOPMENT_AUTOMATION.md',
  'docs/process/CI_PARALLEL_TOOLCHAIN_MULTITASK.md',
  'docs/process/CI_WORKFLOW_ARCHITECTURE.md',
  'docs/process/MAIN_BRANCH_PROTECTION.md',
  'docs/process/WORKFLOW_EXECUTION_ORDER.md',
  'docs/tasks/TASK_AUTHORIZATION.json',
  'docs/tasks/ACTIVE_TASK.json',
  'docs/tasks/ACTIVE_TASK.md',
  'docs/tasks/TASK_INDEX.md',
  'docs/tasks/TASK_TEMPLATE.md',
  'docs/tasks/M4/M4-04_PROMPT_REGISTRY_OUTPUT.md',
  'docs/tasks/M8/M8-02_PERFORMANCE_E2E_AI_EVAL.md',
  'docs/tasks/M8/M8-04_AUTHOR_EXPERIENCE_LANGUAGE.md',
  'docs/tasks/M9/',
  'docs/tasks/runtime/',
  'docs/test-evidence/M4-04/',
  'docs/test-evidence/M8-02/',
  'docs/test-evidence/M8-04/',
  'docs/test-evidence/M9-00/',
  'docs/test-evidence/M9-02/',
  'docs/product/V1.0_TRACEABILITY_MATRIX.md',
  'README.md',
  'tests/integration/task-lifecycle.test.ts',
  'tests/unit/',
];

export function parseTaskIndex(markdown) {
  const tasks = new Map();
  const rowPattern =
    /^\|\s*(M\d+-\d{2})\s*\|\s*\[[^\]]+\]\(([^)]+)\)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/gm;
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
    new RegExp(`^> 状态：${currentStatus}(?:（[^\\r\\n]*）)?[ \\t]*$`, 'm'),
    `> 状态：${nextStatus}  `,
  );
}

export function isPathInside(filePath, allowedPath) {
  const normalizedFile = filePath.replaceAll('\\', '/').replace(/^\.\//u, '');
  const normalizedAllowed = allowedPath.replaceAll('\\', '/').replace(/^\.\//u, '');
  return normalizedAllowed.endsWith('/')
    ? normalizedFile.startsWith(normalizedAllowed)
    : normalizedFile === normalizedAllowed;
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

export function transitionSnapshotFor(state, baseState = null) {
  const previous = baseState?.activeTask;
  const snapshot = state?.lastImplementedTask;
  if (
    previous?.id &&
    snapshot?.id === previous.id &&
    snapshot?.nextTaskId === state?.activeTask?.id &&
    Array.isArray(snapshot.allowedPaths)
  ) {
    return snapshot;
  }
  return null;
}

export function validateChangedPathsForTransition(changedFiles, state, baseState = null) {
  const snapshot = transitionSnapshotFor(state, baseState);
  if (snapshot) {
    return validateChangedPaths(
      changedFiles,
      [...new Set(snapshot.allowedPaths)],
      [...new Set(snapshot.forbiddenPaths ?? [])],
    );
  }
  const states = [state, baseState].filter(Boolean);
  return validateChangedPaths(
    changedFiles,
    [...new Set(states.flatMap((value) => value.activeTask?.allowedPaths ?? []))],
    [...new Set(states.flatMap((value) => value.activeTask?.forbiddenPaths ?? []))],
  );
}

export function isGovernanceOnlyPullRequest(branch, changedFiles) {
  if (branch !== 'work' || changedFiles.length === 0) return false;
  const allowedPaths = [
    ...GOVERNANCE_ALLOWED_PATHS,
    ...TASK_PLANNING_ALLOWED_PATHS,
    ...SCHEMA_GOVERNANCE_ALLOWED_PATHS,
  ];
  return changedFiles.every((file) =>
    allowedPaths.some((allowed) => isPathInside(file, allowed)),
  );
}

export function taskBranchFor() {
  return 'work';
}

export function validateActiveState(state, taskIndex) {
  const errors = [];
  const activeStatusMap = new Map([
    ['IN_PROGRESS', 'In Progress'],
    ['IMPLEMENTED', 'Implemented'],
    ['VERIFIED_HOLD', 'Verified'],
  ]);
  if (state.schemaVersion !== 1) errors.push('Unsupported ACTIVE_TASK compatibility schemaVersion');
  if (state.authorization?.compatibilityOnly !== true) {
    errors.push('ACTIVE_TASK authorization must be marked compatibilityOnly');
  }
  if (state.authorization?.executionModel !== 'single-work-pr') {
    errors.push('ACTIVE_TASK executionModel must be single-work-pr');
  }
  if (state.authorization?.branch !== 'main') errors.push('Compatibility integration branch must be main');
  if (state.authorization?.allowDirectMainCommits !== false) {
    errors.push('Direct main commits must remain disabled');
  }
  const active = state.activeTask;
  if (!active || !activeStatusMap.has(active.status)) {
    errors.push('ACTIVE_TASK compatibility anchor has an unsupported status');
  }
  if (!active?.id || !/^M\d+-\d{2}$/u.test(active.id)) errors.push('Invalid active task id');
  if ((active?.executionBranch ?? active?.branch) !== 'work' || active?.branch !== 'work') {
    errors.push('Active task compatibility branch must be work');
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
  const nextHeading = remainder.search(/^##\s/mu);
  const section = nextHeading >= 0 ? remainder.slice(0, nextHeading) : remainder;
  return [...section.matchAll(/^\s*-\s+`([^`]+)`/gmu)]
    .map((match) => match[1])
    .filter(Boolean);
}

function taskStageNumber(taskId) {
  const match = /^M(\d+)-\d{2}$/u.exec(taskId ?? '');
  return match?.[1] ? Number(match[1]) : null;
}

function dependencyStageNumbers(dependencyText) {
  const stages = new Set();
  for (const match of dependencyText.matchAll(/M(\d+)(?!-)/gu)) {
    if (match[1]) stages.add(Number(match[1]));
  }
  for (const match of dependencyText.matchAll(/M(\d+)\s*[—–]\s*M?(\d+)(?!\d)/gu)) {
    const start = Number(match[1]);
    const end = Number(match[2]);
    for (let stage = start; stage <= end; stage += 1) stages.add(stage);
  }
  return stages;
}

export function stageCloseDependencyStages(task) {
  const targetStage = taskStageNumber(task?.id);
  if (targetStage === null || !/-01$/u.test(task?.id ?? '')) return [];
  const stages = dependencyStageNumbers(task.dependencyText.trim());
  for (const requiredId of task.dependencyText.match(/M\d+-\d{2}/gu) ?? []) {
    const stage = taskStageNumber(requiredId);
    if (stage !== null) stages.add(stage);
  }
  return [...stages].filter((stage) => stage < targetStage).sort((left, right) => left - right);
}

export function stageClosureErrors(task, taskIndex, state = {}) {
  const errors = [];
  for (const stage of stageCloseDependencyStages(task)) {
    const prefix = `M${stage}-`;
    const stageTasks = [...taskIndex.values()].filter(({ id }) => id.startsWith(prefix));
    if (stageTasks.length === 0) {
      errors.push(`${task.id} activation requires indexed M${stage} tasks`);
      continue;
    }
    for (const stageTask of stageTasks) {
      if (stageTask.status !== 'Verified') {
        errors.push(`${stageTask.id} must be Verified before ${task.id} activation`);
      }
    }
    const deferred = (state.deferredVerification ?? [])
      .map((entry) => entry?.id)
      .filter((id) => typeof id === 'string' && id.startsWith(prefix));
    if (deferred.length > 0) {
      errors.push(`M${stage} deferredVerification must be empty before ${task.id}: ${deferred.join(', ')}`);
    }
  }
  return errors;
}

export function dependenciesSatisfied(task, taskIndex, options = {}) {
  const dependencyText = task.dependencyText.trim();
  if (dependencyText === '无') return true;
  if (stageClosureErrors(task, taskIndex, options.state).length > 0) return false;
  const strictStages = new Set(stageCloseDependencyStages(task));
  const dependencyReady = (status, stage = null) =>
    status === 'Verified' ||
    (options.allowImplemented === true && !strictStages.has(stage) && status === 'Implemented');
  for (const requiredId of new Set(dependencyText.match(/M\d+-\d{2}/gu) ?? [])) {
    if (!dependencyReady(taskIndex.get(requiredId)?.status, taskStageNumber(requiredId))) return false;
  }
  for (const stage of dependencyStageNumbers(dependencyText)) {
    const stageTasks = [...taskIndex.values()].filter(({ id }) => id.startsWith(`M${stage}-`));
    if (stageTasks.length === 0 || stageTasks.some(({ status }) => !dependencyReady(status, stage))) {
      return false;
    }
  }
  return true;
}

export function findNextReadyTask(taskIndex, options = {}) {
  const tasks = [...taskIndex.values()];
  let executionFrontier = -1;
  for (let index = 0; index < tasks.length; index += 1) {
    if (tasks[index]?.status !== 'Planned') executionFrontier = index;
  }
  const next = tasks.slice(executionFrontier + 1).find((task) => task.status === 'Planned');
  if (!next) return undefined;
  return dependenciesSatisfied(next, taskIndex, options) ? next : undefined;
}

export function replaceTaskIndexStatus(markdown, taskId, nextStatus) {
  const matcher = new RegExp(`^(\\|\\s*${taskId}\\s*\\|[^\\n]*\\|\\s*)([^|]+?)(\\s*\\|\\s*)$`, 'm');
  if (!matcher.test(markdown)) throw new Error(`Cannot find ${taskId} row in TASK_INDEX`);
  return markdown.replace(matcher, `$1${nextStatus}$3`);
}

export function verificationForTask(card) {
  const commands = ['pnpm lint', 'pnpm typecheck', 'pnpm test'];
  if (/数据库|SQLite|Migration/iu.test(card)) commands.push('pnpm test:migration', 'pnpm test:integration');
  if (/Electron|IPC|路径|安全/iu.test(card)) commands.push('pnpm test:security', 'pnpm test:e2e');
  if (/Editor|Candidate|锁定|Revision|Patch/iu.test(card)) {
    commands.push('pnpm test:unit', 'pnpm test:integration', 'pnpm test:e2e');
  }
  if (/Prompt|Provider|约束包/iu.test(card)) commands.push('pnpm test:eval', 'pnpm test:integration');
  if (/性能|DPI|高分屏/iu.test(card)) commands.push('pnpm test:perf', 'pnpm test:e2e');
  return [...new Set(commands)];
}

export function renderActiveTask(state) {
  const task = state.activeTask;
  const executionModel = state.authorization?.executionModel ?? 'single-work-pr';
  return `# WorldForge 当前活动任务\n\n> 本文件是 \`docs/tasks/ACTIVE_TASK.json\` 的兼容镜像。全局分支与PR授权以 \`docs/tasks/TASK_AUTHORIZATION.json\` Schema 2为准。\n\n## 当前状态\n\n\`\`\`text\n${task?.status ?? 'NO_ACTIVE_TASK'}\n\`\`\`\n\n- 兼容锚点任务：\`${task?.id ?? '无'}\`\n- 任务卡：\`${task?.source ?? '无'}\`\n- 唯一工作分支：\`${task?.executionBranch ?? task?.branch ?? 'work'}\`\n- 稳定分支：\`main\`\n- 全局执行模型：\`${executionModel}\`\n- 兼容状态机模式：\`${state.authorization?.mode ?? '无'}\`（仅供旧状态读取）\n\n## 当前仓库执行规则\n\n\`\`\`text\n最新已验证main\n→ 唯一work\n→ 实施、测试、文档与Evidence\n→ 唯一work → main PR\n→ 永久门禁\n→ Controlled Merge（Squash）\n→ Main Verification\n→ 任务有效状态关闭\n→ Work Synchronization受控重置work到main\n\`\`\`\n\n禁止任务专属分支、验证分支、治理分支、纯Evidence分支和纯关闭PR。\n`;
}
