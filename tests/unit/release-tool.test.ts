import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  collectReleaseAssets,
  evaluateReleaseGate,
  parseReleaseVersion,
  RELEASE_HOLD_STATUS,
  renderChecksums,
  validateReleaseConfiguration,
} from '../../scripts/release-tool.mjs';

interface TaskIndexEntry {
  readonly id: string;
  readonly dependency: string;
  readonly status: string;
}

interface ActiveTaskOverrides {
  readonly activeStatus?: string;
  readonly activeId?: string;
  readonly holdTaskId?: string;
  readonly lastVerifiedTaskId?: string;
  readonly holdVerifiedTasks?: readonly string[];
  readonly deferredVerification?: readonly unknown[];
  readonly deferredTasks?: readonly unknown[];
  readonly finalTask?: boolean;
  readonly nextTaskId?: string | null;
  readonly commit?: string;
  readonly evidenceHead?: string;
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
  { id: 'M8-05', dependency: 'M8-04', status: 'Verified' },
] as const;

function activeTaskState(overrides: ActiveTaskOverrides = {}) {
  const activeId = overrides.activeId ?? 'M8-05';
  return {
    schemaVersion: 1,
    activeTask: {
      id: activeId,
      status: overrides.activeStatus ?? RELEASE_HOLD_STATUS,
    },
    lastVerifiedTask: {
      id: overrides.lastVerifiedTaskId ?? activeId,
      commit: overrides.commit ?? 'a'.repeat(40),
      evidenceHead: overrides.evidenceHead ?? 'b'.repeat(40),
    },
    deferredVerification: overrides.deferredVerification ?? [],
    deferredTasks: overrides.deferredTasks ?? [],
    verificationHold: {
      taskId: overrides.holdTaskId ?? activeId,
      verifiedTasks: overrides.holdVerifiedTasks ?? verifiedTasks.map((task) => task.id),
      finalTask: overrides.finalTask ?? true,
      nextTaskId: overrides.nextTaskId === undefined ? null : overrides.nextTaskId,
    },
  };
}

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

  it('validates the release workflow, package scripts and task-state source', () => {
    expect(
      validateReleaseConfiguration({
        packageJson,
        taskIndexMarkdown: taskIndex(verifiedTasks),
        activeTaskState: activeTaskState(),
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
      activeTaskState: activeTaskState(),
      packageVersion: '1.0.0',
      requestedVersion: '1.0.0',
      refName: 'main',
    });

    expect(result.errors).toEqual([]);
  });

  it('blocks publishing when a later independent task is not Verified', () => {
    const result = evaluateReleaseGate({
      taskIndexMarkdown: taskIndex([
        verifiedTasks[0],
        verifiedTasks[1],
        { id: 'M8-05', dependency: 'M8-04', status: 'Implemented' },
      ]),
      activeTaskState: activeTaskState({ activeStatus: 'IMPLEMENTED' }),
      packageVersion: '1.0.0',
      requestedVersion: '1.0.1',
      refName: 'feature',
    });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        'Requested version 1.0.1 does not match package.json version 1.0.0',
        'Releases may only run from main, found feature',
        'All independent tasks must be Verified before publishing: M8-05 Implemented',
        'ACTIVE_TASK must be VERIFIED_HOLD before publishing, found IMPLEMENTED',
      ]),
    );
  });

  it('blocks publishing while deferred work remains', () => {
    const result = evaluateReleaseGate({
      taskIndexMarkdown: taskIndex(verifiedTasks),
      activeTaskState: activeTaskState({
        deferredVerification: [{ id: 'M8-05' }],
        deferredTasks: [{ id: 'M8-06' }],
      }),
      packageVersion: '1.0.0',
      requestedVersion: '1.0.0',
      refName: 'main',
    });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        'deferredVerification must be empty before publishing',
        'deferredTasks must be empty before publishing',
      ]),
    );
  });

  it('blocks inconsistent final hold state and incomplete verified-task coverage', () => {
    const result = evaluateReleaseGate({
      taskIndexMarkdown: taskIndex(verifiedTasks),
      activeTaskState: activeTaskState({
        holdTaskId: 'M8-04',
        lastVerifiedTaskId: 'M8-04',
        holdVerifiedTasks: ['M8-02', 'M8-04', 'M8-99'],
        finalTask: false,
        nextTaskId: 'M8-06',
      }),
      packageVersion: '1.0.0',
      requestedVersion: '1.0.0',
      refName: 'main',
    });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        'verificationHold.taskId must match activeTask.id',
        'verificationHold must be final with nextTaskId=null',
        'verificationHold.verifiedTasks must exactly match TASK_INDEX; missing M8-05; extra M8-99',
        'lastVerifiedTask.id must match the final verification hold task',
      ]),
    );
  });

  it('blocks publishing when verified commits are not reachable', () => {
    const result = evaluateReleaseGate({
      taskIndexMarkdown: taskIndex(verifiedTasks),
      activeTaskState: activeTaskState(),
      packageVersion: '1.0.0',
      requestedVersion: '1.0.0',
      refName: 'main',
      verifiedCommitReachable: false,
      evidenceHeadReachable: false,
    });

    expect(result.errors).toEqual([
      'lastVerifiedTask.commit is not reachable from the release commit',
      'lastVerifiedTask.evidenceHead is not reachable from the release commit',
    ]);
  });

  it('allows publishing only from a complete final verification hold', () => {
    const result = evaluateReleaseGate({
      taskIndexMarkdown: taskIndex(verifiedTasks),
      activeTaskState: activeTaskState(),
      packageVersion: '1.0.0',
      requestedVersion: '1.0.0',
      refName: 'main',
      verifiedCommitReachable: true,
      evidenceHeadReachable: true,
    });

    expect(result).toMatchObject({
      version: '1.0.0',
      taskId: 'M8-05',
      taskStatus: RELEASE_HOLD_STATUS,
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
