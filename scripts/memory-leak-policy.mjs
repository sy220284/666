function finiteNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number.`);
  }
  return value;
}

function nonNegativeNumber(value, label) {
  const numeric = finiteNumber(value, label);
  if (numeric < 0) throw new RangeError(`${label} must be non-negative.`);
  return numeric;
}

export function summarizeMemorySeries(samples) {
  if (!Array.isArray(samples) || samples.length < 2) {
    throw new TypeError('At least two post-GC memory samples are required.');
  }

  const normalized = samples.map((sample, index) => ({
    operations: nonNegativeNumber(sample.operations, `samples[${index}].operations`),
    heapUsedBytes: nonNegativeNumber(sample.heapUsedBytes, `samples[${index}].heapUsedBytes`),
  }));
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index].operations <= normalized[index - 1].operations) {
      throw new RangeError('Memory sample operation counts must increase strictly.');
    }
  }

  const first = normalized[0];
  const last = normalized.at(-1);
  const count = normalized.length;
  const meanX = normalized.reduce((total, sample) => total + sample.operations, 0) / count;
  const meanY = normalized.reduce((total, sample) => total + sample.heapUsedBytes, 0) / count;
  let numerator = 0;
  let denominator = 0;
  for (const sample of normalized) {
    const x = sample.operations - meanX;
    numerator += x * (sample.heapUsedBytes - meanY);
    denominator += x * x;
  }
  if (denominator === 0)
    throw new RangeError('Memory sample operation counts cannot be identical.');

  const heapValues = normalized.map((sample) => sample.heapUsedBytes);
  return {
    sampleCount: count,
    baselineHeapUsedBytes: first.heapUsedBytes,
    finalHeapUsedBytes: last.heapUsedBytes,
    finalGrowthBytes: last.heapUsedBytes - first.heapUsedBytes,
    peakGrowthBytes: Math.max(...heapValues) - first.heapUsedBytes,
    tailSpreadBytes: Math.max(...heapValues) - Math.min(...heapValues),
    slopeBytesPerOperation: numerator / denominator,
  };
}

export function evaluateMemoryBudget(summary, budget) {
  if (budget === null || budget === undefined) {
    return {
      passed: false,
      calibrated: false,
      violations: ['MEMORY_BUDGET_PENDING'],
    };
  }

  const limits = {
    maxFinalGrowthBytes: nonNegativeNumber(budget.maxFinalGrowthBytes, 'maxFinalGrowthBytes'),
    maxPeakGrowthBytes: nonNegativeNumber(budget.maxPeakGrowthBytes, 'maxPeakGrowthBytes'),
    maxTailSpreadBytes: nonNegativeNumber(budget.maxTailSpreadBytes, 'maxTailSpreadBytes'),
    maxPositiveSlopeBytesPerOperation: nonNegativeNumber(
      budget.maxPositiveSlopeBytesPerOperation,
      'maxPositiveSlopeBytesPerOperation',
    ),
  };
  const violations = [];
  if (summary.finalGrowthBytes > limits.maxFinalGrowthBytes) violations.push('FINAL_GROWTH');
  if (summary.peakGrowthBytes > limits.maxPeakGrowthBytes) violations.push('PEAK_GROWTH');
  if (summary.tailSpreadBytes > limits.maxTailSpreadBytes) violations.push('TAIL_SPREAD');
  if (Math.max(0, summary.slopeBytesPerOperation) > limits.maxPositiveSlopeBytesPerOperation) {
    violations.push('POSITIVE_SLOPE');
  }
  return {
    passed: violations.length === 0,
    calibrated: true,
    violations,
  };
}
