import { readFile } from 'node:fs/promises';

import { format } from 'prettier';
import { describe, expect, it } from 'vitest';

function replaceOnce(source: string, before: string, after: string): string {
  expect(source.split(before)).toHaveLength(2);
  return source.replace(before, after);
}

describe('M2-03 Preview renderer registration output', () => {
  it('emits the renderer with the minimal Preview surface attached', async () => {
    const path = 'apps/desktop/renderer/src/index.ts';
    let source = await readFile(path, 'utf8');
    source = replaceOnce(
      source,
      "import { contentWidthPixels, layoutPolicyForViewport } from './layout-model.js';",
      "import { setupCandidatePreviewUi } from './candidate-preview-ui.js';\nimport { contentWidthPixels, layoutPolicyForViewport } from './layout-model.js';",
    );
    source = replaceOnce(
      source,
      `Object.defineProperty(globalThis, 'worldforgeFlushDraft', {
  configurable: true,
  value: () => draftAutosave?.flush() ?? Promise.resolve(true),
});

const createVersionButton`,
      `Object.defineProperty(globalThis, 'worldforgeFlushDraft', {
  configurable: true,
  value: () => draftAutosave?.flush() ?? Promise.resolve(true),
});

setupCandidatePreviewUi({
  context: () =>
    activeProject && activeChapter
      ? { projectId: activeProject.projectId, chapterId: activeChapter.id }
      : null,
  flushDraft: () => draftAutosave?.flush() ?? Promise.resolve(true),
});

const createVersionButton`,
    );
    const output = await format(source, {
      filepath: path,
      printWidth: 100,
      singleQuote: true,
      trailingComma: 'all',
    });
    console.log(`M203_PREVIEW_RENDERER_BASE64=${Buffer.from(output).toString('base64')}`);
  });
});
