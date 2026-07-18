import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('M2-03 Preview Renderer entry', () => {
  it('loads the read-only Candidate review surface from the composed entry', async () => {
    const [entry, bootstrap, ui] = await Promise.all([
      readFile('apps/desktop/renderer/src/entry.ts', 'utf8'),
      readFile('apps/desktop/renderer/src/candidate-preview-bootstrap.ts', 'utf8'),
      readFile('apps/desktop/renderer/src/candidate-preview-ui.ts', 'utf8'),
    ]);
    expect(entry).toContain("import './candidate-preview-bootstrap.js'");
    expect(bootstrap).toContain('setupCandidatePreviewUi');
    expect(ui).toContain('window.worldforgeCandidatePreview.preview');
    expect(ui).toContain('不会写入项目数据库');
  });
});
