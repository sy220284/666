import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('Preload capability surface', () => {
  it('exposes one named bridge without raw IPC or Node capabilities', async () => {
    const source = await readFile('apps/desktop/preload/src/index.ts', 'utf8');

    expect(source).toContain("contextBridge.exposeInMainWorld('worldforge', bridge)");
    expect(source).not.toContain('ipcRenderer.send');
    expect(source).not.toContain('ipcRenderer.on');
    expect(source).not.toContain("from 'node:fs'");
    expect(source).not.toContain('process.env');
    expect(source).not.toContain('database');
    expect(source).not.toMatch(/send\s*:\s*\(/);
  });
});
