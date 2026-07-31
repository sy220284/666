import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('application shell capability actions', () => {
  it('uses the shared capability matrix for navigation and project actions', async () => {
    const shell = await readFile('apps/desktop/renderer/src/app/app-shell-m3.tsx', 'utf8');
    const home = await readFile('apps/desktop/renderer/src/features/home/home-page.tsx', 'utf8');
    expect(shell).toContain('const capabilities = useMemo');
    expect(shell).toContain('const availability = capabilities.navigation');
    expect(shell).toContain('projectCapabilities={capabilities.project}');
    expect(shell).toContain('!capabilities.project.moveAvailable');
    expect(home).toContain('!projectCapabilities.draftReadable');
    expect(home).toContain('!projectCapabilities.structureReadable');
    expect(home).toContain('!projectCapabilities.canonReadable');
  });

  it('flushes the active draft before a settings-triggered Core restart', async () => {
    const shell = await readFile('apps/desktop/renderer/src/app/app-shell-m3.tsx', 'utf8');
    const restart = shell.indexOf('const restartCore = async');
    const flush = shell.indexOf('if (!(await flushWriting()))', restart);
    const bridge = shell.indexOf('await bridge.app.restartCore()', restart);
    expect(flush).toBeGreaterThan(restart);
    expect(bridge).toBeGreaterThan(flush);
  });
});
