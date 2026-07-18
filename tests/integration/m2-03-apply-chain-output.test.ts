import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('M2-03 Candidate action chain', () => {
  it('routes the validated Candidate action from IPC to Core', async () => {
    const [protocol, utility, ipc, preload, renderer] = await Promise.all([
      readFile('packages/contracts/src/candidate-preview-core.ts', 'utf8'),
      readFile('packages/core-service/src/utility-entry.ts', 'utf8'),
      readFile('apps/desktop/main/src/candidate-preview-ipc.ts', 'utf8'),
      readFile('apps/desktop/preload/src/entry.ts', 'utf8'),
      readFile('apps/desktop/renderer/src/candidate-apply-ui.ts', 'utf8'),
    ]);

    expect(protocol).toContain('CandidateApplyInputSchema');
    expect(protocol).toContain('CandidateApplyOutcomeSchema');
    expect(utility).toContain('case CANDIDATE_APPLY_COMMANDS.applyCandidate');
    expect(utility).toContain('await candidateApply.apply(requestId, operation.input)');
    expect(ipc).toContain('CandidateApplyCommandSchema.safeParse(raw)');
    expect(ipc).toContain('trustedSender(event, options.rendererUrl)');
    expect(preload).toContain('CandidateApplyCommandSchema.parse');
    expect(renderer).toContain('window.worldforgeCandidatePreview.apply');
  });

  it('keeps Undo unavailable until Phase 3', async () => {
    const [preload, renderer] = await Promise.all([
      readFile('apps/desktop/preload/src/entry.ts', 'utf8'),
      readFile('apps/desktop/renderer/src/candidate-apply-ui.ts', 'utf8'),
    ]);
    expect(preload).not.toContain('undoApply');
    expect(renderer).not.toContain('撤销采用');
  });
});
