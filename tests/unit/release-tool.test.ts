import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  collectReleaseAssets,
  evaluateReleaseGate,
  parseReleaseVersion,
  renderChecksums,
  validateReleaseConfiguration,
} from '../../scripts/release-tool.mjs';

interface TaskIndexEntry {
  readonly id: string;
  readonly dependency: string;
  readonly status: string;
}

const temporaryDirectories: string[] = [];

const taskIndex = (entries: readonly TaskIndexEntry[]) =>
  '\n| ID | 任务卡 | 依赖 | 状态 |\n' +
  '|---|---|---|---|\n' +
  entries
    .map(
      (entry) => `| ${entry.id} | [任务](${entry.id}.md) | ${entry.dependency} | ${entry.status} |`,
    )
    .join('\n') +
  '\n';

const verifiedTasks = [
  { id: 'M8-02', dependency: 'M4-04', status: 'Verified' },
  { id: 'M8-04', dependency: 'M8-02', status: 'Verified' },
  { id: 'M8-05', dependency: 'M8-04', status: 'Implemented' },
] as const;

const runtime = (id: string, status = 'IMPLEMENTED') => ({
  schemaVersion: 2,
  id,
  status,
  verificationBinding: { taskContext: `task-verification/${id}` },
});

const successStatuses = verifiedTasks.map((task) => ({
  context: `task-verification/${task.id}`,
  state: 'success',
}));

const authorization = {
  schemaVersion: 2,
  mode: 'single-work-pr',
  baseBranch: 'main',
  workBranch: 'work',
  mainWriteMode: 'serialized',
  verificationClosure: 'main-status',
  taskRuntimeDirectory: 'docs/tasks/runtime',
};

const releaseWorkflow = [
  'workflow_dispatch:',
  'fetch-depth: 0',
  'package_smoke: false',
  'pnpm audit --audit-level=high',
  'node scripts/scan-secrets.mjs',
  'pnpm release:gate',
  'gh release create',
].join('\n');

const packageJson = {
  version: '1.0.0',
  scripts: {
    package: 'node scripts/package-desktop.mjs',
    'package:foundation': 'node scripts/package-foundation.mjs',
    'release:check': 'node scripts/release-tool.mjs check',
    'release:gate': 'node scripts/release-tool.mjs gate',
    'release:checksums': 'node scripts/release-tool.mjs checksums',
  },
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('release tool', () => {
  it('accepts strict SemVer and rejects tag syntax or leading zeroes', () => {
    expect(parseReleaseVersion('1.2.3')).toBe('1.2.3');
    expect(parseReleaseVersion('1.2.3-rc.1+build.5')).toBe('1.2.3-rc.1+build.5');
    expect(() => parseReleaseVersion('v1.2.3')).toThrow(/without a leading v/);
    expect(() => parseReleaseVersion('1.2.3-rc.01')).toThrow(/leading zeroes/);
  });

  it('validates the release workflow, package scripts and Schema 2 sources', () => {
    expect(
      validateReleaseConfiguration({
        packageJson,
        taskIndexMarkdown: taskIndex(verifiedTasks),
        authorization,
        workflowSource: releaseWorkflow,
      }),
    ).toEqual([]);
  });

  it('ignores absorbed historical task rows when checking independent tasks', () => {
    const result = evaluateReleaseGate({
      taskIndexMarkdown:
        taskIndex(verifiedTasks) +
        '\n## 3. 被吸收的需求来源\n' +
        taskIndex([{ id: 'M4-05', dependency: 'M4-04', status: 'Removed（absorbed）' }]),
      runtimes: verifiedTasks.map((task) => runtime(task.id)),
      statuses: successStatuses,
      packageVersion: '1.0.0',
      requestedVersion: '1.0.0',
      refName: 'main',
    });

    expect(result.errors).toEqual([]);
  });

  it('blocks publishing when a task is not effectively Verified', () => {
    const result = evaluateReleaseGate({
      taskIndexMarkdown: taskIndex(verifiedTasks),
      runtimes: verifiedTasks.map((task) => runtime(task.id)),
      statuses: successStatuses.filter((status) => !status.context.endsWith('M8-05')),
      packageVersion: '1.0.0',
      requestedVersion: '1.0.1',
      refName: 'feature',
    });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        'Requested version 1.0.1 does not match package.json version 1.0.0',
        'Releases may only run from main, found feature',
        'All independent tasks must be effectively Verified before publishing: M8-05 IMPLEMENTED',
      ]),
    );
  });

  it('blocks a release-blocking runtime that is absent from TASK_INDEX', () => {
    const result = evaluateReleaseGate({
      taskIndexMarkdown: taskIndex(verifiedTasks),
      runtimes: [...verifiedTasks.map((task) => runtime(task.id)), runtime('M8-06')],
      statuses: [...successStatuses, { context: 'task-verification/M8-06', state: 'success' }],
      packageVersion: '1.0.0',
      requestedVersion: '1.0.0',
      refName: 'main',
    });

    expect(result.errors).toContain(
      'Release-blocking runtimes are absent from TASK_INDEX: M8-06',
    );
  });

  it('allows publishing from main when all runtime statuses are successful', () => {
    const result = evaluateReleaseGate({
      taskIndexMarkdown: taskIndex(verifiedTasks),
      runtimes: verifiedTasks.map((task) => runtime(task.id)),
      statuses: successStatuses,
      packageVersion: '1.0.0',
      requestedVersion: '1.0.0',
      refName: 'main',
    });

    expect(result).toMatchObject({
      version: '1.0.0',
      taskId: 'M8-05',
      taskStatus: 'VERIFIED',
      errors: [],
    });
  });

  it('creates deterministic SHA-256 entries for nested assets', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'worldforge-release-'));
    temporaryDirectories.push(directory);
    await mkdir(path.join(directory, 'linux'));
    await writeFile(path.join(directory, 'linux', 'worldforge.AppImage'), 'alpha', 'utf8');

    const assets = await collectReleaseAssets(directory);
    expect(assets).toEqual([
      {
        path: 'linux/worldforge.AppImage',
        bytes: 5,
        sha256: '8ed3f6ad685b959ead7022518e1af76cd816f8e8ec7ccdda1ed4018e8f2223f8',
      },
    ]);
    expect(renderChecksums(assets)).toBe(
      '8ed3f6ad685b959ead7022518e1af76cd816f8e8ec7ccdda1ed4018e8f2223f8  linux/worldforge.AppImage\n',
    );
  });
});
