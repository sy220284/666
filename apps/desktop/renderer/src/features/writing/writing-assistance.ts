import type {
  ContinuityCatalog,
  Entity,
  NarrativePlanningCatalog,
  PlotNode,
  SceneBeat,
  ValidationCatalog,
} from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';

type StoryTodo = ValidationCatalog['todos'][number];

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

export async function loadWritingAssistance(
  bridge: RendererBridgeAdapter,
  projectId: string,
  chapterId: string,
): Promise<WritingAssistanceView> {
  const warnings: string[] = [];
  const [structure, outline, beats, entities, continuity, narrative, validation] =
    await Promise.all([
      bridge.planning.listStructure(projectId, { mode: 'replace' }),
      bridge.planning.listPlotNodes(projectId, { mode: 'replace' }),
      bridge.planning.listSceneBeats({ projectId, chapterId }, { mode: 'replace' }),
      bridge.canon.list({ projectId, includeArchived: false }, { mode: 'replace' }),
      bridge.continuity.list(
        {
          projectId,
          query: '',
          includeHistory: false,
          includeArchivedEvents: false,
          effectiveAtChapterId: chapterId,
        },
        { mode: 'replace' },
      ),
      bridge.narrativePlanning.list(
        {
          projectId,
          query: '',
          includeResolved: false,
          referenceChapterId: chapterId,
        },
        { mode: 'replace' },
      ),
      bridge.validation.list({ projectId, chapterId, includeClosed: false }, { mode: 'replace' }),
    ]);

  const structureData = successData(structure, '卷章目录', warnings);
  const outlineData = successData(outline, '故事大纲', warnings);
  const beatData = successData(beats, '场景', warnings);
  const entityData = successData(entities, '人物设定', warnings);
  const continuityData = successData(continuity, '人物动态状态', warnings);
  const narrativeData = successData(narrative, '伏笔与成长线', warnings);
  const validationData = successData(validation, '修改任务', warnings);

  const chapters = structureData?.volumes.flatMap((volume) => volume.chapters) ?? [];
  const chapterIndex = chapters.findIndex((chapter) => chapter.id === chapterId);
  const chapter = chapterIndex >= 0 ? chapters[chapterIndex] : null;
  const previousChapter = chapterIndex > 0 ? chapters[chapterIndex - 1] : null;
  const previousEnding = previousChapter
    ? await loadPreviousEnding(bridge, projectId, previousChapter, warnings)
    : null;

  return buildWritingAssistanceView({
    chapterId,
    chapterTitle: chapter?.title ?? null,
    plotNodes: outlineData?.nodes ?? [],
    sceneBeats: beatData?.beats ?? [],
    entities: entityData?.entities ?? [],
    continuity: continuityData ?? {
      projectId,
      entityStates: [],
      timelineEvents: [],
      knowledgeStates: [],
    },
    narrative: narrativeData ?? {
      projectId,
      foreshadowings: [],
      characterArcs: [],
    },
    todos: validationData?.todos ?? [],
    previousEnding,
    warnings,
  });
}

function successData<Data>(
  outcome: { readonly state: string; readonly data?: Data },
  label: string,
  warnings: string[],
): Data | null {
  if (outcome.state === 'success' && outcome.data !== undefined) return outcome.data;
  warnings.push(`${label}暂时无法读取`);
  return null;
}

async function loadPreviousEnding(
  bridge: RendererBridgeAdapter,
  projectId: string,
  chapter: {
    readonly id: string;
    readonly title: string;
    readonly finalVersionId: string | null;
  },
  warnings: string[],
): Promise<WritingAssistancePreviousEnding | null> {
  if (chapter.finalVersionId) {
    const outcome = await bridge.version.get(
      {
        projectId,
        chapterId: chapter.id,
        versionId: chapter.finalVersionId,
      },
      { mode: 'replace' },
    );
    if (outcome.state === 'success') {
      return {
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        text: endingExcerpt(outcome.data.blocks.map((block) => block.text)),
        source: 'final-version',
      };
    }
    warnings.push('上一章定稿暂时无法读取');
  }

  const draft = await bridge.draft.open({ projectId, chapterId: chapter.id }, { mode: 'replace' });
  if (draft.state !== 'success') {
    warnings.push('上一章当前稿暂时无法读取');
    return null;
  }
  return {
    chapterId: chapter.id,
    chapterTitle: chapter.title,
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
