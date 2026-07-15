import path from 'node:path';

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

export function validateActiveState(state, taskIndex) {
  const errors = [];
  const activeStatusMap = new Map([
    ['IN_PROGRESS', 'In Progress'],
    ['IMPLEMENTED', 'Implemented'],
  ]);
  if (state.schemaVersion !== 1) errors.push('Unsupported ACTIVE_TASK schemaVersion');
  if (state.authorization?.mode !== 'continuous-mainline') {
    errors.push('Continuous execution requires authorization.mode=continuous-mainline');
  }
  if (state.authorization?.branch !== 'main') errors.push('Authorized work branch must be main');

  const active = state.activeTask;
  if (!active || !activeStatusMap.has(active.status)) {
    errors.push('Exactly one IN_PROGRESS or IMPLEMENTED task is required');
  }
  if (!active?.id || !/^M\d-\d{2}$/.test(active.id)) errors.push('Invalid active task id');

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

export function renderActiveTask(state) {
  const task = state.activeTask;
  const list = (values) => values.map((value) => `  - ${value}`).join('\n');
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

当前作者已预授权在 \`main\` 上连续执行。每次仍只允许一张任务卡；当前任务达到 Verified、证据完整且依赖门通过后，可自动激活下一张依赖已满足的任务。失败时必须转为 Blocked，禁止跳过失败或伪造通过。
`;
}
