import { describe, expect, it } from 'vitest';

import {
  isPathInside,
  dependenciesSatisfied,
  extractBacktickBullets,
  findNextReadyTask,
  parseTaskIndex,
  replaceTaskCardStatus,
  replaceTaskIndexStatus,
  validateActiveState,
  validateChangedPaths,
  validateChangedPathsForTransition,
} from '../../scripts/task-control-lib.mjs';

const indexFixture = `
| ID | 任务卡 | 依赖 | 状态 |
|---|---|---|---|
| M0-01 | [Monorepo](M0/M0-01_MONOREPO_QUALITY_CI.md) | 无 | In Progress |
| M0-02 | [Electron](M0/M0-02_ELECTRON_CORE_LIFECYCLE.md) | M0-01 | Planned |
`;

describe('task control', () => {
  it('normalizes task card status lines with or without Markdown trailing spaces', () => {
    expect(replaceTaskCardStatus('> 状态：Planned\n', 'Planned', 'In Progress')).toBe(
      '> 状态：In Progress  \n',
    );
    expect(replaceTaskCardStatus('> 状态：In Progress  \n', 'In Progress', 'Planned')).toBe(
      '> 状态：Planned  \n',
    );
    expect(
      replaceTaskCardStatus('> 状态：Implemented（等待CI）\n', 'Implemented', 'Verified'),
    ).toBe('> 状态：Verified  \n');
  });

  it('parses task rows and their canonical source', () => {
    const tasks = parseTaskIndex(indexFixture);
    expect(tasks.get('M0-01')).toMatchObject({
      source: 'docs/tasks/M0/M0-01_MONOREPO_QUALITY_CI.md',
      status: 'In Progress',
    });
  });

  it('uses directory-aware path rules', () => {
    expect(isPathInside('packages/domain/src/index.ts', 'packages/')).toBe(true);
    expect(isPathInside('package.json', 'package.json')).toBe(true);
    expect(isPathInside('package-lock.json', 'package.json')).toBe(false);
  });

  it('reports forbidden and out-of-scope changes', () => {
    expect(
      validateChangedPaths(
        ['packages/domain/src/index.ts', 'docs/tasks/M1/example.md', 'random.txt'],
        ['packages/'],
        ['docs/tasks/M1/'],
      ),
    ).toEqual([
      'docs/tasks/M1/example.md: forbidden by active task',
      'random.txt: outside active task allowed paths',
    ]);
  });

  it('accepts paths from either side of an authorized task transition', () => {
    const state = {
      activeTask: { allowedPaths: ['packages/new/'], forbiddenPaths: [] },
    };
    const baseState = {
      activeTask: { allowedPaths: ['packages/previous/'], forbiddenPaths: [] },
    };
    expect(
      validateChangedPathsForTransition(
        ['packages/previous/index.ts', 'packages/new/index.ts'],
        state,
        baseState,
      ),
    ).toEqual([]);
    expect(validateChangedPathsForTransition(['outside.ts'], state, baseState)).toEqual([
      'outside.ts: outside active task allowed paths',
    ]);
  });

  it('accepts a valid continuous-mainline state', () => {
    const state = {
      schemaVersion: 1,
      authorization: { mode: 'continuous-mainline', branch: 'main' },
      activeTask: {
        id: 'M0-01',
        status: 'IN_PROGRESS',
        source: 'docs/tasks/M0/M0-01_MONOREPO_QUALITY_CI.md',
        allowedPaths: ['packages/'],
        verification: ['pnpm test'],
      },
    };
    expect(validateActiveState(state, parseTaskIndex(indexFixture))).toEqual([]);
  });

  it('accepts the author-approved implementation-mainline state', () => {
    const state = {
      schemaVersion: 1,
      authorization: {
        mode: 'implementation-mainline',
        branch: 'main',
        deferVerificationUntilBatch: true,
      },
      activeTask: {
        id: 'M0-01',
        status: 'IN_PROGRESS',
        source: 'docs/tasks/M0/M0-01_MONOREPO_QUALITY_CI.md',
        allowedPaths: ['packages/'],
        verification: ['pnpm test'],
      },
      deferredVerification: [],
    };
    expect(validateActiveState(state, parseTaskIndex(indexFixture))).toEqual([]);
  });

  it('keeps an implemented task active while remote verification is pending', () => {
    const implementedIndex = indexFixture.replace('In Progress', 'Implemented');
    const state = {
      schemaVersion: 1,
      authorization: { mode: 'continuous-mainline', branch: 'main' },
      activeTask: {
        id: 'M0-01',
        status: 'IMPLEMENTED',
        source: 'docs/tasks/M0/M0-01_MONOREPO_QUALITY_CI.md',
        allowedPaths: ['packages/'],
        verification: ['pnpm test'],
      },
    };
    expect(validateActiveState(state, parseTaskIndex(implementedIndex))).toEqual([]);
  });

  it('extracts task paths and advances only after dependencies verify', () => {
    const card = `## 必读文档\n\n- \`AGENTS.md\`\n\n## 主要影响范围\n\n- \`apps/\`\n- \`packages/\`\n`;
    expect(extractBacktickBullets(card, '必读文档')).toEqual(['AGENTS.md']);
    expect(extractBacktickBullets(card, '主要影响范围')).toEqual(['apps/', 'packages/']);

    const pending = parseTaskIndex(indexFixture);
    expect(dependenciesSatisfied(pending.get('M0-02')!, pending)).toBe(false);
    expect(findNextReadyTask(pending)?.id).toBeUndefined();

    const verified = parseTaskIndex(indexFixture.replace('In Progress', 'Verified'));
    expect(dependenciesSatisfied(verified.get('M0-02')!, verified)).toBe(true);
    expect(findNextReadyTask(verified)?.id).toBe('M0-02');
  });

  it('allows code-complete dependencies only when implementation-first mode opts in', () => {
    const implemented = parseTaskIndex(indexFixture.replace('In Progress', 'Implemented'));
    const next = implemented.get('M0-02')!;
    expect(dependenciesSatisfied(next, implemented)).toBe(false);
    expect(dependenciesSatisfied(next, implemented, { allowImplemented: true })).toBe(true);
    expect(findNextReadyTask(implemented, { allowImplemented: true })?.id).toBe('M0-02');
  });

  it('updates exactly one task index status', () => {
    expect(replaceTaskIndexStatus(indexFixture, 'M0-01', 'Verified')).toContain(
      '| M0-01 | [Monorepo](M0/M0-01_MONOREPO_QUALITY_CI.md) | 无 | Verified |',
    );
  });
});
