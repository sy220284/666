import { readFile, writeFile } from 'node:fs/promises';

async function replaceExact(path, before, after) {
  const source = await readFile(path, 'utf8');
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`Missing lifecycle fix anchor in ${path}`);
  await writeFile(path, source.replace(before, after), 'utf8');
}

await replaceExact(
  'scripts/task-control-lib.mjs',
  `  'tests/unit/evidence-policy.test.ts',\n  'tests/unit/task-control.test.ts',`,
  `  'tests/integration/task-lifecycle.test.ts',\n  'tests/unit/evidence-policy.test.ts',\n  'tests/unit/task-control.test.ts',`,
);

await replaceExact(
  'tests/integration/task-lifecycle.test.ts',
  `        allowedPaths: ['packages/core-service/'],`,
  `        allowedPaths: ['packages/core-service/', 'docs/tasks/M1/M1-01.md'],`,
);
await replaceExact(
  'tests/integration/task-lifecycle.test.ts',
  `    expect(updatedState.lastImplementedTask).toMatchObject({ id: 'M1-01', commit: 'abcdef1' });`,
  `    expect(updatedState.lastImplementedTask).toMatchObject({\n      id: 'M1-01',\n      commit: 'abcdef1',\n      source: 'docs/tasks/M1/M1-01.md',\n      branch: 'main',\n      nextTaskId: 'M1-02',\n    });\n    expect(updatedState.lastImplementedTask.allowedPaths).toContain('docs/tasks/M1/M1-01.md');`,
);
await replaceExact(
  'tests/integration/task-lifecycle.test.ts',
  `    expect(updatedState.activeTask.allowedPaths).toContain('docs/tasks/M1/M1-01.md');`,
  `    expect(updatedState.activeTask.allowedPaths).not.toContain('docs/tasks/M1/M1-01.md');`,
);
