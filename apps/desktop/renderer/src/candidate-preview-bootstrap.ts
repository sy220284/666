import { setupCandidatePreviewUi } from './candidate-preview-ui.js';

async function activeContext(): Promise<{
  readonly projectId: string;
  readonly chapterId: string;
} | null> {
  const active = await window.worldforge.project.getActive();
  const chapterId = document.querySelector<HTMLElement>(
    '.chapter-node.is-active',
  )?.dataset.chapterId;
  if (!active.ok || !active.data || !chapterId) return null;
  return { projectId: active.data.projectId, chapterId };
}

setupCandidatePreviewUi({ context: activeContext });

export const candidatePreviewRendererLayer = {
  name: '@worldforge/renderer-candidate-preview',
  responsibility: 'read-only-candidate-diff-review',
} as const;
