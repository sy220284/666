import {
  StoryKnowledgeProjectionInputSchema,
  StoryKnowledgeProjectionSchema,
  type StoryKnowledgeProjection,
  type StoryKnowledgeProjectionInput,
} from '@worldforge/contracts';

import type { ProjectWorkspaceService } from './project-workspace.js';
import {
  projectChapterAssist,
  projectForeshadowingLane,
} from './story-knowledge-chapter-assist.js';
import { projectHistory } from './story-knowledge-history.js';
import {
  StoryKnowledgeProjectionService as BaseStoryKnowledgeProjectionService,
  StoryKnowledgeProjectionServiceError,
} from './story-knowledge-projection.js';

export { StoryKnowledgeProjectionServiceError };

export class StoryKnowledgeProjectionService {
  readonly #base: BaseStoryKnowledgeProjectionService;

  constructor(private readonly workspace: ProjectWorkspaceService) {
    this.#base = new BaseStoryKnowledgeProjectionService(workspace);
  }

  project(rawInput: StoryKnowledgeProjectionInput): StoryKnowledgeProjection {
    const input = StoryKnowledgeProjectionInputSchema.parse(rawInput);
    if (
      input.view !== 'foreshadowing' &&
      input.view !== 'history' &&
      input.view !== 'chapter_assist'
    ) {
      return this.#base.project(input);
    }
    return this.workspace.readProject(input.projectId, (connection) => {
      const chapter = connection
        .prepare(
          `SELECT 1 AS found
             FROM chapters chapter
             JOIN volumes volume ON volume.id = chapter.volume_id
            WHERE chapter.id = ? AND volume.project_id = ?
              AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL`,
        )
        .get(input.chapterId, input.projectId);
      if (!chapter) {
        throw new StoryKnowledgeProjectionServiceError(
          'STORY_KNOWLEDGE_NOT_FOUND',
          'The requested Story Knowledge chapter was not found.',
        );
      }
      const projection =
        input.view === 'chapter_assist'
          ? projectChapterAssist(connection, input)
          : input.view === 'history'
            ? projectHistory(connection, input)
            : projectForeshadowingLane(connection, input);
      return StoryKnowledgeProjectionSchema.parse(projection);
    });
  }
}
