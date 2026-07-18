import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

async function source(path: string): Promise<string> {
  return readFile(path, 'utf8');
}

describe('M2-03 Candidate Preview desktop chain', () => {
  it('connects the strict Preview operation across all desktop boundaries', async () => {
    const [contracts, utility, mainIpc, mainEntry, preloadEntry, rendererEntry, rendererUi] =
      await Promise.all([
        source('packages/contracts/src/candidate-preview-core.ts'),
        source('packages/core-service/src/utility-entry.ts'),
        source('apps/desktop/main/src/candidate-preview-ipc.ts'),
        source('apps/desktop/main/src/electron-main.ts'),
        source('apps/desktop/preload/src/entry.ts'),
        source('apps/desktop/renderer/src/entry.ts'),
        source('apps/desktop/renderer/src/candidate-preview-ui.ts'),
      ]);

    expect(contracts).toContain('CANDIDATE_APPLY_COMMANDS.previewCandidate');
    expect(utility).toContain('case CANDIDATE_APPLY_COMMANDS.previewCandidate');
    expect(utility).toContain('candidateApply.preview(operation.input)');
    expect(mainIpc).toContain('CandidatePreviewCommandSchema.safeParse(raw)');
    expect(mainIpc).toContain('trustedSender(event, options.rendererUrl)');
    expect(mainEntry).toContain('registerCandidatePreviewIpc');
    expect(preloadEntry).toContain("exposeInMainWorld('worldforgeCandidatePreview'");
    expect(rendererEntry).toContain("import './candidate-preview-bootstrap.js'");
    expect(rendererUi).toContain('window.worldforgeCandidatePreview.preview');
  });

  it('keeps the Phase 1 review surface read-only', async () => {
    const [preloadEntry, rendererUi] = await Promise.all([
      source('apps/desktop/preload/src/entry.ts'),
      source('apps/desktop/renderer/src/candidate-preview-ui.ts'),
    ]);

    expect(preloadEntry).not.toContain('applyCandidate');
    expect(preloadEntry).not.toContain('undoApply');
    expect(rendererUi).not.toContain('候选采用');
    expect(rendererUi).not.toContain('撤销采用');
    expect(rendererUi).toContain('不会写入项目数据库');
    expect(rendererUi).toContain('不完整建议稿');
  });
});
