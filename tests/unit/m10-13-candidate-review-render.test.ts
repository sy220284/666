import { createRequire } from 'node:module';

import { describe, expect, it, vi } from 'vitest';

import type { Chapter, DraftDocument, ProjectWorkspaceSummary } from '@worldforge/contracts';
import type { createElement as createReactElement } from 'react';
import type { renderToStaticMarkup as renderReactToStaticMarkup } from 'react-dom/server';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { CandidateReviewPanel } from '../../apps/desktop/renderer/src/features/writing/candidate-review-panel.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const rendererRequire = createRequire(
  new URL('../../apps/desktop/renderer/package.json', import.meta.url),
);
const { createElement } = rendererRequire('react') as {
  readonly createElement: typeof createReactElement;
};
const { renderToStaticMarkup } = rendererRequire('react-dom/server') as {
  readonly renderToStaticMarkup: typeof renderReactToStaticMarkup;
};

describe('M10-13 Candidate工作台渲染边界', () => {
  it('按项目章节上下文组装只读初始界面且不触发异步副作用', () => {
    const bridge = contractInput<RendererBridgeAdapter>({});
    const flush = vi.fn(async () => true);
    const onDraftReplace = vi.fn();
    const onClose = vi.fn();
    const getRewriteSelectionAnchor = vi.fn(async () => null);

    const markup = renderToStaticMarkup(
      createElement(CandidateReviewPanel, {
        bridge,
        chapter: contractInput<Chapter>({ id: 'chapter-a' }),
        draft: contractInput<DraftDocument>({ draftId: 'draft-a', revision: 7 }),
        project: contractInput<ProjectWorkspaceSummary>({
          projectId: 'project-a',
          databaseMode: 'read-only',
        }),
        flush,
        onDraftReplace,
        onClose,
        getRewriteSelectionAnchor,
      }),
    );

    expect(markup).toContain('data-candidate-preview-dialog');
    expect(markup).toContain('AI创作与建议稿工作台');
    expect(markup).toContain('保存序号 7');
    expect(flush).not.toHaveBeenCalled();
    expect(onDraftReplace).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(getRewriteSelectionAnchor).not.toHaveBeenCalled();
  });
});
