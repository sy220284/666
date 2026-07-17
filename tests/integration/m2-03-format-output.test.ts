import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('M2-03 Candidate bridge surface', () => {
  it('keeps Candidate commands on the typed preload bridge', async () => {
    const preload = await readFile('apps/desktop/preload/src/index.ts', 'utf8');
    const rendererTypes = await readFile('apps/desktop/renderer/src/global.d.ts', 'utf8');

    expect(preload).toContain('CANDIDATE_IPC_CHANNELS.createFixtureCandidate');
    expect(preload).toContain('CandidateCreateFixtureCommandSchema.parse');
    expect(rendererTypes).toContain('RendererCandidateBridge');
    expect(rendererTypes).not.toContain('ipcRenderer');
    expect(rendererTypes).not.toContain('invoke(channel');
  });
});
