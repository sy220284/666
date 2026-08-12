function finiteNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number.`);
  }
  return value;
}

function positiveNumber(value, label) {
  const numeric = finiteNumber(value, label);
  if (numeric <= 0) throw new RangeError(`${label} must be positive.`);
  return numeric;
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

export function summarizeBackupRestoreSamples(samples) {
  if (!Array.isArray(samples) || samples.length < 3) {
    throw new TypeError('At least three backup/restore samples are required.');
  }

  const normalized = samples.map((sample, index) => ({
    backupMs: positiveNumber(sample.backupMs, `samples[${index}].backupMs`),
    restoreMs: positiveNumber(sample.restoreMs, `samples[${index}].restoreMs`),
    sizeBytes: positiveNumber(sample.sizeBytes, `samples[${index}].sizeBytes`),
  }));
  const backupMs = normalized.map((sample) => sample.backupMs);
  const restoreMs = normalized.map((sample) => sample.restoreMs);
  const sizeBytes = normalized.map((sample) => sample.sizeBytes);
  const backupThroughput = normalized.map(
    (sample) => sample.sizeBytes / (1024 * 1024) / (sample.backupMs / 1000),
  );
  const restoreThroughput = normalized.map(
    (sample) => sample.sizeBytes / (1024 * 1024) / (sample.restoreMs / 1000),
  );

  return {
    sampleCount: normalized.length,
    backupP50Ms: percentile(backupMs, 0.5),
    backupP95Ms: percentile(backupMs, 0.95),
    restoreP50Ms: percentile(restoreMs, 0.5),
    restoreP95Ms: percentile(restoreMs, 0.95),
    backupSizeP50Bytes: percentile(sizeBytes, 0.5),
    backupThroughputP50MiBPerSecond: percentile(backupThroughput, 0.5),
    restoreThroughputP50MiBPerSecond: percentile(restoreThroughput, 0.5),
  };
}

export function evaluateBackupRestoreBudget(summary, budget) {
  if (budget === null || budget === undefined) {
    return {
      passed: false,
      calibrated: false,
      violations: ['BACKUP_RESTORE_BUDGET_PENDING'],
    };
  }

  const limits = {
    maxBackupP95Ms: positiveNumber(budget.maxBackupP95Ms, 'maxBackupP95Ms'),
    maxRestoreP95Ms: positiveNumber(budget.maxRestoreP95Ms, 'maxRestoreP95Ms'),
  };
  const violations = [];
  if (summary.backupP95Ms > limits.maxBackupP95Ms) violations.push('BACKUP_P95');
  if (summary.restoreP95Ms > limits.maxRestoreP95Ms) violations.push('RESTORE_P95');
  return {
    passed: violations.length === 0,
    calibrated: true,
    violations,
  };
}
