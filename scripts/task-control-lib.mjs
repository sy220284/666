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
];

export const SCHEMA_GOVERNANCE_ALLOWED_PATHS = [
  'packages/core-service/src/database/index.ts',
  'packages/core-service/src/database/migrations.ts',
  'packages/core-service/src/project-workspace.ts',
  'tests/migration/project-structure-migration.test.ts',
  'tests/security/project-workspace.test.ts',
];

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
  'scripts/main-verification.mjs',
  'scripts/ruleset-policy.mjs',
  'scripts/scan-secrets.mjs',
  'scripts/task-control-lib.mjs',
  'scripts/taskctl.mjs',
  'docs/PROJECT_EXECUTION_ENTRY.md',
  'docs/process/CODEX_EXECUTION_PLAYBOOK.md',
  'docs/process/DEVELOPMENT_AUTOMATION.md',
  'docs/process/CI_WORKFLOW_ARCHITECTURE.md',
  'docs/process/MAIN_BRANCH_PROTECTION.md',
  'docs/process/WORKFLOW_EXECUTION_ORDER.md',
  'docs/tasks/ACTIVE_TASK.json',
  'docs/tasks/ACTIVE_TASK.md',
  'tests/integration/task-lifecycle.test.ts',
  'tests/unit/evidence-policy.test.ts',
  'tests/unit/task-control.test.ts',
  'tests/unit/task-ordering.test.ts',
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
    new RegExp(`^> 状态：${currentStatus}(?:（[^\\r\\n]*）)?[ \\t]*$`, 'm'),
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
  const allowedPaths = states.flatMap((value) => value.activeTask?.allowedPaths ?? []);
  const forbiddenPaths = states.flatMap((value) => value.activeTask?.forbiddenPaths ?? []);
  return validateChangedPaths(
    changedFiles,
    [...new Set(allowedPaths)],
    [...new Set(forbiddenPaths)],
  );
}

export function isGovernanceOnlyPullRequest(branch, changedFiles) {
  const value = branch ?? '';
  const governanceBranch = /^(?:policy\/|chore\/governance-|fix\/governance-)/u.test(value);
  const planningBranch = /^policy\/task-plan-/u.test(value);
  const schemaGovernanceBranch = /^(?:policy|fix)\/governance-schema-/u.test(value);
  const allowedPaths = planningBranch
    ? [...GOVERNANCE_ALLOWED_PATHS, ...TASK_PLANNING_ALLOWED_PATHS]
    : schemaGovernanceBranch
      ? [...GOVERNANCE_ALLOWED_PATHS, ...SCHEMA_GOVERNANCE_ALLOWED_PATHS]
      : GOVERNANCE_ALLOWED_PATHS;
  return governanceBranch && changedFiles.every((file) => allowedPaths.some((allowed) => isPathInside(file, allowed)));
}

export function dependenciesSatisfied(task, tasks, options = {}) {
  if (!task) return false;
  const dependencyText = task.dependencyText.trim();
  if (dependencyText === '无') return true;
  const allowImplemented = options.allowImplemented ?? false;
  const validStatuses = allowImplemented ? new Set(['Verified', 'Implemented']) : new Set(['Verified']);
  const dependencies = dependencyText.split('、').map((item) => item.trim());
  return dependencies.every((dependency) => {
    const stage = dependency.match(/^M(\d)$/u);
    if (stage) {
      const prefix = `${stage[0]}-`;
      const stageTasks = [...tasks.values()].filter((candidate) => candidate.id.startsWith(prefix));
      return stageTasks.length > 0 && stageTasks.every((candidate) => validStatuses.has(candidate.status));
    }
    const candidate = tasks.get(dependency);
    return Boolean(candidate && validStatuses.has(candidate.status));
  });
}

export function stageClosureErrors(task, tasks, state = null) {
  if (!task) return [];
  const dependencies = task.dependencyText.split('、').map((item) => item.trim());
  const errors = [];
  for (const dependency of dependencies) {
    const stage = dependency.match(/^M(\d)$/u);
    if (!stage) continue;
    const prefix = `${stage[0]}-`;
    const stageTasks = [...tasks.values()].filter((candidate) => candidate.id.startsWith(prefix));
    for (const candidate of stageTasks) {
      if (candidate.status !== 'Verified') {
        errors.push(`${candidate.id} must be Verified before ${task.id} activation`);
      }
    }
    const deferred = state?.deferredVerification?.filter((entry) => entry.id.startsWith(prefix)) ?? [];
    if (deferred.length > 0) {
      errors.push(
        `${stage[0]} deferredVerification must be empty before ${task.id}: ${deferred
          .map((entry) => entry.id)
          .join(', ')}`,
      );
    }
  }
  return errors;
}

export function findNextReadyTask(tasks, options = {}) {
  for (const task of tasks.values()) {
    if (task.status !== 'Planned') continue;
    if (dependenciesSatisfied(task, tasks, options)) return task;
  }
  return undefined;
}

export function validateActiveState(state, tasks) {
  const errors = [];
  if (!state || typeof state !== 'object') return ['Task state must be an object'];
  if (state.schemaVersion !== 1) errors.push('Task state schemaVersion must equal 1');
  if (!state.authorization || typeof state.authorization !== 'object') {
    errors.push('Task authorization is required');
  }
  const task = state.activeTask;
  if (!task || typeof task !== 'object') return [...errors, 'activeTask is required'];
  const indexed = tasks.get(task.id);
  if (!indexed) return [...errors, `Active task ${task.id} is missing from TASK_INDEX`];
  if (indexed.source !== task.source) {
    errors.push(`Active task source mismatch: expected ${indexed.source}, received ${task.source}`);
  }
  const expectedStatus = indexed.status.toUpperCase().replaceAll(' ', '_');
  if (task.status !== expectedStatus) {
    errors.push(`Active task status mismatch: expected ${expectedStatus}, received ${task.status}`);
  }
  if (!Array.isArray(task.allowedPaths) || task.allowedPaths.length === 0) {
    errors.push('activeTask.allowedPaths must be a non-empty array');
  }
  if (!Array.isArray(task.verification) || task.verification.length === 0) {
    errors.push('activeTask.verification must be a non-empty array');
  }
  return errors;
}

export function extractBacktickBullets(markdown, heading) {
  const section = markdown.match(
    new RegExp(`## ${heading}\\s+([\\s\\S]*?)(?=\\n## |$)`, 'u'),
  )?.[1];
  if (!section) return [];
  return [...section.matchAll(/^- `([^`]+)`/gmu)].map((match) => match[1]);
}

export function replaceTaskIndexStatus(markdown, taskId, currentStatus, nextStatus) {
  const rowPattern = new RegExp(
    `^(\\|\\s*${taskId}\\s*\\|[^\\n]*\\|\\s*)${currentStatus}(\\s*\\|)$`,
    'm',
  );
  return markdown.replace(rowPattern, `$1${nextStatus}$2`);
}
