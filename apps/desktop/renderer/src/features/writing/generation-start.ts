import type {
  DraftDocument,
  GenerationIntent,
  GenerationRun,
  MergeSourceMapping,
  ProviderSummary,
  RewriteSelectionAnchor,
  SceneBeat,
} from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { authorErrorSummary } from '../../presentation/author-error-message.js';
import { rendererCommandCoordinatorFor } from '../../runtime/command-coordinator.js';
import type {
  ChapterGenerationSource,
  GenerationMode,
  MergeMappingMode,
} from './generation-studio.js';

interface GenerationStartInput {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly chapterId: string;
  readonly commandPrefix: string;
  readonly draft: DraftDocument;
  readonly providerId: string;
  readonly providers: readonly ProviderSummary[];
  readonly readOnly: boolean;
  readonly flush: () => Promise<boolean>;
  readonly generationMode: GenerationMode;
  readonly chapterSource: ChapterGenerationSource;
  readonly chapterGoal: string;
  readonly tendency: string;
  readonly generationInstruction: string;
  readonly targetCharacters: number;
  readonly candidateCount: number;
  readonly sceneBeats: readonly SceneBeat[];
  readonly selectedSkeletonId: string;
  readonly acknowledgeStaleSkeleton: boolean;
  readonly mergeMappingMode: MergeMappingMode;
  readonly mergeCandidateIds: ReadonlySet<string>;
  readonly mergeBeatSources: Readonly<Record<string, string>>;
  readonly getRewriteSelectionAnchor: () => Promise<RewriteSelectionAnchor | null>;
  readonly continuationOfRunId: string | null;
  readonly intentOverride: GenerationIntent | null;
  readonly setPending: (pending: boolean) => void;
  readonly setStatus: (status: string) => void;
  readonly setLastIntent: (intent: GenerationIntent) => void;
  readonly onStarted: (run: GenerationRun, taskId: string) => void;
}

export async function startGenerationTask(input: GenerationStartInput): Promise<void> {
  if (input.readOnly) return;
  const { continuationOfRunId, intentOverride } = input;
  const coordinator = rendererCommandCoordinatorFor(input.setPending);
  const commandKey = `${input.commandPrefix}generation-start`;
  const result = await coordinator.run({
    key: commandKey,
    policy: 'reject',
    operation: async (scope) => {
      if (!(await input.flush()) || !scope.isCurrent()) return;
      const draftOutcome = await input.bridge.draft.open({
        projectId: input.projectId,
        chapterId: input.chapterId,
      });
      if (!scope.isCurrent()) return;
      if (draftOutcome.state !== 'success') {
        input.setStatus(
          draftOutcome.state === 'failure'
            ? `生成未启动 · ${authorErrorSummary(draftOutcome.error)}`
            : '生成请求已取消或被新请求替代。',
        );
        return;
      }
      const guardedInput: GenerationStartInput = {
        ...input,
        draft: draftOutcome.data,
        setStatus: (status) => {
          if (scope.isCurrent()) input.setStatus(status);
        },
      };
      if (!continuationOfRunId && !intentOverride && !validateGenerationInput(guardedInput)) return;
      if (!scope.isCurrent()) return;
      input.setStatus('正在校验权威输入并组装约束…');
      const intent = await buildGenerationIntent(guardedInput);
      if (!intent || !scope.isCurrent()) return;
      input.setLastIntent(intent);
      let providerId = input.providerId;
      if (!providerId) {
        const route = await input.bridge.longformAi.resolveTaskRoute(
          {
            projectId: input.projectId,
            taskType: intent.runType,
            candidates: input.providers.map((provider) => ({
              providerId: provider.id,
              model: provider.model,
              credentialConfigured: provider.credentialConfigured,
            })),
          },
          {
            mode: 'share',
            requestKey: `${input.commandPrefix}task-route:${intent.runType}`,
            laneKey: `${input.commandPrefix}task-route`,
          },
        );
        if (!scope.isCurrent()) return;
        if (route.state !== 'success') {
          input.setStatus(
            route.state === 'failure'
              ? `生成未启动 · ${authorErrorSummary(route.error)}`
              : '智能任务分配请求已被新请求替代。',
          );
          return;
        }
        providerId = route.data.providerId;
        input.setStatus(
          route.data.selection === 'fallback'
            ? '首选智能连接不可用，已按回退顺序选择可用连接。'
            : '已按当前任务选择可用智能连接。',
        );
      }
      const outcome = await input.bridge.generation.start({
        projectId: input.projectId,
        chapterId: input.chapterId,
        baseDraftId: guardedInput.draft.draftId,
        baseDraftRevision: guardedInput.draft.revision,
        providerId,
        continuationOfRunId,
        intent,
      });
      if (!scope.isCurrent()) return;
      if (outcome.state !== 'success') {
        input.setStatus(
          outcome.state === 'failure'
            ? `生成未启动 · ${authorErrorSummary(outcome.error)}`
            : '生成请求已取消或被新请求替代。',
        );
        return;
      }
      input.onStarted(outcome.data.run, outcome.data.taskId);
      input.setStatus(`任务已启动 · ${outcome.data.run.stage}`);
    },
  });

  if (result.state === 'rejected') {
    input.setStatus('生成启动请求正在处理中，请等待当前请求完成。');
    return;
  }
  if (!coordinator.isLatest(commandKey, result.token)) return;
  if (result.state === 'failed') {
    input.setStatus(
      `生成未启动 · ${authorErrorSummary({
        code: 'BRIDGE_UNEXPECTED_FAILURE',
        message: 'The generation bridge call failed unexpectedly.',
      })}`,
    );
  }
}

function validateGenerationInput(input: GenerationStartInput): boolean {
  const fail = (message: string): false => {
    input.setStatus(message);
    return false;
  };
  if (input.generationMode === 'skeleton' && !input.chapterGoal.trim())
    return fail('请先填写本章目标。');
  if (
    input.generationMode === 'chapter' &&
    input.chapterSource === 'direct_chapter_goal' &&
    !input.chapterGoal.trim()
  )
    return fail('直接生成正文需要本章目标。');
  if (
    input.generationMode === 'chapter' &&
    input.chapterSource === 'skeleton_candidate' &&
    !input.selectedSkeletonId
  )
    return fail('请选择一个骨架候选。');
  if (
    input.generationMode === 'chapter' &&
    input.chapterSource === 'canonical_scene_beats' &&
    input.sceneBeats.length === 0
  )
    return fail('当前章节没有可用于生成的场景。');
  if (input.generationMode === 'rewrite' && !input.generationInstruction.trim())
    return fail('请填写改写指令。');
  return true;
}

async function buildGenerationIntent(
  input: GenerationStartInput,
): Promise<GenerationIntent | null> {
  if (input.intentOverride) return input.intentOverride;
  if (input.continuationOfRunId) {
    return {
      runType: 'chapter',
      source: {
        sourceType: 'direct_chapter_goal',
        chapterGoal: input.chapterGoal.trim() || '从已保存的部分结果继续本章，不重复已有正文。',
      },
      targetLanguage: 'zh-CN',
      targetCharacters: input.targetCharacters,
      styleInstructions: instructionList(input.generationInstruction),
    };
  }
  if (input.generationMode === 'skeleton') {
    return {
      runType: 'skeleton',
      chapterGoal: input.chapterGoal.trim(),
      tendency: input.tendency.trim(),
      targetLanguage: 'zh-CN',
      candidateCount: input.candidateCount,
      requiredSceneBeatIds: input.sceneBeats.filter((beat) => beat.required).map((beat) => beat.id),
    };
  }
  if (input.generationMode === 'chapter') return buildChapterIntent(input);
  if (input.generationMode === 'rewrite') return buildRewriteIntent(input);
  return buildMergeIntent(input);
}

function buildChapterIntent(input: GenerationStartInput): GenerationIntent {
  return {
    runType: 'chapter',
    source:
      input.chapterSource === 'skeleton_candidate'
        ? {
            sourceType: 'skeleton_candidate',
            selectedSkeletonCandidateId: input.selectedSkeletonId,
            acknowledgeStaleSource: input.acknowledgeStaleSkeleton,
          }
        : input.chapterSource === 'canonical_scene_beats'
          ? {
              sourceType: 'canonical_scene_beats',
              sceneBeatIds: input.sceneBeats.map((beat) => beat.id),
            }
          : { sourceType: 'direct_chapter_goal', chapterGoal: input.chapterGoal.trim() },
    targetLanguage: 'zh-CN',
    targetCharacters: input.targetCharacters,
    styleInstructions: instructionList(input.generationInstruction),
  };
}

async function buildRewriteIntent(input: GenerationStartInput): Promise<GenerationIntent | null> {
  const anchor = await input.getRewriteSelectionAnchor();
  const eligible = input.draft.blocks.filter((block) => !block.locked && block.contentHash);
  if (!anchor && eligible.length === 0) {
    input.setStatus('没有可改写的未锁定正文段落。');
    return null;
  }
  return {
    runType: 'rewrite',
    scope: anchor
      ? { scopeType: 'selection', anchor }
      : {
          scopeType: 'blocks',
          logicalBlockIds: eligible.map((block) => block.logicalBlockId),
          expectedBlockHashes: eligible.map((block) => block.contentHash!),
        },
    instruction: input.generationInstruction.trim(),
    targetLanguage: 'zh-CN',
  };
}

async function buildMergeIntent(input: GenerationStartInput): Promise<GenerationIntent | null> {
  const chosenBeatSources = Object.entries(input.mergeBeatSources).filter(([, source]) => source);
  if (
    (input.mergeMappingMode === 'segment' && input.mergeCandidateIds.size < 2) ||
    (input.mergeMappingMode === 'beat' && chosenBeatSources.length < 2)
  ) {
    input.setStatus('融合至少需要两个明确的来源单元。');
    return null;
  }
  const ids =
    input.mergeMappingMode === 'beat'
      ? [
          ...new Set(
            chosenBeatSources.flatMap(([, source]) => (source === 'current_draft' ? [] : [source])),
          ),
        ]
      : [...input.mergeCandidateIds];
  const documents = await Promise.all(
    ids.map((candidateId) =>
      input.bridge.candidate.get({
        projectId: input.projectId,
        chapterId: input.chapterId,
        candidateId,
      }),
    ),
  );
  if (
    documents.some(
      (outcome) => outcome.state !== 'success' || outcome.data.candidateType === 'skeleton',
    )
  ) {
    input.setStatus('融合来源读取失败或包含骨架。');
    return null;
  }
  const byId = new Map(
    documents.flatMap((outcome) =>
      outcome.state === 'success' && outcome.data.candidateType !== 'skeleton'
        ? [[outcome.data.candidateId, outcome.data] as const]
        : [],
    ),
  );
  const mapping: MergeSourceMapping =
    input.mergeMappingMode === 'beat'
      ? {
          mappingType: 'beat',
          units: chosenBeatSources.map(([sceneBeatId, source]) =>
            source === 'current_draft'
              ? { sceneBeatId, sourceCandidateId: null, sourceBlockIds: [], keepCurrentDraft: true }
              : {
                  sceneBeatId,
                  sourceCandidateId: source,
                  sourceBlockIds:
                    byId
                      .get(source)
                      ?.blocks.filter((block) => block.beatId === sceneBeatId)
                      .map((block) => block.candidateBlockId) ?? [],
                  keepCurrentDraft: false,
                },
          ),
        }
      : {
          mappingType: 'segment',
          units: documents.map((outcome, index) => {
            if (outcome.state !== 'success' || outcome.data.candidateType === 'skeleton')
              throw new Error('MERGE_SOURCE_INVALID');
            return {
              segmentId: crypto.randomUUID(),
              sourceType: 'candidate' as const,
              candidateId: outcome.data.candidateId,
              sourceBlockIds: outcome.data.blocks.map((block) => block.candidateBlockId),
              order: index + 1,
            };
          }),
        };
  if (
    mapping.mappingType === 'beat' &&
    mapping.units.some((unit) => !unit.keepCurrentDraft && unit.sourceBlockIds.length === 0)
  ) {
    input.setStatus('所选建议稿没有关联到对应场景的正文段落，请改用分段融合。');
    return null;
  }
  return {
    runType: 'merge',
    mapping,
    ...(input.generationInstruction.trim()
      ? { instruction: input.generationInstruction.trim() }
      : {}),
    targetLanguage: 'zh-CN',
  };
}

function instructionList(instruction: string): string[] {
  return instruction.trim() ? [instruction.trim()] : [];
}
