import type { ConstraintPackage, ConstraintPriority } from '@worldforge/contracts';

const priorities: readonly ConstraintPriority[] = ['P0', 'P1', 'P2', 'P3', 'P4'];

export function serializeConstraintPackage(value: ConstraintPackage): string {
  const lines = [
    `constraintHash: ${value.constraintHash}`,
    `contentHash: ${value.contentHash}`,
    `snapshotSource: ${value.snapshotSource}`,
    `estimatedTokens: ${value.estimatedTokens}/${value.budget.usableTokens}`,
  ];
  for (const priority of priorities) {
    lines.push('', `## ${priority}`);
    const sources = value.sections[priority];
    if (sources.length === 0) {
      lines.push('- （无）');
      continue;
    }
    for (const source of sources) {
      lines.push(
        `- [${source.sourceType}] ${source.label}`,
        `  source: ${source.sourceId}`,
        `  semanticKey: ${source.semanticKey}`,
        `  content: ${source.content}`,
      );
    }
  }
  if (value.conflicts.length > 0) {
    lines.push('', '## conflicts');
    for (const conflict of value.conflicts) {
      lines.push(`- ${conflict.semanticKey}: ${conflict.sourceIds.join(', ')}`);
    }
  }
  if (value.trimLog.length > 0) {
    lines.push('', '## trimLog');
    for (const entry of value.trimLog) {
      lines.push(`- ${entry.priority} ${entry.sourceId}: -${entry.estimatedTokens} tokens`);
    }
  }
  return `${lines.join('\n')}\n`;
}
