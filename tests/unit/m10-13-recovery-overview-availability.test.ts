import { describe, expect, it, vi } from 'vitest';

import type { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { RecoveryService } from '../../packages/core-service/src/recovery/recovery-service.js';

describe('M10-13 Recovery overview availability', () => {
  it('propagates a writable database availability failure instead of returning empty collections', () => {
    const failure = new Error('project database unavailable');
    const readProject = vi.fn(() => {
      throw failure;
    });
    const service = new RecoveryService(
      {
        assertActiveProject: () => ({ projectId: 'project-a', databaseMode: 'read-write' }),
        readProject,
      } as unknown as ProjectWorkspaceService,
      { backupRootDirectory: '/tmp/worldforge-recovery-unavailable' },
    );

    expect(() => service.getOverview('project-a')).toThrow(failure);
    expect(readProject).toHaveBeenCalledTimes(1);
  });
});
