import {
  IdeaConversionApplyInputSchema,
  IdeaConversionPreviewInputSchema,
  type IdeaCard,
  type IdeaConversionApplyInput,
  type IdeaConversionApplyResult,
  type IdeaConversionPreview,
  type IdeaConversionPreviewInput,
  type IdeaCreateInput,
  type IdeaDetail,
  type IdeaGetInput,
  type IdeaList,
  type IdeaListInput,
  type IdeaSetStatusInput,
} from '@worldforge/contracts';

import {
  IdeaCapsuleService,
  IdeaCapsuleServiceError,
  type IdeaCapsuleServiceOptions,
} from './idea-capsule-service.js';
import { ProjectPlanningService } from './project-planning.js';
import type { ProjectWorkspaceService } from './project-workspace.js';
import { stableJson } from './stable-json.js';

const MAX_TRACKED_PREVIEWS = 256;

function briefFingerprint(brief: ReturnType<ProjectPlanningService['getBrief']>): string {
  return stableJson({
    id: brief.id,
    projectId: brief.projectId,
    concept: brief.concept,
    readingPromise: brief.readingPromise,
    protagonistGoal: brief.protagonistGoal,
    coreConflict: brief.coreConflict,
    endingIntent: brief.endingIntent,
    required: brief.required,
    forbidden: brief.forbidden,
    updatedAt: brief.updatedAt,
  });
}

export class SafeIdeaCapsuleService extends IdeaCapsuleService {
  readonly #planning: ProjectPlanningService;
  readonly #previewBriefRevisions = new Map<string, string>();

  constructor(workspace: ProjectWorkspaceService, options: IdeaCapsuleServiceOptions = {}) {
    super(workspace, options);
    this.#planning = new ProjectPlanningService(workspace);
  }

  override list(raw: IdeaListInput): IdeaList {
    return super.list(raw);
  }

  override get(raw: IdeaGetInput): IdeaDetail {
    return super.get(raw);
  }

  override create(requestId: string, raw: IdeaCreateInput): Promise<IdeaCard> {
    return super.create(requestId, raw);
  }

  override setStatus(requestId: string, raw: IdeaSetStatusInput): Promise<IdeaCard> {
    return super.setStatus(requestId, raw);
  }

  override previewConversion(raw: IdeaConversionPreviewInput): IdeaConversionPreview {
    const input = IdeaConversionPreviewInputSchema.parse(raw);
    if (input.target.targetType !== 'project_brief') {
      return super.previewConversion(input);
    }

    const detail = super.get({ projectId: input.projectId, ideaId: input.ideaId });
    if (detail.idea.ideaKind !== 'new_book') {
      return super.previewConversion(input);
    }

    const current = this.#planning.getBrief(input.projectId);
    const target = {
      targetType: 'project_brief' as const,
      draft: {
        concept: input.target.draft.concept,
        readingPromise: input.target.draft.readingPromise,
        protagonistGoal: current.protagonistGoal,
        coreConflict: current.coreConflict,
        endingIntent: current.endingIntent,
        required: [...current.required],
        forbidden: [...current.forbidden],
      },
    };
    const preview = super.previewConversion({ ...input, target });
    this.#rememberPreview(preview.previewHash, briefFingerprint(current));
    return preview;
  }

  override async applyConversion(
    requestId: string,
    raw: IdeaConversionApplyInput,
  ): Promise<IdeaConversionApplyResult> {
    const input = IdeaConversionApplyInputSchema.parse(raw);
    if (input.target.targetType === 'project_brief') {
      const detail = super.get({ projectId: input.projectId, ideaId: input.ideaId });
      if (detail.idea.ideaKind === 'new_book') {
        const expectedRevision = this.#previewBriefRevisions.get(input.previewHash);
        if (!expectedRevision) {
          throw new IdeaCapsuleServiceError(
            'IDEA_CONFLICT',
            'The Project Brief conversion preview expired; preview it again before applying.',
          );
        }
        const currentRevision = briefFingerprint(this.#planning.getBrief(input.projectId));
        if (currentRevision !== expectedRevision) {
          this.#previewBriefRevisions.delete(input.previewHash);
          throw new IdeaCapsuleServiceError(
            'IDEA_CONFLICT',
            'The Project Brief changed after preview; preview it again before applying.',
          );
        }
      }
    }

    const result = await super.applyConversion(requestId, input);
    this.#previewBriefRevisions.delete(input.previewHash);
    return result;
  }

  #rememberPreview(previewHash: string, revision: string): void {
    if (
      !this.#previewBriefRevisions.has(previewHash) &&
      this.#previewBriefRevisions.size >= MAX_TRACKED_PREVIEWS
    ) {
      const oldest = this.#previewBriefRevisions.keys().next().value;
      if (typeof oldest === 'string') this.#previewBriefRevisions.delete(oldest);
    }
    this.#previewBriefRevisions.set(previewHash, revision);
  }
}
