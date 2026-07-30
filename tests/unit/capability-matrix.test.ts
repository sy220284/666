import { describe, expect, it } from 'vitest';

import type { CoreStatus, ProjectWorkspaceSummary } from '@worldforge/contracts';

import { deriveCapabilityMatrix } from '../../apps/desktop/renderer/src/runtime/capability-matrix.js';

const healthyCore: CoreStatus = {
  status: 'healthy',
  protocolVersion: 1,
  pid: 1,
  startedAt: '2026-07-30T00:00:00.000Z',
};

function project(
  overrides: Partial<ProjectWorkspaceSummary> = {},
): ProjectWorkspaceSummary {
  return {
    projectId: '00000000-0000-4000-8000-000000000001',
    name: '测试作品',
    channel: '男频',
    workspacePath: '/tmp/worldforge-test',
    schemaVersion: 1,
    databaseMode: 'read-write',
    compatibility: 'current',
    readOnlyReason: null,
    createdAt: '2026-07-30T00:00:00.000Z',
    ...overrides,
  };
}

describe('application and project capability matrix', () => {
  it('enables the complete author workflow for a healthy writable project', () => {
    const matrix = deriveCapabilityMatrix({
      hydrated: true,
      coreStatus: healthyCore,
      project: project(),
      providerCount: 1,
      verifiedProviderCount: 1,
    });

    expect(matrix.application).toMatchObject({
      shellAvailable: true,
      coreAvailable: true,
      generationAvailable: true,
    });
    expect(matrix.project).toMatchObject({
      mode: 'normal',
      draftWritable: true,
      canonWritable: true,
      backupAvailable: true,
      moveAvailable: true,
    });
    expect(matrix.navigation).toEqual({
      home: true,
      planning: true,
      writing: true,
      canon: true,
      checks: true,
      settings: true,
    });
  });

  it('keeps browsing and export available for a compatible future-schema project', () => {
    const matrix = deriveCapabilityMatrix({
      hydrated: true,
      coreStatus: healthyCore,
      project: project({
        databaseMode: 'read-only',
        compatibility: 'future-schema',
        readOnlyReason: 'future-schema',
      }),
      providerCount: 0,
      verifiedProviderCount: 0,
    });

    expect(matrix.project).toMatchObject({
      mode: 'read-only-compatible',
      projectReadable: true,
      draftReadable: true,
      draftWritable: false,
      exportAvailable: true,
      restoreAvailable: true,
      moveAvailable: false,
    });
    expect(matrix.navigation.writing).toBe(true);
  });

  it.each(['integrity-failed', 'checksum-mismatch', 'migration-failed'] as const)(
    'limits %s projects to recovery and safe export',
    (compatibility) => {
      const matrix = deriveCapabilityMatrix({
        hydrated: true,
        coreStatus: healthyCore,
        project: project({
          databaseMode: 'read-only',
          compatibility,
          readOnlyReason: compatibility,
        }),
        providerCount: 1,
        verifiedProviderCount: 1,
      });

      expect(matrix.project.projectReadable).toBe(false);
      expect(matrix.project.exportAvailable).toBe(true);
      expect(matrix.project.restoreAvailable).toBe(true);
      expect(matrix.project.draftReadable).toBe(false);
      expect(matrix.navigation).toMatchObject({
        planning: false,
        writing: false,
        canon: false,
        checks: false,
      });
    },
  );

  it('blocks project capabilities while the local service is unavailable', () => {
    const matrix = deriveCapabilityMatrix({
      hydrated: true,
      coreStatus: { ...healthyCore, status: 'degraded' },
      project: project(),
      providerCount: 1,
      verifiedProviderCount: 1,
    });

    expect(matrix.application.coreAvailable).toBe(false);
    expect(matrix.application.generationAvailable).toBe(false);
    expect(matrix.project.mode).toBe('closed');
    expect(matrix.navigation).toEqual({
      home: true,
      planning: false,
      writing: false,
      canon: false,
      checks: false,
      settings: true,
    });
  });
});
