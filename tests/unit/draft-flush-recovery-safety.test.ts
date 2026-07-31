import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('draft flush failure recovery navigation', () => {
  it('requires a successful retry before leaving the writing route', async () => {
    const source = await readFile('apps/desktop/renderer/src/components/draft-flush-failure-dialog.tsx', 'utf8');
    const retry = source.indexOf('const saved = await flushRegisteredDraft()');
    const guard = source.indexOf('if (!saved)');
    const navigation = source.indexOf("dispatch({ type: 'navigate', route: 'recovery' })");
    expect(retry).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(retry);
    expect(navigation).toBeGreaterThan(guard);
  });
});
