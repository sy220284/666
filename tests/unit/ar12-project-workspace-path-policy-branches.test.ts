import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  isInside,
  isPermissionFailure,
  ProjectWorkspaceError,
  validWorkspaceName,
} from '../../packages/core-service/src/project-workspace/workspace-path-policy.js';

describe('AR-12 Project Workspace path-policy branches', () => {
  it('covers workspace root equality and permission failure variants', () => {
    const root = path.join(process.cwd(), 'ar12-workspace-root');

    expect(isInside(root, root)).toBe(true);
    expect(isInside(root, path.join(root, 'child'))).toBe(true);
    expect(isInside(root, path.dirname(root))).toBe(false);

    expect(
      isPermissionFailure(Object.assign(new Error('read-only'), { code: 'EROFS' })),
    ).toBe(true);
    expect(isPermissionFailure(new Error('other'))).toBe(false);
    expect(isPermissionFailure({ code: 'EACCES' })).toBe(false);
  });

  it('rejects unsafe workspace names and preserves safe names', () => {
    for (const name of ['.', '..', 'bad.', 'bad ', `bad${String.fromCharCode(1)}`]) {
      expect(() => validWorkspaceName(name)).toThrow(ProjectWorkspaceError);
    }

    expect(validWorkspaceName('safe-project')).toBe('safe-project.worldforge');
  });
});
