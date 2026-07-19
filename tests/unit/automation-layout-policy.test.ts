import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  PERMANENT_GOVERNANCE_FILES,
  PERMANENT_WORKFLOWS,
  validateAutomationLayout,
} from '../../scripts/automation-layout-policy.mjs';

const temporaryDirectories: string[] = [];

async function automationFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-automation-layout-'));
  temporaryDirectories.push(root);
  const workflows = path.join(root, '.github', 'workflows');
  const governance = path.join(root, '.github', 'governance');
  await Promise.all([mkdir(workflows, { recursive: true }), mkdir(governance, { recursive: true })]);

  await Promise.all([
    ...PERMANENT_WORKFLOWS.map((file) =>
      writeFile(path.join(workflows, file), 'name: Generic\non: workflow_dispatch\npermissions: {}\njobs: {}\n'),
    ),
    ...PERMANENT_GOVERNANCE_FILES.map((file) =>
      writeFile(path.join(governance, file), file.endsWith('.json') ? '{}\n' : 'export {};\n'),
    ),
  ]);
  return { root, workflows, governance };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('permanent automation inventory', () => {
  it('accepts only the registered workflow and governance files', async () => {
    const fixture = await automationFixture();
    await expect(validateAutomationLayout(fixture.root)).resolves.toEqual({
      workflows: PERMANENT_WORKFLOWS.length,
      governanceFiles: PERMANENT_GOVERNANCE_FILES.length,
    });
  });

  it('rejects extra workflows and governance helpers regardless of their names', async () => {
    const workflowFixture = await automationFixture();
    await writeFile(
      path.join(workflowFixture.workflows, 'closeout-refresh.yml'),
      'name: Extra\non: workflow_dispatch\npermissions: {}\njobs: {}\n',
    );
    await expect(validateAutomationLayout(workflowFixture.root)).rejects.toThrow(
      'unexpected automation file closeout-refresh.yml',
    );

    const governanceFixture = await automationFixture();
    await writeFile(path.join(governanceFixture.governance, 'one-off-helper.mjs'), 'export {};\n');
    await expect(validateAutomationLayout(governanceFixture.root)).rejects.toThrow(
      'unexpected automation file one-off-helper.mjs',
    );
  });

  it('rejects task IDs, fixed task branches and fixed PR conditions in permanent automation', async () => {
    const taskFixture = await automationFixture();
    await writeFile(
      path.join(taskFixture.workflows, 'quality.yml'),
      'name: Quality M3-04\non: workflow_dispatch\npermissions: {}\njobs: {}\n',
    );
    await expect(validateAutomationLayout(taskFixture.root)).rejects.toThrow('forbidden task id');

    const branchFixture = await automationFixture();
    await writeFile(
      path.join(branchFixture.workflows, 'quality.yml'),
      "name: Quality\non: workflow_dispatch\npermissions: {}\njobs:\n  check:\n    if: ${{ github.head_ref == 'work/m3-04-state' }}\n",
    );
    await expect(validateAutomationLayout(branchFixture.root)).rejects.toThrow(
      'forbidden task branch',
    );

    const prFixture = await automationFixture();
    await writeFile(
      path.join(prFixture.workflows, 'quality.yml'),
      'name: Quality\non: workflow_dispatch\npermissions: {}\njobs:\n  check:\n    if: ${{ github.event.pull_request.number == 59 }}\n',
    );
    await expect(validateAutomationLayout(prFixture.root)).rejects.toThrow(
      'forbidden fixed pull request number',
    );
  });
});
