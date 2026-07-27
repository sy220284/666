import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

function body(source: string, start: string, end: string): string {
  const startIndex = source.indexOf('async function ' + start + '(');
  const endIndex = source.indexOf('async function ' + end + '(', startIndex + 1);
  if (startIndex < 0 || endIndex < 0) throw new Error('Cannot locate ' + start + ' function');
  return source.slice(startIndex, endIndex);
}

describe('taskctl transaction policy', () => {
  it('routes every task-state mutation through recoverable transactions', async () => {
    const source = await readFile('scripts/taskctl.mjs', 'utf8');
    expect(source).toContain('recoverAtomicFileTransactions(taskTransactionJournalDirectory())');
    expect(source).toContain('writeFilesAtomically(');
    expect(source).not.toMatch(/\bwriteFile\s*\(/u);
    expect(source).not.toContain('Promise.all([\n    writeFile');
  });

  it('validates the next task before any transition transaction is committed', async () => {
    const source = await readFile('scripts/taskctl.mjs', 'utf8');
    for (const [name, end, failure] of [
      ['verifyTask', 'sync', 'No implementation-ready Planned task remains'],
      ['close', 'advanceImplementation', 'No dependency-ready Planned task remains'],
      ['advanceImplementation', 'main', 'No implementation-ready Planned task remains'],
    ] as const) {
      const functionBody = body(source, name, end);
      expect(functionBody.indexOf(failure)).toBeGreaterThanOrEqual(0);
      expect(functionBody.indexOf(failure)).toBeLessThan(
        functionBody.lastIndexOf('writeTaskStateTransaction'),
      );
    }
  });
});
