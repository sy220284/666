import { readFile, writeFile } from 'node:fs/promises';

async function replaceExact(path, before, after) {
  const source = await readFile(path, 'utf8');
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`Missing repair anchor in ${path}`);
  await writeFile(path, source.replace(before, after), 'utf8');
}

const pullRequestTrigger = `  pull_request:\n    branches: [main]\n`;
const explicitPullRequestTrigger = `  pull_request:\n    branches: [main]\n    types: [opened, synchronize, reopened, ready_for_review]\n`;
for (const path of [
  '.github/workflows/task-governance.yml',
  '.github/workflows/pr-policy.yml',
  '.github/workflows/evidence.yml',
]) {
  await replaceExact(path, pullRequestTrigger, explicitPullRequestTrigger);
}

await replaceExact('.github/workflows/automerge.yml', 'name: Auto Merge\n', 'name: Controlled Merge\n');
await replaceExact(
  'scripts/automerge.mjs',
  'async function ensureMainVerification(owner, repo, config, mergeSha, number, sourceHeadSha) {',
  'export async function ensureMainVerification(owner, repo, config, mergeSha, number, sourceHeadSha) {',
);

const postMergeScript = `import { readFile } from 'node:fs/promises';\n\nimport { ensureMainVerification } from '../../scripts/automerge.mjs';\n\nconst eventPath = process.env.GITHUB_EVENT_PATH;\nconst repository = process.env.GITHUB_REPOSITORY;\nif (!eventPath || !repository) throw new Error('Missing GitHub Actions environment');\n\nconst event = JSON.parse(await readFile(eventPath, 'utf8'));\nconst pull = event.pull_request;\nif (!pull?.merged) {\n  console.log('Pull request was not merged; no main verification is required.');\n  process.exit(0);\n}\n\nconst [owner, repo] = repository.split('/');\nconst config = JSON.parse(await readFile('.github/governance/required-checks.json', 'utf8'));\nawait ensureMainVerification(\n  owner,\n  repo,\n  config,\n  pull.merge_commit_sha,\n  pull.number,\n  pull.head.sha,\n);\n`;
await writeFile('.github/governance/post-merge-verification.mjs', postMergeScript, 'utf8');

const postMergeWorkflow = `name: Post Merge Verification Dispatcher\n\non:\n  pull_request:\n    branches: [main]\n    types: [closed]\n\npermissions:\n  actions: write\n  contents: read\n  pull-requests: read\n\nconcurrency:\n  group: post-merge-verification-\${{ github.event.pull_request.merge_commit_sha || github.run_id }}\n  cancel-in-progress: false\n\njobs:\n  dispatch:\n    if: \${{ github.event.pull_request.merged == true }}\n    runs-on: ubuntu-24.04\n    timeout-minutes: 10\n    steps:\n      - uses: actions/checkout@v6\n        with:\n          ref: main\n          persist-credentials: false\n      - uses: actions/setup-node@v6\n        with:\n          node-version: 24\n      - name: Idempotently schedule Main Verification\n        env:\n          GITHUB_TOKEN: \${{ github.token }}\n        run: node .github/governance/post-merge-verification.mjs\n`;
await writeFile('.github/workflows/post-merge-verification.yml', postMergeWorkflow, 'utf8');

await replaceExact(
  'scripts/task-control-lib.mjs',
  `export function validateChangedPathsForTransition(changedFiles, state, baseState = null) {\n  const states = [state, baseState].filter(Boolean);\n  const allowedPaths = states.flatMap((value) => value.activeTask?.allowedPaths ?? []);\n  const forbiddenPaths = states.flatMap((value) => value.activeTask?.forbiddenPaths ?? []);\n  return validateChangedPaths(\n    changedFiles,\n    [...new Set(allowedPaths)],\n    [...new Set(forbiddenPaths)],\n  );\n}`,
  `export function transitionSnapshotFor(state, baseState = null) {\n  const previous = baseState?.activeTask;\n  const snapshot = state?.lastImplementedTask;\n  if (\n    previous?.id &&\n    snapshot?.id === previous.id &&\n    snapshot?.nextTaskId === state?.activeTask?.id &&\n    Array.isArray(snapshot.allowedPaths)\n  ) {\n    return snapshot;\n  }\n  return null;\n}\n\nexport function validateChangedPathsForTransition(changedFiles, state, baseState = null) {\n  const snapshot = transitionSnapshotFor(state, baseState);\n  if (snapshot) {\n    return validateChangedPaths(\n      changedFiles,\n      [...new Set(snapshot.allowedPaths)],\n      [...new Set(snapshot.forbiddenPaths ?? [])],\n    );\n  }\n  const states = [state, baseState].filter(Boolean);\n  const allowedPaths = states.flatMap((value) => value.activeTask?.allowedPaths ?? []);\n  const forbiddenPaths = states.flatMap((value) => value.activeTask?.forbiddenPaths ?? []);\n  return validateChangedPaths(\n    changedFiles,\n    [...new Set(allowedPaths)],\n    [...new Set(forbiddenPaths)],\n  );\n}`,
);

await replaceExact(
  'scripts/taskctl.mjs',
  `  const implementedAt = new Date().toISOString();\n  const previousSource = state.activeTask.source;\n  state.lastImplementedTask = {\n    id: state.activeTask.id,\n    commit,\n    implementedAt,\n  };`,
  `  const implementedAt = new Date().toISOString();\n  const previousTask = state.activeTask;\n  const transitionAllowedPaths = [...new Set([...previousTask.allowedPaths, next.source])];\n  state.lastImplementedTask = {\n    id: previousTask.id,\n    commit,\n    implementedAt,\n    source: previousTask.source,\n    branch: previousTask.branch,\n    nextTaskId: next.id,\n    allowedPaths: transitionAllowedPaths,\n    forbiddenPaths: [...(previousTask.forbiddenPaths ?? [])],\n  };`,
);
await replaceExact(
  'scripts/taskctl.mjs',
  `  await activate(next.id, [previousSource]);\n  console.log(\n    \`Recorded \${state.lastImplementedTask.id} as Implemented with deferred verification; advanced to \${next.id}.\`,\n  );`,
  `  await activate(next.id);\n  console.log(\n    \`Recorded \${state.lastImplementedTask.id} as Implemented with a transition snapshot; advanced to \${next.id}.\`,\n  );`,
);
await replaceExact('scripts/taskctl.mjs', '  await activate(next.id, [previousSource]);\n  console.log(`Verified active task ${taskId}; advanced to ${next.id}.`);', '  await activate(next.id);\n  console.log(`Verified active task ${taskId}; advanced to ${next.id}.`);');
await replaceExact('scripts/taskctl.mjs', '  await activate(next.id, [previousSource]);\n  console.log(`Closed ${state.lastVerifiedTask.id}; continuous mode advanced to ${next.id}.`);', '  await activate(next.id);\n  console.log(`Closed ${state.lastVerifiedTask.id}; continuous mode advanced to ${next.id}.`);');

await replaceExact(
  '.github/governance/task-transition-policy.mjs',
  `  if (headState?.lastImplementedTask?.id !== previous.id) {\n    errors.push(\`lastImplementedTask must record \${previous.id}\`);\n  }`,
  `  const snapshot = headState?.lastImplementedTask;\n  if (snapshot?.id !== previous.id) {\n    errors.push(\`lastImplementedTask must record \${previous.id}\`);\n  } else {\n    if (snapshot.source !== previous.source) errors.push('lastImplementedTask source must match the completed task');\n    if (snapshot.branch !== previous.branch) errors.push('lastImplementedTask branch must match the completed task');\n    if (snapshot.nextTaskId !== headState?.activeTask?.id) errors.push('lastImplementedTask nextTaskId must match the active task');\n    if (!Array.isArray(snapshot.allowedPaths) || snapshot.allowedPaths.length === 0) {\n      errors.push('lastImplementedTask must preserve the completed task allowedPaths snapshot');\n    }\n  }`,
);
await replaceExact(
  '.github/governance/task-transition-policy.mjs',
  `  const baseState = { activeTask: { id: 'M3-03', status: 'IN_PROGRESS' } };\n  const headState = {\n    activeTask: { id: 'M3-04', status: 'IN_PROGRESS' },\n    lastImplementedTask: { id: 'M3-03' },`,
  `  const baseState = {\n    activeTask: {\n      id: 'M3-03',\n      status: 'IN_PROGRESS',\n      source: 'docs/tasks/M3/M3-03_ENTITY_CANON.md',\n      branch: 'work/m3-03-entity-canon',\n    },\n  };\n  const headState = {\n    activeTask: { id: 'M3-04', status: 'IN_PROGRESS' },\n    lastImplementedTask: {\n      id: 'M3-03',\n      source: 'docs/tasks/M3/M3-03_ENTITY_CANON.md',\n      branch: 'work/m3-03-entity-canon',\n      nextTaskId: 'M3-04',\n      allowedPaths: ['packages/domain/'],\n    },`,
);

const taskTestPath = 'tests/unit/task-control.test.ts';
let taskTests = await readFile(taskTestPath, 'utf8');
taskTests = taskTests.replace(
  `  it('accepts paths from either side of an authorized task transition', () => {\n    const state = {\n      activeTask: { allowedPaths: ['packages/new/'], forbiddenPaths: [] },\n    };\n    const baseState = {\n      activeTask: { allowedPaths: ['packages/previous/'], forbiddenPaths: [] },\n    };\n    expect(\n      validateChangedPathsForTransition(\n        ['packages/previous/index.ts', 'packages/new/index.ts'],\n        state,\n        baseState,\n      ),\n    ).toEqual([]);\n    expect(validateChangedPathsForTransition(['outside.ts'], state, baseState)).toEqual([\n      'outside.ts: outside active task allowed paths',\n    ]);\n  });`,
  `  it('uses the completed task snapshot during an implementation transition', () => {\n    const state = {\n      activeTask: { id: 'M0-02', allowedPaths: ['packages/new/'], forbiddenPaths: [] },\n      lastImplementedTask: {\n        id: 'M0-01',\n        nextTaskId: 'M0-02',\n        allowedPaths: ['packages/previous/', 'docs/tasks/M0/M0-02.md'],\n        forbiddenPaths: [],\n      },\n    };\n    const baseState = {\n      activeTask: { id: 'M0-01', allowedPaths: ['stale/'], forbiddenPaths: [] },\n    };\n    expect(\n      validateChangedPathsForTransition(\n        ['packages/previous/index.ts', 'docs/tasks/M0/M0-02.md'],\n        state,\n        baseState,\n      ),\n    ).toEqual([]);\n    expect(validateChangedPathsForTransition(['packages/new/index.ts'], state, baseState)).toEqual([\n      'packages/new/index.ts: outside active task allowed paths',\n    ]);\n  });`,
);
if (!taskTests.includes('uses the completed task snapshot during an implementation transition')) {
  throw new Error('Failed to update task transition unit test');
}
await writeFile(taskTestPath, taskTests, 'utf8');

const activeStatePath = 'docs/tasks/ACTIVE_TASK.json';
const activeState = JSON.parse(await readFile(activeStatePath, 'utf8'));
const m304Card = await readFile('docs/tasks/M3/M3-04_STATE_TIMELINE_KNOWLEDGE.md', 'utf8');
const m303Card = await readFile('docs/tasks/M3/M3-03_ENTITY_CANON.md', 'utf8');
const extract = (source, heading) => {
  const start = source.indexOf(`## ${heading}`);
  const remainder = source.slice(start + heading.length + 3);
  const next = remainder.search(/^##\s/m);
  const section = next >= 0 ? remainder.slice(0, next) : remainder;
  return [...section.matchAll(/^\s*-\s+\`([^\`]+)\`/gm)].map((match) => match[1]);
};
const controlPaths = (taskId, taskSource) => [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'docs/tasks/ACTIVE_TASK.json',
  'docs/tasks/ACTIVE_TASK.md',
  'docs/tasks/TASK_INDEX.md',
  taskSource,
  'docs/product/V1.0_TRACEABILITY_MATRIX.md',
  `docs/test-evidence/${taskId}/`,
];
activeState.activeTask.allowedPaths = [...new Set([
  ...extract(m304Card, '主要影响范围'),
  ...controlPaths('M3-04', activeState.activeTask.source),
])];
activeState.lastImplementedTask = {
  ...activeState.lastImplementedTask,
  source: 'docs/tasks/M3/M3-03_ENTITY_CANON.md',
  branch: 'work/m3-03-entity-canon',
  nextTaskId: 'M3-04',
  allowedPaths: [...new Set([
    ...extract(m303Card, '主要影响范围'),
    ...controlPaths('M3-03', 'docs/tasks/M3/M3-03_ENTITY_CANON.md'),
    'docs/tasks/M3/M3-04_STATE_TIMELINE_KNOWLEDGE.md',
  ])],
  forbiddenPaths: [],
};
await writeFile(activeStatePath, `${JSON.stringify(activeState, null, 2)}\n`, 'utf8');

for (const path of [
  'docs/process/DEVELOPMENT_AUTOMATION.md',
  'docs/process/CI_WORKFLOW_ARCHITECTURE.md',
  'docs/process/MAIN_BRANCH_PROTECTION.md',
  'docs/process/WORKFLOW_EXECUTION_ORDER.md',
]) {
  const source = await readFile(path, 'utf8');
  await writeFile(path, source.replaceAll('Auto Merge', 'Controlled Merge'), 'utf8');
}

console.log('Governance repair prepared.');
