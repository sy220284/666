import { DatabaseSync } from 'node:sqlite';

import { describe, expect, it, vi } from 'vitest';

import {
  initializeProjectStructure,
  readStructure,
} from '../../packages/core-service/src/project-structure.js';
import type { ProjectStructureError } from '../../packages/core-service/src/project-structure.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

function connectionWithVolumeOrder(orderKey: unknown): DatabaseSync {
  const projectId = '11111111-1111-4111-8111-111111111111';
  const volumeId = '22222222-2222-4222-8222-222222222222';
  const prepare = vi.fn((sql: string) =>
    contractInput({
      all: vi.fn(() =>
        sql.includes('FROM volumes')
          ? [
              {
                id: volumeId,
                project_id: projectId,
                title: '测试卷',
                order_key: orderKey,
                status: 'pending',
                deleted_at: null,
              },
            ]
          : [],
      ),
    }),
  );
  return contractInput<DatabaseSync>({ prepare });
}

describe('project structure defensive row coverage', () => {
  it('initializes starter rows when draft tables are absent', () => {
    const connection = new DatabaseSync(':memory:');
    try {
      connection.exec(`
        CREATE TABLE volumes(
          id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT NOT NULL,
          order_key INTEGER NOT NULL, status TEXT NOT NULL, deleted_at TEXT
        );
        CREATE TABLE chapters(
          id TEXT PRIMARY KEY, volume_id TEXT NOT NULL, title TEXT NOT NULL,
          order_key INTEGER NOT NULL, status TEXT NOT NULL,
          target_word_min INTEGER, target_word_max INTEGER, active_draft_id TEXT,
          final_version_id TEXT, deleted_at TEXT
        );
      `);
      const ids = ['33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'];
      const initialized = initializeProjectStructure(
        connection,
        '11111111-1111-4111-8111-111111111111',
        'starter',
        '2026-08-17T06:00:00.000Z',
        () => ids.shift()!,
      );
      expect(initialized).toEqual({
        volumeId: '33333333-3333-4333-8333-333333333333',
        chapterId: '44444444-4444-4444-8444-444444444444',
      });
    } finally {
      connection.close();
    }
  });
  it('normalizes a safe numeric order key from a database adapter', () => {
    const projectId = '11111111-1111-4111-8111-111111111111';
    expect(readStructure(connectionWithVolumeOrder(1024), projectId).volumes[0]?.orderKey).toBe(
      '1024',
    );
  });

  it('rejects a non-integer numeric order key from a database adapter', () => {
    const projectId = '11111111-1111-4111-8111-111111111111';
    expect(() => readStructure(connectionWithVolumeOrder(1.5), projectId)).toThrowError(
      expect.objectContaining<ProjectStructureError>({ code: 'STRUCTURE_CONFLICT' }),
    );
  });
});
