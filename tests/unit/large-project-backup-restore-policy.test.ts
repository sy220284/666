import { describe, expect, it } from 'vitest';

import {
  evaluateBackupRestoreBudget,
  summarizeBackupRestoreSamples,
} from '../../scripts/large-project-backup-restore-policy.mjs';

describe('large-project backup/restore performance policy', () => {
  it('summarizes latency, size and throughput deterministically', () => {
    const summary = summarizeBackupRestoreSamples([
      { backupMs: 100, restoreMs: 200, sizeBytes: 10 * 1024 * 1024 },
      { backupMs: 120, restoreMs: 240, sizeBytes: 10 * 1024 * 1024 },
      { backupMs: 110, restoreMs: 220, sizeBytes: 10 * 1024 * 1024 },
    ]);

    expect(summary.sampleCount).toBe(3);
    expect(summary.backupP50Ms).toBe(110);
    expect(summary.backupP95Ms).toBe(120);
    expect(summary.restoreP50Ms).toBe(220);
    expect(summary.restoreP95Ms).toBe(240);
    expect(summary.backupSizeP50Bytes).toBe(10 * 1024 * 1024);
    expect(summary.backupThroughputP50MiBPerSecond).toBeGreaterThan(0);
    expect(summary.restoreThroughputP50MiBPerSecond).toBeGreaterThan(0);
  });

  it('fails closed while calibration is pending', () => {
    const summary = summarizeBackupRestoreSamples([
      { backupMs: 100, restoreMs: 200, sizeBytes: 1024 },
      { backupMs: 110, restoreMs: 210, sizeBytes: 1024 },
      { backupMs: 120, restoreMs: 220, sizeBytes: 1024 },
    ]);

    expect(evaluateBackupRestoreBudget(summary, null)).toEqual({
      passed: false,
      calibrated: false,
      violations: ['BACKUP_RESTORE_BUDGET_PENDING'],
    });
  });

  it('enforces backup and restore P95 independently', () => {
    const summary = summarizeBackupRestoreSamples([
      { backupMs: 100, restoreMs: 200, sizeBytes: 1024 },
      { backupMs: 110, restoreMs: 210, sizeBytes: 1024 },
      { backupMs: 120, restoreMs: 220, sizeBytes: 1024 },
    ]);

    expect(
      evaluateBackupRestoreBudget(summary, {
        maxBackupP95Ms: 115,
        maxRestoreP95Ms: 215,
      }),
    ).toEqual({
      passed: false,
      calibrated: true,
      violations: ['BACKUP_P95', 'RESTORE_P95'],
    });
  });

  it('accepts a calibrated bounded result', () => {
    const summary = summarizeBackupRestoreSamples([
      { backupMs: 100, restoreMs: 200, sizeBytes: 1024 },
      { backupMs: 110, restoreMs: 210, sizeBytes: 1024 },
      { backupMs: 120, restoreMs: 220, sizeBytes: 1024 },
    ]);

    expect(
      evaluateBackupRestoreBudget(summary, {
        maxBackupP95Ms: 150,
        maxRestoreP95Ms: 300,
      }),
    ).toEqual({ passed: true, calibrated: true, violations: [] });
  });

  it('rejects undersampled or non-positive measurements', () => {
    expect(() =>
      summarizeBackupRestoreSamples([
        { backupMs: 100, restoreMs: 200, sizeBytes: 1024 },
        { backupMs: 110, restoreMs: 210, sizeBytes: 1024 },
      ]),
    ).toThrow(/At least three/);
    expect(() =>
      summarizeBackupRestoreSamples([
        { backupMs: 0, restoreMs: 200, sizeBytes: 1024 },
        { backupMs: 110, restoreMs: 210, sizeBytes: 1024 },
        { backupMs: 120, restoreMs: 220, sizeBytes: 1024 },
      ]),
    ).toThrow(/positive/);
  });
});
