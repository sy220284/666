import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const sourcePath = 'apps/desktop/renderer/src/features/checks/checks-workbench.tsx';

describe('AI semantic-check generation polling', () => {
  it('waits for each getRun request before scheduling the next request', async () => {
    const source = await readFile(sourcePath, 'utf8');

    expect(source).not.toContain('window.setInterval');
    expect(source).toContain('const outcome = await bridge.generation.getRun');
    expect(source).toContain("{ mode: 'share' }");
    expect(source).toContain('window.setTimeout(() => void poll(), delay)');
    expect(source).toContain('if (!terminal) schedule(generationPollingDelay(failureCount))');
  });

  it('has bounded retry, cancellation cleanup and terminal refresh paths', async () => {
    const source = await readFile(sourcePath, 'utf8');

    expect(source).toContain('registerGenerationPollingFailure');
    expect(source).toContain('自动重试已停止');
    expect(source).toContain('if (timer !== null) window.clearTimeout(timer)');
    expect(source).toContain('TERMINAL_RUN_STATUSES.has(outcome.data.status)');
    expect(source).toContain('await refreshCatalog()');
    expect(source).toContain('catch {');
  });
});
