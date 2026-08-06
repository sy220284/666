import { describe, expect, it, vi } from 'vitest';

import { RecoveryServiceError } from '../../packages/core-service/src/recovery/backup-manifest.js';
import {
  rethrowRecoveryFailure,
  settleRecoveryCompensation,
} from '../../packages/core-service/src/recovery/recovery-compensation.js';

describe('M10-12 Recovery补偿收敛', () => {
  it('单个清理失败不会阻断其余补偿动作', async () => {
    const first = vi.fn(() => Promise.reject(new Error('first-cleanup-failed')));
    const second = vi.fn(() => Promise.resolve());
    const third = vi.fn(() => Promise.reject(new Error('third-cleanup-failed')));

    const failures = await settleRecoveryCompensation([
      { label: 'first-artifact', run: first },
      { label: 'second-artifact', run: second },
      { label: 'third-artifact', run: third },
    ]);

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    expect(third).toHaveBeenCalledOnce();
    expect(failures.map((failure) => failure.label)).toEqual(['first-artifact', 'third-artifact']);
  });

  it('补偿失败时保持原始Recovery错误码和作者消息', () => {
    const primary = new RecoveryServiceError(
      'BACKUP_VERIFY_FAILED',
      'The verified backup registration failed.',
    );

    expect(() =>
      rethrowRecoveryFailure(
        primary,
        [{ label: 'backup-final', error: new Error('permission denied') }],
        'BACKUP_CREATE_FAILED',
        'The operation checkpoint could not be created.',
      ),
    ).toThrowError(
      expect.objectContaining({
        code: 'BACKUP_VERIFY_FAILED',
        message: 'The verified backup registration failed.',
        cause: expect.any(AggregateError),
      }),
    );
  });

  it('无补偿失败时原样抛出原始Recovery错误', () => {
    const primary = new RecoveryServiceError('RESTORE_SOURCE_INVALID', 'Source is invalid.');

    try {
      rethrowRecoveryFailure(
        primary,
        [],
        'RESTORE_VERIFY_FAILED',
        'The restored copy failed verification.',
      );
    } catch (error) {
      expect(error).toBe(primary);
    }
  });
});
