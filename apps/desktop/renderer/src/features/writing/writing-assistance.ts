import type { StoryKnowledgeProjection } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';

type ChapterAssistProjection = Extract<StoryKnowledgeProjection, { readonly view: 'chapter_assist' }>;

export type WritingAssistanceGoal = NonNullable<ChapterAssistProjection['goal']>;
export type WritingAssistanceBeat = ChapterAssistProjection['sceneBeats'][number];
export type WritingAssistanceCharacter = ChapterAssistProjection['characters'][number];
export type WritingAssistanceForeshadowing = ChapterAssistProjection['foreshadowings'][number];

export interface WritingAssistancePreviousEnding {
  readonly chapterId: string;
  readonly chapterTitle: string;
  readonly text: string;
  readonly source: 'final-version' | 'current-draft';
}

export interface WritingAssistanceView {
  readonly chapterId: string;
  readonly chapterTitle: string;
  readonly goal: WritingAssistanceGoal | null;
  readonly sceneBeats: readonly WritingAssistanceBeat[];
  readonly characters: readonly WritingAssistanceCharacter[];
  readonly foreshadowings: readonly WritingAssistanceForeshadowing[];
  readonly todos: ChapterAssistProjection['todos'];
  readonly previousEnding: WritingAssistancePreviousEnding | null;
  readonly warnings: readonly string[];
}

function projectionView(
  projection: ChapterAssistProjection,
  previousEnding: WritingAssistancePreviousEnding | null,
  warnings: readonly string[],
): WritingAssistanceView {
  return {
    chapterId: projection.chapterId,
    chapterTitle: projection.chapterTitle,
    goal: projection.goal,
    sceneBeats: projection.sceneBeats,
    characters: projection.characters,
    foreshadowings: projection.foreshadowings,
    todos: projection.todos,
    previousEnding,
    warnings,
  };
}

export async function loadWritingAssistance(
  bridge: RendererBridgeAdapter,
  projectId: string,
  chapterId: string,
): Promise<WritingAssistanceView> {
  const outcome = await bridge.storyKnowledge.project(
    { view: 'chapter_assist', projectId, chapterId, limit: 50 },
    {
      mode: 'replace',
      laneKey: `writing-assistance:${projectId}`,
      requestKey: `writing-assistance:${projectId}:${chapterId}`,
    },
  );
  if (outcome.state !== 'success' || outcome.data.view !== 'chapter_assist') {
    throw new Error(`WRITING_ASSISTANCE_${outcome.state.toUpperCase()}`);
  }

  const warnings: string[] = [];
  const previousEnding = outcome.data.previousChapter
    ? await loadPreviousEnding(bridge, projectId, outcome.data.previousChapter, warnings)
    : null;
  return projectionView(outcome.data, previousEnding, warnings);
}

async function loadPreviousEnding(
  bridge: RendererBridgeAdapter,
  projectId: string,
  chapter: {
    readonly chapterId: string;
    readonly chapterTitle: string;
    readonly finalVersionId: string | null;
  },
  warnings: string[],
): Promise<WritingAssistancePreviousEnding | null> {
  if (chapter.finalVersionId) {
    const outcome = await bridge.version.get(
      {
        projectId,
        chapterId: chapter.chapterId,
        versionId: chapter.finalVersionId,
      },
      { mode: 'share' },
    );
    if (outcome.state === 'success') {
      return {
        chapterId: chapter.chapterId,
        chapterTitle: chapter.chapterTitle,
        text: endingExcerpt(outcome.data.blocks.map((block) => block.text)),
        source: 'final-version',
      };
    }
    warnings.push('上一章定稿暂时无法读取');
  }

  const draft = await bridge.draft.open(
    { projectId, chapterId: chapter.chapterId },
    { mode: 'share' },
  );
  if (draft.state !== 'success') {
    warnings.push('上一章当前稿暂时无法读取');
    return null;
  }
  return {
    chapterId: chapter.chapterId,
    chapterTitle: chapter.chapterTitle,
    text: endingExcerpt(draft.data.blocks.map((block) => block.text)),
    source: 'current-draft',
  };
}

function endingExcerpt(blocks: readonly string[]): string {
  const text = blocks
    .map((block) => block.trim())
    .filter(Boolean)
    .join('\n\n');
  if (text.length <= 600) return text;
  return `…${text.slice(-600)}`;
}
