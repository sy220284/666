import { describe, expect, it } from 'vitest';

import {
  trustedGovernancePathErrors,
  validateTaskAuthorizationDocuments,
  validateTrustedBoundary,
} from '../../.github/governance/trusted-pr-policy.mjs';

const baseSha = 'a'.repeat(40);
const baseRuntime = {
  schemaVersion: 2,
  id: 'M10-22',
  status: 'PLANNED',
  executionBranch: 'work',
  source: 'docs/tasks/M10/M10-22.md',
  priority: 'P0',
  dependencies: ['M10-21'],
  baseline: { main: baseSha, work: baseSha },
  allowedPaths: ['apps/desktop/'],
  forbiddenPaths: ['packages/contracts/'],
  verification: ['pnpm test'],
};

describe('可信base侧PR授权策略', () => {
  it('拒绝通过Head Runtime扩张路径后修改越权文件', () => {
    const errors = validateTrustedBoundary({
      body: '<!-- worldforge-task: M10-22 -->',
      files: ['docs/tasks/runtime/M10-22.json', 'packages/contracts/src/index.ts'],
      baseRuntime,
      headRuntime: {
        ...baseRuntime,
        status: 'IMPLEMENTED',
        allowedPaths: ['apps/desktop/', 'packages/contracts/'],
        forbiddenPaths: [],
      },
      baseSha,
    });
    expect(errors).toContain('M10-22 runtime authorization changed: allowedPaths');
    expect(errors).toContain('M10-22 runtime authorization changed: forbiddenPaths');
    expect(errors).toContain('packages/contracts/src/index.ts: forbidden by M10-22');
  });

  it('拒绝没有main侧Runtime的新任务直接进入实现PR', () => {
    expect(
      validateTrustedBoundary({
        body: '<!-- worldforge-task: M10-22 -->',
        files: ['apps/desktop/renderer/src/index.ts'],
        baseRuntime: null,
        headRuntime: { ...baseRuntime, status: 'IMPLEMENTED' },
        baseSha,
      }),
    ).toContain('Task implementation requires a Runtime already authorized on main');
  });

  it('新任务授权PR只登记PLANNED范围，不允许夹带实现', () => {
    const files = [
      'docs/tasks/runtime/M10-22.json',
      'docs/tasks/M10/M10-22.md',
      'docs/tasks/TASK_INDEX.md',
    ];
    expect(
      validateTrustedBoundary({
        body: '<!-- worldforge-task-authorization: M10-22 -->',
        files,
        baseRuntime: null,
        headRuntime: baseRuntime,
        baseSha,
      }),
    ).toEqual([]);
    expect(
      validateTrustedBoundary({
        body: '<!-- worldforge-task-authorization: M10-22 -->',
        files: [...files, 'apps/desktop/renderer/src/index.ts'],
        baseRuntime: null,
        headRuntime: baseRuntime,
        baseSha,
      }),
    ).toContain(
      'apps/desktop/renderer/src/index.ts: task authorization PR may only change its task card, Runtime and index',
    );
  });

  it('可信治理PR仍受base侧固定路径约束', () => {
    expect(
      trustedGovernancePathErrors([
        '.github/governance/single-work-policy.mjs',
        'tests/unit/single-work-policy.test.ts',
      ]),
    ).toEqual([]);
    expect(trustedGovernancePathErrors(['packages/contracts/src/index.ts'])).toEqual([
      'packages/contracts/src/index.ts: governance PR changed a non-governance path',
    ]);
  });

  it('任务授权文档必须以Planned状态形成索引与任务卡闭环', () => {
    const index = `
| ID | 任务卡 | 依赖 | 状态 |
| --- | --- | --- | --- |
| M10-22 | [审计修复](M10/M10-22.md) | M10-21 | Planned |
`;
    expect(
      validateTaskAuthorizationDocuments(baseRuntime, index, '# M10-22\n\n> 状态：Planned\n'),
    ).toEqual([]);
    expect(
      validateTaskAuthorizationDocuments(baseRuntime, index, '> 状态：Implemented\n'),
    ).toContain('M10-22 task card must declare Planned');
  });
});
