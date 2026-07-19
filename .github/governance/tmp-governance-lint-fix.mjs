import { readFile, writeFile } from 'node:fs/promises';

const taskctlPath = 'scripts/taskctl.mjs';
const taskctl = await readFile(taskctlPath, 'utf8');
await writeFile(
  taskctlPath,
  taskctl.replaceAll(
    '  const previousSource = state.activeTask.source;\n  state.activeTask = null;',
    '  state.activeTask = null;',
  ),
  'utf8',
);

const dispatcherPath = '.github/governance/post-merge-verification.mjs';
const dispatcher = await readFile(dispatcherPath, 'utf8');
const withoutEarlyExit = dispatcher.replace(
  `if (!pull?.merged) {\n  console.log('Pull request was not merged; no main verification is required.');\n  process.exit(0);\n}\n\nconst [owner, repo] = repository.split('/');\nconst config = JSON.parse(await readFile('.github/governance/required-checks.json', 'utf8'));\nawait ensureMainVerification(\n  owner,\n  repo,\n  config,\n  pull.merge_commit_sha,\n  pull.number,\n  pull.head.sha,\n);`,
  `if (!pull?.merged) {\n  console.log('Pull request was not merged; no main verification is required.');\n} else {\n  const [owner, repo] = repository.split('/');\n  const config = JSON.parse(await readFile('.github/governance/required-checks.json', 'utf8'));\n  await ensureMainVerification(\n    owner,\n    repo,\n    config,\n    pull.merge_commit_sha,\n    pull.number,\n    pull.head.sha,\n  );\n}`,
);
await writeFile(
  dispatcherPath,
  withoutEarlyExit.startsWith('/* global console, process */')
    ? withoutEarlyExit
    : `/* global console, process */\n${withoutEarlyExit}`,
  'utf8',
);
