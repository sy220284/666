import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

function body(source: string, start: string, end: string): string {
  const startIndex = source.indexOf('async function ' + start + '(');
  const endIndex = source.indexOf('async function ' + end + '(', startIndex + 1);
  if (startIndex < 0 || endIndex < 0) throw new Error('Cannot locate ' + start + ' function');
  return source.slice(startIndex, endIndex);
}

describe('taskctl Schema 2 policy', () => {
  it('delegates through a module-relative canonical controller path', async () => {
    const source = await readFile('scripts/taskctl.mjs', 'utf8');
    expect(source).toContain(
      "new URL('../.github/governance/single-work-taskctl.mjs', import.meta.url)",
    );
    expect(source).toContain('fileURLToPath(');
    expect(source).toContain('[controllerPath, command, ...rest]');
    expect(source).not.toContain(
      "['.github/governance/single-work-taskctl.mjs', command, ...rest]",
    );
  });

  it('keeps the compatibility entry mutation-free and limits writes to mirror sync', async () => {
    const source = await readFile('.github/governance/single-work-taskctl.mjs', 'utf8');
    const syncBody = body(source, 'sync', 'rejectLegacyMutation');
    const rejectionBody = body(source, 'rejectLegacyMutation', 'main');

    expect(syncBody).toContain('writeFile(mirrorPath, renderCompatibilityMirror(');
    expect(rejectionBody).toContain('no longer mutates the legacy ACTIVE_TASK state machine');
    expect(rejectionBody).not.toContain('writeFile(');
    expect(source).not.toContain('recoverAtomicFileTransactions(');
    expect(source).not.toContain('writeFilesAtomically(');
  });
});
