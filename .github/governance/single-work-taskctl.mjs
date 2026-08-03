/* global console, process */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const authorizationPath = path.join(root, 'docs/tasks/TASK_AUTHORIZATION.json');
const activePath = path.join(root, 'docs/tasks/ACTIVE_TASK.json');
const mirrorPath = path.join(root, 'docs/tasks/ACTIVE_TASK.md');

export function validateSingleWorkState(authorization, activeState) {
  const errors = [];
  if (authorization?.schemaVersion !== 2) errors.push('TASK_AUTHORIZATION schemaVersion must be 2');
  if (authorization?.mode !== 'single-work-pr') errors.push('TASK_AUTHORIZATION mode must be single-work-pr');
  if (authorization?.baseBranch !== 'main') errors.push('baseBranch must be main');
  if (authorization?.workBranch !== 'work') errors.push('workBranch must be work');
  if (authorization?.allowDirectMainCommits !== false) errors.push('Direct main commits must be disabled');
  if (authorization?.allowAdditionalBranches !== false) errors.push('Additional branches must be disabled');
  if (authorization?.maxOpenWorkPullRequests !== 1) {
    errors.push('Exactly one open work PR must be allowed');
  }
  if (activeState?.activeTask?.branch && activeState.activeTask.branch !== 'work') {
    errors.push('ACTIVE_TASK compatibility branch must be work');
  }
  if (
    activeState?.activeTask?.executionBranch &&
    activeState.activeTask.executionBranch !== 'work'
  ) {
    errors.push('ACTIVE_TASK executionBranch must be work');
  }
  return errors;
}

export function renderCompatibilityMirror(authorization, activeState) {
  const task = activeState.activeTask;
  return `# WorldForge 当前活动任务\n\n> 本文件是 \`docs/tasks/ACTIVE_TASK.json\` 的兼容镜像。全局授权以 \`docs/tasks/TASK_AUTHORIZATION.json\` Schema 2为准。\n\n## 当前状态\n\n\`\`\`text\n${task?.status ?? 'NO_ACTIVE_TASK'}\n\`\`\`\n\n- 兼容锚点任务：\`${task?.id ?? '无'}\`\n- 任务卡：\`${task?.source ?? '无'}\`\n- 唯一工作分支：\`${authorization.workBranch}\`\n- 稳定分支：\`${authorization.baseBranch}\`\n- 全局授权模式：\`${authorization.mode}\`\n- 兼容状态机模式：\`${activeState.authorization?.mode ?? '无'}\`（仅供旧状态读取）\n\n## 当前仓库执行规则\n\n\`\`\`text\n最新已验证main\n→ 唯一work\n→ 实施、测试、文档与Evidence\n→ 唯一work → main PR\n→ 永久门禁\n→ Controlled Merge（Squash）\n→ Main Verification\n→ 任务有效状态关闭\n→ Work Synchronization受控重置work到main\n\`\`\`\n\n禁止任务专属分支、验证分支、治理分支、纯Evidence分支和纯关闭PR。\n\n## 兼容说明\n\n- \`ACTIVE_TASK.json.authorization.mode\`只维持历史状态机兼容。\n- 新建及活动Runtime使用\`executionBranch: work\`。\n- 已Verified历史Runtime中的来源分支保持冻结。\n`;
}

export function validateCompatibilityMirror(authorization, activeState, mirror) {
  return mirror === renderCompatibilityMirror(authorization, activeState)
    ? []
    : ['ACTIVE_TASK.md compatibility mirror is stale; run pnpm task:sync'];
}

async function loadState({ includeMirror = true } = {}) {
  const [authorization, activeState, mirror] = await Promise.all([
    readFile(authorizationPath, 'utf8').then(JSON.parse),
    readFile(activePath, 'utf8').then(JSON.parse),
    includeMirror ? readFile(mirrorPath, 'utf8') : Promise.resolve(null),
  ]);
  return { authorization, activeState, mirror };
}

async function validate() {
  const { authorization, activeState, mirror } = await loadState();
  const errors = [
    ...validateSingleWorkState(authorization, activeState),
    ...validateCompatibilityMirror(authorization, activeState, mirror),
  ];
  if (errors.length > 0) throw new Error(errors.join('\n'));
  console.log('Single work task state and compatibility mirror are valid.');
  return { authorization, activeState };
}

async function status() {
  const { authorization, activeState } = await validate();
  console.log(
    JSON.stringify(
      {
        mode: authorization.mode,
        baseBranch: authorization.baseBranch,
        workBranch: authorization.workBranch,
        activeTask: activeState.activeTask?.id ?? null,
        activeStatus: activeState.activeTask?.status ?? null,
      },
      null,
      2,
    ),
  );
}

async function sync() {
  const { authorization, activeState } = await loadState({ includeMirror: false });
  const errors = validateSingleWorkState(authorization, activeState);
  if (errors.length > 0) throw new Error(errors.join('\n'));
  await writeFile(mirrorPath, renderCompatibilityMirror(authorization, activeState), 'utf8');
  console.log('ACTIVE_TASK compatibility mirror synchronized.');
}

async function rejectLegacyMutation(command) {
  await validate();
  throw new Error(
    `${command} no longer mutates the legacy ACTIVE_TASK state machine. Create or update docs/tasks/runtime/<TASK-ID>.json on work and use the single work pull request lifecycle.`,
  );
}

async function main() {
  const command = process.argv[2] ?? 'validate';
  if (command === 'validate' || command === 'preflight' || command === 'branch-check') {
    await validate();
  } else if (command === 'status') {
    await status();
  } else if (command === 'sync') {
    await sync();
  } else {
    await rejectLegacyMutation(command);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
