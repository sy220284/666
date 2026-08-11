import type {
  ContinuityCatalog,
  Entity,
  NarrativePlanningCatalog,
  PlotNode,
  SceneBeat,
  StoryKnowledgeProjection,
  ValidationCatalog,
} from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';

type StoryTodo = ValidationCatalog['todos'][number];
type ChapterAssistProjection = Extract<StoryKnowledgeProjection, { readonly view: 'chapter_assist' }>;

export interface WritingAssistanceGoal {
  readonly title: string;
  readonly goal: string;
  readonly coreConflict: string;
  readonly expectedResult: string;
}

export interface WritingAssistanceBeat {
  readonly id: string;
  readonly title: string;
  readonly goal: string;
  readonly required: boolean;
  readonly wordTargetPercent: number;
}

export interface WritingAssistanceCharacter {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly states: readonly {
    readonly key: string;
    readonly value: unknown;
  }[];
  readonly knowledge: readonly {
    readonly information: string;
    readonly status: string;
  }[];
}

export interface WritingAssistanceForeshadowing {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly status: string;
  readonly attention: string;
}

export interface WritingAssistancePreviousEnding {
  readonly chapterId: string;
  readonly chapterTitle: string;
  readonly text: string;
  readonly source: 'final-version' | 'current-draft';
}

export interface WritingAssistanceView {
  readonly chapterId: string;
  readonly chapterTitle: string | null;
  readonly goal: WritingAssistanceGoal | null;
  readonly sceneBeats: readonly WritingAssistanceBeat[];
  readonly characters: readonly WritingAssistanceCharacter[];
  readonly foreshadowings: readonly WritingAssistanceForeshadowing[];
  readonly todos: readonly StoryTodo[];
  readonly previousEnding: WritingAssistancePreviousEnding | null;
  readonly warnings: readonly string[];
}

export interface WritingAssistanceSource {
  readonly chapterId: string;
  readonly chapterTitle: string | null;
  readonly plotNodes: readonly PlotNode[];
  readonly sceneBeats: readonly SceneBeat[];
  readonly entities: readonly Entity[];
  readonly continuity: ContinuityCatalog;
  readonly narrative: NarrativePlanningCatalog;
  readonly todos: readonly StoryTodo[];
  readonly previousEnding: WritingAssistancePreviousEnding | null;
  readonly warnings?: readonly string[];
}

export function buildWritingAssistanceView(source: WritingAssistanceSource): WritingAssistanceView {
  const plotNodeIds = new Set(
    source.sceneBeats.flatMap((beat) => (beat.plotNodeId ? [beat.plotNodeId] : [])),
  );
  const goalNode =
    source.plotNodes.find((node) => plotNodeIds.has(node.id)) ??
    source.plotNodes.find(
      (node) => node.nodeType === 'chapter' && node.title === source.chapterTitle,
    ) ??
    null;

  const characterIds = new Set(source.sceneBeats.flatMap((beat) => beat.characterIds));
  const characters = source.entities
    .filter((entity) => entity.entityType === 'character' && characterIds.has(entity.id))
    .map((entity) => ({
      id: entity.id,
      name: entity.name,
      summary: entity.summary,
      states: source.continuity.entityStates
        .filter((state) => state.entityId === entity.id && state.recordStatus === 'current')
        .map((state) => ({ key: state.stateKey, value: state.value })),
      knowledge: source.continuity.knowledgeStates
        .filter((state) => state.characterId === entity.id && state.recordStatus === 'current')
        .map((state) => ({
          information: state.informationKey,
          status: state.knowledgeStatus,
        })),
    }));

  const foreshadowings = source.narrative.foreshadowings
    .filter(
      (item) =>
        item.chapterLinks.some((link) => link.chapterId === source.chapterId) ||
        item.revealFromChapterId === source.chapterId ||
        item.revealByChapterId === source.chapterId ||
        item.attention !== 'none',
    )
    .map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      status: item.status,
      attention: item.attention,
    }));

  return {
    chapterId: source.chapterId,
    chapterTitle: source.chapterTitle,
    goal: goalNode
      ? {
          title: goalNode.title,
          goal: goalNode.goal,
          coreConflict: goalNode.coreConflict,
          expectedResult: goalNode.expectedResult,
        }
      : null,
    sceneBeats: source.sceneBeats.map((beat) => ({
      id: beat.id,
      title: beat.title,
      goal: beat.goal,
      required: beat.required,
      wordTargetPercent: beat.wordTargetPercent,
    })),
    characters,
    foreshadowings,
    todos: source.todos.filter((todo) => todo.status === 'open'),
    previousEnding: source.previousEnding,
    warnings: source.warnings ?? [],
  };
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
