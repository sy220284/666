import { describe, expect, it, vi } from 'vitest';

import type { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { RecoveryService } from '../../packages/core-service/src/recovery/recovery-service.js';

describe('M10-13 Recovery overview availability', () => {
  it('propagates a database availability failure instead of returning empty collections', async () => {
    const failure = new Error('project database unavailable');
    const readProject = vi.fn(() => {
      throw failure;
    });
    const service = new RecoveryService({ readProject } as unknown as ProjectWorkspaceService, {
      backupRootDirectory: '/tmp/worldforge-recovery-unavailable',
    });

    await expect(service.getOverview('project-a')).rejects.toBe(failure);
    expect(readProject).toHaveBeenCalledTimes(1);
  });
});
