import { setupCandidateApplyUi } from './candidate-apply-ui.js';

async function activeContext(): Promise<{
  readonly projectId: string;
  readonly chapterId: string;
} | null> {
  const active = await window.worldforge.project.getActive();
  const chapterId =
    document.querySelector<HTMLElement>('.chapter-node.is-active')?.dataset.chapterId;
  if (!active.ok || !active.data || !chapterId) return null;
  return { projectId: active.data.projectId, chapterId };
}

setupCandidateApplyUi({ context: activeContext });

export const candidateApplyRendererLayer = {
  name: '@worldforge/renderer-candidate-apply',
  responsibility: 'candidate-apply-conflict-review',
} as const;
