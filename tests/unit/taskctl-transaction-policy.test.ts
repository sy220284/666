import { access, readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('taskctl Schema 2 policy', () => {
  it('keeps the legacy compatibility entry deleted', async () => {
    await expect(access('scripts/taskctl.mjs')).rejects.toThrow();
  });

  it('keeps the canonical controller read-only and rejects retired mutations', async () => {
    const source = await readFile('.github/governance/single-work-taskctl.mjs', 'utf8');

    expect(source).toContain(
      "const authorizationPath = path.join(root, 'docs/tasks/TASK_AUTHORIZATION.json')",
    );
    expect(source).toContain("command === 'validate'");
    expect(source).toContain("command === 'status'");
    expect(source).toContain('is not supported');
    expect(source).not.toContain('ACTIVE_TASK');
    expect(source).not.toContain('writeFile(');
    expect(source).not.toContain('renderCompatibilityMirror');
    expect(source).not.toContain('recoverAtomicFileTransactions(');
    expect(source).not.toContain('writeFilesAtomically(');
  });
});
