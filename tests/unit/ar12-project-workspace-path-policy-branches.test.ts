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

    expect(isPermissionFailure(Object.assign(new Error('read-only'), { code: 'EROFS' }))).toBe(
      true,
    );
    expect(isPermissionFailure(new Error('other'))).toBe(false);
    expect(isPermissionFailure({ code: 'EACCES' })).toBe(false);
  });

  it('rejects unsafe workspace names and preserves safe names', () => {
    for (const name of ['', '.', '..', 'bad.', 'bad?', `bad${String.fromCharCode(1)}`]) {
      expect(() => validWorkspaceName(name)).toThrow(ProjectWorkspaceError);
    }

    expect(validWorkspaceName('safe-project')).toBe('safe-project.worldforge');
    expect(validWorkspaceName(' safe-project ')).toBe('safe-project.worldforge');
  });

  it('bounds UTF-8 workspace directory names and avoids Windows device names', () => {
    const longName = '界'.repeat(240);
    const workspaceName = validWorkspaceName(longName);
    const stagingName = `.${workspaceName}.create-${'0'.repeat(36)}`;

    expect(Buffer.byteLength(workspaceName, 'utf8')).toBeLessThanOrEqual(200);
    expect(Buffer.byteLength(stagingName, 'utf8')).toBeLessThanOrEqual(255);
    expect(workspaceName).toMatch(/-[0-9a-f]{10}\.worldforge$/u);
    expect(validWorkspaceName(longName)).toBe(workspaceName);

    for (const deviceName of ['CON', 'NUL', 'PRN', 'AUX', 'COM1', 'LPT9', 'con.txt']) {
      expect(validWorkspaceName(deviceName)).toBe(`WorldForge-${deviceName}.worldforge`);
    }
  });
});
