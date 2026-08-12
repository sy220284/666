import {
  IdeaCardSchema,
  IdeaExploreOutputItemSchema,
  IdeaKindSchema,
  IdeaDivergenceLevelSchema,
  IdeaDepthLevelSchema,
  IdeaSourceContextSchema,
  type IdeaCard,
  type IdeaDepthLevel,
  type IdeaDivergenceLevel,
  type IdeaExploreOutputItem,
  type IdeaKind,
  type IdeaSourceContext,
} from '@worldforge/contracts';

import {
  assertActive,
  type GenerationRunIdentity,
  type GenerationRunServiceContext,
  type GenerationUsage,
  GenerationRunServiceError,
  readRun,
} from './run-repository.js';

export interface IdeaGenerationCompletionInput extends GenerationRunIdentity {
  readonly ideaKind: IdeaKind;
  readonly divergenceLevel: IdeaDivergenceLevel;
  readonly depthLevel: IdeaDepthLevel;
  readonly sourceContext: IdeaSourceContext;
  readonly ideas: readonly IdeaExploreOutputItem[];
  readonly usage?: GenerationUsage;
}

export interface IdeaGenerationCompletion {
  readonly run: ReturnType<typeof readRun>;
  readonly ideas: readonly IdeaCard[];
}

export function completeIdeaCards(
  context: GenerationRunServiceContext,
  requestId: string,
  raw: IdeaGenerationCompletionInput,
): Promise<IdeaGenerationCompletion> {
  const ideaKind = IdeaKindSchema.parse(raw.ideaKind);
  const divergenceLevel = IdeaDivergenceLevelSchema.parse(raw.divergenceLevel);
  const depthLevel = IdeaDepthLevelSchema.parse(raw.depthLevel);
  const sourceContext = IdeaSourceContextSchema.parse(raw.sourceContext);
  const ideas = raw.ideas.map((idea) => IdeaExploreOutputItemSchema.parse(idea));
  if (ideas.length < 1 || ideas.length > 8) {
    return Promise.reject(
      new GenerationRunServiceError(
        'GENERATION_CANDIDATE_INVALID',
        'Idea exploration must persist between one and eight IdeaCards.',
      ),
    );
  }

  return context.workspace.writeProject(requestId, raw.projectId, (database) => {
    const run = readRun(database, raw);
    assertActive(run);
    if (
      run.runType !== 'idea_explore' ||
      run.scopeType !== sourceContext.scopeType ||
      run.scopeId !== sourceContext.scopeId ||
      run.chapterId !== sourceContext.chapterId
    ) {
      throw new GenerationRunServiceError(
        'GENERATION_BASE_CONFLICT',
        'The IdeaCard source context does not match the GenerationRun scope.',
      );
    }
    const now = context.clock.now().toISOString();
    const cards = ideas.map((idea) => {
      const id = context.idFactory();
      database
        .prepare(
          `INSERT INTO idea_cards(
             id, project_id, idea_kind, title, summary, content,
             divergence_level, depth_level, source_context_json,
             generation_run_id, status, created_at, updated_at
           ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
        )
        .run(
          id,
          run.projectId,
          ideaKind,
          idea.title,
          idea.summary,
          idea.content,
          divergenceLevel,
          depthLevel,
          JSON.stringify(sourceContext),
          run.runId,
          now,
          now,
        );
      database
        .prepare(
          `INSERT INTO generation_result_refs(
             run_id, result_type, result_id, candidate_kind, created_at
           ) VALUES(?, 'idea_card', ?, NULL, ?)`,
        )
        .run(run.runId, id, now);
      return IdeaCardSchema.parse({
        id,
        projectId: run.projectId,
        ideaKind,
        title: idea.title,
        summary: idea.summary,
        content: idea.content,
        divergenceLevel,
        depthLevel,
        sourceContext,
        generationRunId: run.runId,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });
    });
    database
      .prepare(
        `UPDATE generation_runs
            SET status = 'succeeded', stage = 'completed',
                input_tokens = COALESCE(?, input_tokens),
                output_tokens = COALESCE(?, output_tokens),
                error_code = NULL, retryable = NULL, finished_at = ?
          WHERE id = ?`,
      )
      .run(raw.usage?.inputTokens ?? null, raw.usage?.outputTokens ?? null, now, run.runId);
    return { run: readRun(database, raw), ideas: cards };
  });
}
