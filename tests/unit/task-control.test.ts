import { describe, expect, it } from 'vitest';

import {
  isPathInside,
  parseTaskIndex,
  validateActiveState,
  validateChangedPaths,
} from '../../scripts/task-control-lib.mjs';

const indexFixture = `
| ID | 任务卡 | 依赖 | 状态 |
|---|---|---|---|
| M0-01 | [Monorepo](M0/M0-01_MONOREPO_QUALITY_CI.md) | 无 | In Progress |
| M0-02 | [Electron](M0/M0-02_ELECTRON_CORE_LIFECYCLE.md) | M0-01 | Planned |
`;

describe('task control', () => {
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
});
