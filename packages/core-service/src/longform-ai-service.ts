import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import {
  AiTaskRouteResolveInputSchema,
  AiTaskRouteResolutionSchema,
  LongformAiSettingsSchema,
  LongformAiSettingsUpdateInputSchema,
  StoryDigestListInputSchema,
  StoryDigestListSchema,
  StoryDigestRebuildInputSchema,
  StoryDigestRebuildResultSchema,
  StoryDigestSchema,
  StyleDeviationInputSchema,
  StyleDeviationSchema,
  StyleMetricSchema,
  type AiTaskRouteResolution,
  type AiTaskRouteResolveInput,
  type LongformAiSettings,
  type LongformAiSettingsUpdateInput,
  type StoryDigest,
  type StoryDigestListInput,
  type StoryDigestRebuildInput,
  type StyleDeviation,
  type StyleDeviationInput,
} from '@worldforge/contracts';
import { stableSerialize } from '@worldforge/domain';
import {
  chapterPrompt,
  ideaExplorePrompt,
  mergePrompt,
  rewritePrompt,
  skeletonPrompt,
  stateExtractPrompt,
  validatePrompt,
} from '@worldforge/prompts';

import type { DatabaseClock } from './database/index.js';
import type { ProjectWorkspaceService } from './project-workspace.js';

const SETTINGS_KEY = 'longform.ai';
const systemClock: DatabaseClock = { now: () => new Date() };

export const DEFAULT_LONGFORM_AI_SETTINGS: LongformAiSettings = LongformAiSettingsSchema.parse({
  schemaVersion: 1,
  activeStyleProfileId: null,
  styleProfiles: [],
  taskRoutes: [],
  updatedAt: null,
});

export type LongformAiServiceErrorCode =
  | 'LONGFORM_DIGEST_FAILED'
  | 'LONGFORM_STYLE_SAMPLE_INSUFFICIENT'
  | 'LONGFORM_ROUTE_UNAVAILABLE'
  | 'LONGFORM_SETTINGS_CONFLICT'
  | 'LONGFORM_SCOPE_NOT_FOUND'
  | 'LONGFORM_INVARIANT';

export class LongformAiServiceError extends Error {
  readonly code: LongformAiServiceErrorCode;

  constructor(code: LongformAiServiceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'LongformAiServiceError';
    this.code = code;
  }
}

export interface LongformAiServiceOptions {
  readonly clock?: DatabaseClock;
  readonly idFactory?: () => string;
  readonly beforeRebuild?: (input: StoryDigestRebuildInput) => void;
}

interface DigestRow extends Record<string, unknown> {
  readonly id: string;
  readonly projectId: string;
  readonly scopeType: string;
  readonly scopeId: string;
  readonly sourceHash: string;
  readonly sourceVersionIdsJson: string;
  readonly semanticRevision: number | bigint;
  readonly freshness: string;
  readonly content: string;
  readonly generationSource: string;
  readonly generatedAt: string;
  readonly updatedAt: string;
}

interface RebuildState {
  readonly rebuilt: Map<string, StoryDigest>;
  skippedUnfinalizedChapters: number;
}

interface ChapterDigestScopeRow extends Record<string, unknown> {
  readonly chapterId: string;
  readonly chapterTitle: string;
  readonly volumeId: string;
  readonly volumeTitle: string;
  readonly finalVersionId: string | null;
  readonly contentHash: string | null;
  readonly wordCount: number | bigint | null;
}

interface DigestScopeResult {
  readonly digest: StoryDigest;
  readonly volumeId?: string;
}

type ProjectDatabase = Parameters<Parameters<ProjectWorkspaceService['readProject']>[1]>[0];

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function parseJson(value: unknown, field: string): unknown {
  if (typeof value !== 'string') {
    throw new LongformAiServiceError('LONGFORM_INVARIANT', `${field} is not persisted text.`);
  }
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    throw new LongformAiServiceError('LONGFORM_INVARIANT', `${field} is not valid JSON.`, {
      cause: error,
    });
  }
}

function digestFromRow(row: DigestRow): StoryDigest {
  return StoryDigestSchema.parse({
    id: row.id,
    projectId: row.projectId,
    scopeType: row.scopeType,
    scopeId: row.scopeId,
    sourceHash: row.sourceHash,
    sourceVersionIds: parseJson(row.sourceVersionIdsJson, 'story_digests.source_version_ids_json'),
    semanticRevision: Number(row.semanticRevision),
    freshness: row.freshness,
    content: row.content,
    generationSource: row.generationSource,
    generatedAt: row.generatedAt,
    updatedAt: row.updatedAt,
  });
}

function digestSelect(where: string): string {
  return `SELECT id, project_id AS projectId, scope_type AS scopeType, scope_id AS scopeId,
                 source_hash AS sourceHash, source_version_ids_json AS sourceVersionIdsJson,
                 semantic_revision AS semanticRevision, freshness, content,
                 generation_source AS generationSource, generated_at AS generatedAt,
                 updated_at AS updatedAt
            FROM story_digests
           WHERE ${where}`;
}

function normalizeParagraph(value: string): string {
  return value.replaceAll('\r\n', '\n').replaceAll('\r', '\n').replace(/\s+/gu, ' ').trim();
}

function boundedExcerpt(paragraphs: readonly string[], limit = 2_400): string {
  const eligible = paragraphs.map(normalizeParagraph).filter(Boolean);
  if (eligible.length === 0) return '';
  const selected = [...eligible.slice(0, 3), ...eligible.slice(-2)];
  const unique = [...new Set(selected)];
  return unique.join('\n').slice(0, limit).trim();
}

function styleMetrics(paragraphs: readonly { text: string; blockType: string }[]) {
  const normalized = paragraphs.map((entry) => ({
    text: normalizeParagraph(entry.text),
    blockType: entry.blockType,
  }));
  const nonEmpty = normalized.filter((entry) => entry.text.length > 0);
  const combined = nonEmpty.map((entry) => entry.text).join('');
  const sentences = combined
    .split(/[。！？!?…]+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const characters = Array.from(combined).length;
  const dialogueCharacters = nonEmpty
    .filter((entry) => entry.blockType === 'dialogue' || /^[“「『"']|[”」』"']$/u.test(entry.text))
    .reduce((total, entry) => total + Array.from(entry.text).length, 0);
  return StyleMetricSchema.parse({
    averageSentenceCharacters: sentences.length === 0 ? 0 : characters / sentences.length,
    averageParagraphCharacters: nonEmpty.length === 0 ? 0 : characters / nonEmpty.length,
    dialogueRatio: characters === 0 ? 0 : dialogueCharacters / characters,
  });
}

function versionBlocks(database: DatabaseSync, versionId: string) {
  return database
    .prepare(
      `SELECT text, block_type AS blockType
         FROM version_blocks
        WHERE version_id = ?
        ORDER BY order_key, logical_block_id`,
    )
    .all(versionId)
    .map((row) => ({ text: String(row.text), blockType: String(row.blockType) }));
}

function supportRank(status: 'verified' | 'limited' | 'unverified'): number {
  return status === 'verified' ? 0 : status === 'limited' ? 1 : 2;
}

function promptIdentity(taskType: AiTaskRouteResolveInput['taskType']): {
  readonly promptId: string;
  readonly promptVersion: number;
} {
  const prompt = {
    skeleton: skeletonPrompt,
    chapter: chapterPrompt,
    rewrite: rewritePrompt,
    merge: mergePrompt,
    validate: validatePrompt,
    state_extract: stateExtractPrompt,
    idea_explore: ideaExplorePrompt,
  }[taskType];
  return { promptId: prompt.promptId, promptVersion: prompt.version };
}

export class LongformAiService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #clock: DatabaseClock;
  readonly #idFactory: () => string;
  readonly #beforeRebuild: ((input: StoryDigestRebuildInput) => void) | undefined;

  constructor(workspace: ProjectWorkspaceService, options: LongformAiServiceOptions = {}) {
    this.#workspace = workspace;
    this.#clock = options.clock ?? systemClock;
    this.#idFactory = options.idFactory ?? randomUUID;
    this.#beforeRebuild = options.beforeRebuild;
  }

  getSettings(projectId: string): LongformAiSettings {
    return this.#workspace.readProject(projectId, (database) => {
      const row = database
        .prepare(
          'SELECT value_json AS valueJson, updated_at AS updatedAt FROM project_settings WHERE setting_key = ?',
        )
        .get(SETTINGS_KEY) as { valueJson: string; updatedAt: string } | undefined;
      if (!row) return DEFAULT_LONGFORM_AI_SETTINGS;
      return LongformAiSettingsSchema.parse({
        ...(parseJson(row.valueJson, 'project_settings.value_json') as object),
        updatedAt: row.updatedAt,
      });
    });
  }

  updateSettings(
    requestId: string,
    raw: LongformAiSettingsUpdateInput,
  ): Promise<LongformAiSettings> {
    const input = LongformAiSettingsUpdateInputSchema.parse(raw);
    const now = this.#clock.now().toISOString();
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const current = database
        .prepare(
          'SELECT value_json AS valueJson, updated_at AS updatedAt FROM project_settings WHERE setting_key = ?',
        )
        .get(SETTINGS_KEY) as { valueJson: string; updatedAt: string } | undefined;
      const currentUpdatedAt = current?.updatedAt ?? null;
      if (currentUpdatedAt !== input.expectedUpdatedAt) {
        throw new LongformAiServiceError(
          'LONGFORM_SETTINGS_CONFLICT',
          'Long-form settings changed before this update was committed.',
        );
      }
      const settings = this.#enrichLearnedProfiles(database, input.projectId, {
        ...input.settings,
        updatedAt: now,
      });
      const valueJson = JSON.stringify({ ...settings, updatedAt: undefined });
      database
        .prepare(
          `INSERT INTO project_settings(setting_key, value_json, updated_at)
           VALUES(?, ?, ?)
           ON CONFLICT(setting_key) DO UPDATE SET
             value_json = excluded.value_json,
             updated_at = excluded.updated_at`,
        )
        .run(SETTINGS_KEY, valueJson, now);
      const project = database
        .prepare('UPDATE projects SET active_style_profile_id = ?, updated_at = ? WHERE id = ?')
        .run(settings.activeStyleProfileId, now, input.projectId);
      if (Number(project.changes) !== 1) {
        throw new LongformAiServiceError('LONGFORM_SCOPE_NOT_FOUND', 'Project not found.');
      }
      return settings;
    });
  }

  listDigests(raw: StoryDigestListInput) {
    const input = StoryDigestListInputSchema.parse(raw);
    return this.#workspace.readProject(input.projectId, (database) => {
      const clauses = ['project_id = ?'];
      const parameters: Array<string | number> = [input.projectId];
      if (input.scopeType) {
        clauses.push('scope_type = ?');
        parameters.push(input.scopeType);
      }
      if (input.scopeId) {
        clauses.push('scope_id = ?');
        parameters.push(input.scopeId);
      }
      if (input.freshness) {
        clauses.push('freshness = ?');
        parameters.push(input.freshness);
      }
      parameters.push(input.limit);
      const rows = database
        .prepare(
          `${digestSelect(clauses.join(' AND '))}
           ORDER BY CASE scope_type WHEN 'chapter' THEN 0 WHEN 'volume' THEN 1 ELSE 2 END,
                    updated_at DESC, scope_id
           LIMIT ?`,
        )
        .all(...parameters) as unknown as DigestRow[];
      return StoryDigestListSchema.parse({
        projectId: input.projectId,
        digests: rows.map(digestFromRow),
      });
    });
  }

  rebuild(requestId: string, raw: StoryDigestRebuildInput) {
    const input = StoryDigestRebuildInputSchema.parse(raw);
    this.#beforeRebuild?.(input);
    const now = this.#clock.now().toISOString();
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const state: RebuildState = { rebuilt: new Map(), skippedUnfinalizedChapters: 0 };
      if (input.scopeType === 'chapter') {
        const chapter = this.#rebuildChapter(database, input.projectId, input.scopeId, now, state);
        if (chapter) {
          this.#rebuildVolume(database, input.projectId, chapter.volumeId!, now, state, false);
          this.#rebuildProject(database, input.projectId, now, state, false);
        }
      } else if (input.scopeType === 'volume') {
        this.#rebuildVolume(database, input.projectId, input.scopeId, now, state, true);
        this.#rebuildProject(database, input.projectId, now, state, false);
      } else {
        if (input.scopeId !== input.projectId) {
          throw new LongformAiServiceError(
            'LONGFORM_SCOPE_NOT_FOUND',
            'Project digest scope must use the Project id.',
          );
        }
        this.#rebuildProject(database, input.projectId, now, state, true);
      }
      return StoryDigestRebuildResultSchema.parse({
        projectId: input.projectId,
        requestedScopeType: input.scopeType,
        requestedScopeId: input.scopeId,
        rebuilt: [...state.rebuilt.values()],
        skippedUnfinalizedChapters: state.skippedUnfinalizedChapters,
      });
    });
  }

  rebuildForChapter(requestId: string, projectId: string, chapterId: string) {
    return this.rebuild(requestId, { projectId, scopeType: 'chapter', scopeId: chapterId });
  }

  evaluateStyle(raw: StyleDeviationInput): StyleDeviation {
    const input = StyleDeviationInputSchema.parse(raw);
    return this.#workspace.readProject(input.projectId, (database) => {
      const settings = this.#settingsFromDatabase(database);
      const profile = settings.styleProfiles.find((item) => item.id === input.profileId);
      if (!profile) {
        throw new LongformAiServiceError('LONGFORM_SCOPE_NOT_FOUND', 'StyleProfile not found.');
      }
      const version = database
        .prepare(
          `SELECT version.id
             FROM versions version
             JOIN chapters chapter ON chapter.id = version.chapter_id
             JOIN volumes volume ON volume.id = chapter.volume_id
            WHERE version.id = ? AND volume.project_id = ?`,
        )
        .get(input.versionId, input.projectId);
      if (!version) {
        throw new LongformAiServiceError(
          'LONGFORM_SCOPE_NOT_FOUND',
          'Style sample Version not found.',
        );
      }
      const measured = styleMetrics(versionBlocks(database, input.versionId));
      const target = profile.targetMetrics;
      if (!target) {
        return StyleDeviationSchema.parse({
          ...input,
          status: 'insufficient_samples',
          measured,
          target: null,
          deviations: [],
        });
      }
      const deviations = (
        ['averageSentenceCharacters', 'averageParagraphCharacters', 'dialogueRatio'] as const
      )
        .map((metric) => ({
          metric,
          relativeDifference:
            Math.abs(measured[metric] - target[metric]) / Math.max(0.05, target[metric]),
        }))
        .filter((entry) => entry.relativeDifference > 0.35);
      return StyleDeviationSchema.parse({
        ...input,
        status: deviations.length > 0 ? 'deviated' : 'within_profile',
        measured,
        target,
        deviations,
      });
    });
  }

  resolveTaskRoute(raw: AiTaskRouteResolveInput): AiTaskRouteResolution {
    const input = AiTaskRouteResolveInputSchema.parse(raw);
    return this.#workspace.readProject(input.projectId, (database) => {
      const settings = this.#settingsFromDatabase(database);
      const route = settings.taskRoutes.find((item) => item.taskType === input.taskType);
      const prompt = promptIdentity(input.taskType);
      const byId = new Map(input.candidates.map((candidate) => [candidate.providerId, candidate]));
      const preferredIds = route
        ? [
            ...(route.primaryProviderId ? [route.primaryProviderId] : []),
            ...route.fallbackProviderIds,
          ]
        : input.candidates.map((candidate) => candidate.providerId);
      const rejectedProviderIds: string[] = [];
      for (const providerId of preferredIds) {
        const candidate = byId.get(providerId);
        if (!candidate || !candidate.credentialConfigured) {
          rejectedProviderIds.push(providerId);
          continue;
        }
        const support = this.#modelSupport(
          database,
          candidate.providerId,
          candidate.model,
          input.taskType,
          prompt.promptId,
          prompt.promptVersion,
        );
        if (route && supportRank(support) > supportRank(route.minimumSupport)) {
          rejectedProviderIds.push(providerId);
          continue;
        }
        return AiTaskRouteResolutionSchema.parse({
          projectId: input.projectId,
          taskType: input.taskType,
          providerId: candidate.providerId,
          model: candidate.model,
          selection: route
            ? candidate.providerId === route.primaryProviderId
              ? 'primary'
              : 'fallback'
            : 'default',
          support,
          rejectedProviderIds,
        });
      }
      throw new LongformAiServiceError(
        'LONGFORM_ROUTE_UNAVAILABLE',
        'No configured Provider satisfies this task route and model-support policy.',
      );
    });
  }

  #settingsFromDatabase(database: ProjectDatabase): LongformAiSettings {
    const row = database
      .prepare(
        'SELECT value_json AS valueJson, updated_at AS updatedAt FROM project_settings WHERE setting_key = ?',
      )
      .get(SETTINGS_KEY) as { valueJson: string; updatedAt: string } | undefined;
    return row
      ? LongformAiSettingsSchema.parse({
          ...(parseJson(row.valueJson, 'project_settings.value_json') as object),
          updatedAt: row.updatedAt,
        })
      : DEFAULT_LONGFORM_AI_SETTINGS;
  }

  #enrichLearnedProfiles(
    database: ProjectDatabase,
    projectId: string,
    settings: LongformAiSettings,
  ): LongformAiSettings {
    const profiles = settings.styleProfiles.map((profile) => {
      if (
        profile.targetMetrics ||
        profile.origin !== 'learned' ||
        profile.sampleVersionIds.length < 2
      ) {
        return profile;
      }
      const samples = profile.sampleVersionIds.flatMap((versionId) => {
        const owned = database
          .prepare(
            `SELECT version.id
               FROM versions version
               JOIN chapters chapter ON chapter.id = version.chapter_id
               JOIN volumes volume ON volume.id = chapter.volume_id
              WHERE version.id = ? AND volume.project_id = ?`,
          )
          .get(versionId, projectId);
        if (!owned) {
          throw new LongformAiServiceError(
            'LONGFORM_STYLE_SAMPLE_INSUFFICIENT',
            'A StyleProfile sample does not belong to this Project.',
          );
        }
        return versionBlocks(database, versionId);
      });
      return { ...profile, targetMetrics: styleMetrics(samples) };
    });
    return LongformAiSettingsSchema.parse({ ...settings, styleProfiles: profiles });
  }

  #modelSupport(
    database: ProjectDatabase,
    providerId: string,
    model: string,
    taskType: string,
    promptId: string,
    promptVersion: number,
  ): 'verified' | 'limited' | 'unverified' {
    const row = database
      .prepare(
        `SELECT status
           FROM model_support_profiles
          WHERE provider_id = ? AND model = ? AND task_type = ?
            AND prompt_id = ? AND prompt_version = ?
          ORDER BY updated_at DESC
          LIMIT 1`,
      )
      .get(providerId, model, taskType, promptId, promptVersion);
    return row && ['verified', 'limited'].includes(String(row.status))
      ? (String(row.status) as 'verified' | 'limited')
      : 'unverified';
  }

  #rebuildChapter(
    database: ProjectDatabase,
    projectId: string,
    chapterId: string,
    now: string,
    state: RebuildState,
  ): DigestScopeResult | null {
    const row = database
      .prepare(
        `SELECT chapter.id AS chapterId, chapter.title AS chapterTitle,
                volume.id AS volumeId, volume.title AS volumeTitle,
                chapter.final_version_id AS finalVersionId,
                version.content_hash AS contentHash, version.word_count AS wordCount
           FROM chapters chapter
           JOIN volumes volume ON volume.id = chapter.volume_id
           LEFT JOIN versions version ON version.id = chapter.final_version_id
          WHERE chapter.id = ? AND volume.project_id = ?
            AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL`,
      )
      .get(chapterId, projectId) as ChapterDigestScopeRow | undefined;
    if (!row) {
      throw new LongformAiServiceError('LONGFORM_SCOPE_NOT_FOUND', 'Chapter scope not found.');
    }
    if (!row.finalVersionId || !row.contentHash) {
      state.skippedUnfinalizedChapters += 1;
      database
        .prepare(
          `UPDATE story_digests SET freshness = 'stale', updated_at = ?
            WHERE project_id = ? AND scope_type = 'chapter' AND scope_id = ?`,
        )
        .run(now, projectId, chapterId);
      return null;
    }
    const blocks = versionBlocks(database, row.finalVersionId);
    const excerpt = boundedExcerpt(blocks.map((block) => block.text));
    const content = [
      `章节：${row.chapterTitle}`,
      `所属卷：${row.volumeTitle}`,
      `定稿字数：${Number(row.wordCount ?? 0)}`,
      excerpt ? `关键内容：\n${excerpt}` : '关键内容：本章定稿为空。',
    ].join('\n');
    const digest = this.#upsertDigest(database, {
      projectId,
      scopeType: 'chapter',
      scopeId: chapterId,
      sourceHash: sha256(stableSerialize({ versionId: row.finalVersionId, hash: row.contentHash })),
      sourceVersionIds: [row.finalVersionId],
      content,
      now,
    });
    state.rebuilt.set(`chapter:${chapterId}`, digest);
    return { digest, volumeId: row.volumeId };
  }

  #rebuildVolume(
    database: ProjectDatabase,
    projectId: string,
    volumeId: string,
    now: string,
    state: RebuildState,
    forceChildren: boolean,
  ): StoryDigest {
    const volume = database
      .prepare(
        `SELECT id, title FROM volumes
          WHERE id = ? AND project_id = ? AND deleted_at IS NULL`,
      )
      .get(volumeId, projectId);
    if (!volume) {
      throw new LongformAiServiceError('LONGFORM_SCOPE_NOT_FOUND', 'Volume scope not found.');
    }
    const chapters = database
      .prepare(
        `SELECT chapter.id, chapter.final_version_id AS finalVersionId,
                digest.freshness AS digestFreshness
           FROM chapters chapter
           LEFT JOIN story_digests digest
             ON digest.project_id = ? AND digest.scope_type = 'chapter'
            AND digest.scope_id = chapter.id
          WHERE chapter.volume_id = ? AND chapter.deleted_at IS NULL
          ORDER BY chapter.order_key, chapter.id`,
      )
      .all(projectId, volumeId);
    for (const chapter of chapters) {
      if (!chapter.finalVersionId) {
        state.skippedUnfinalizedChapters += 1;
        continue;
      }
      if (forceChildren || chapter.digestFreshness !== 'fresh') {
        this.#rebuildChapter(database, projectId, String(chapter.id), now, state);
      }
    }
    const chapterDigests = database
      .prepare(
        `${digestSelect(
          `project_id = ? AND scope_type = 'chapter' AND freshness = 'fresh'
           AND scope_id IN (
             SELECT id FROM chapters
              WHERE volume_id = ? AND deleted_at IS NULL AND final_version_id IS NOT NULL
           )`,
        )}
         ORDER BY (
           SELECT chapter.order_key FROM chapters chapter WHERE chapter.id = story_digests.scope_id
         ), scope_id`,
      )
      .all(projectId, volumeId) as unknown as DigestRow[];
    const mapped = chapterDigests.map(digestFromRow);
    const sourceVersionIds = mapped.flatMap((digest) => digest.sourceVersionIds);
    const content = [
      `卷：${String(volume.title)}`,
      `已纳入章节：${mapped.length}`,
      ...mapped.map((digest, index) => `第 ${index + 1} 项\n${digest.content.slice(0, 1_600)}`),
    ]
      .join('\n\n')
      .slice(0, 200_000);
    const digest = this.#upsertDigest(database, {
      projectId,
      scopeType: 'volume',
      scopeId: volumeId,
      sourceHash: sha256(
        stableSerialize(mapped.map((item) => ({ id: item.scopeId, hash: item.sourceHash }))),
      ),
      sourceVersionIds,
      content,
      now,
    });
    state.rebuilt.set(`volume:${volumeId}`, digest);
    return digest;
  }

  #rebuildProject(
    database: ProjectDatabase,
    projectId: string,
    now: string,
    state: RebuildState,
    forceChildren: boolean,
  ): StoryDigest {
    const project = database.prepare('SELECT name FROM projects WHERE id = ?').get(projectId);
    if (!project) {
      throw new LongformAiServiceError('LONGFORM_SCOPE_NOT_FOUND', 'Project scope not found.');
    }
    const volumes = database
      .prepare(
        `SELECT volume.id, digest.freshness AS digestFreshness
           FROM volumes volume
           LEFT JOIN story_digests digest
             ON digest.project_id = volume.project_id AND digest.scope_type = 'volume'
            AND digest.scope_id = volume.id
          WHERE volume.project_id = ? AND volume.deleted_at IS NULL
          ORDER BY volume.order_key, volume.id`,
      )
      .all(projectId);
    for (const volume of volumes) {
      if (forceChildren || volume.digestFreshness !== 'fresh') {
        this.#rebuildVolume(database, projectId, String(volume.id), now, state, forceChildren);
      }
    }
    const volumeDigests = database
      .prepare(
        `${digestSelect(
          `project_id = ? AND scope_type = 'volume' AND freshness = 'fresh'
           AND scope_id IN (
             SELECT id FROM volumes WHERE project_id = ? AND deleted_at IS NULL
           )`,
        )}
         ORDER BY (
           SELECT volume.order_key FROM volumes volume WHERE volume.id = story_digests.scope_id
         ), scope_id`,
      )
      .all(projectId, projectId) as unknown as DigestRow[];
    const mapped = volumeDigests.map(digestFromRow);
    const digest = this.#upsertDigest(database, {
      projectId,
      scopeType: 'project',
      scopeId: projectId,
      sourceHash: sha256(
        stableSerialize(mapped.map((item) => ({ id: item.scopeId, hash: item.sourceHash }))),
      ),
      sourceVersionIds: mapped.flatMap((item) => item.sourceVersionIds),
      content: [
        `作品：${String(project.name)}`,
        `已纳入卷：${mapped.length}`,
        ...mapped.map((item, index) => `第 ${index + 1} 卷摘要\n${item.content.slice(0, 8_000)}`),
      ]
        .join('\n\n')
        .slice(0, 200_000),
      now,
    });
    state.rebuilt.set(`project:${projectId}`, digest);
    return digest;
  }

  #upsertDigest(
    database: ProjectDatabase,
    input: {
      readonly projectId: string;
      readonly scopeType: 'chapter' | 'volume' | 'project';
      readonly scopeId: string;
      readonly sourceHash: string;
      readonly sourceVersionIds: readonly string[];
      readonly content: string;
      readonly now: string;
    },
  ): StoryDigest {
    const existing = database
      .prepare(`${digestSelect('project_id = ? AND scope_type = ? AND scope_id = ?')} LIMIT 1`)
      .get(input.projectId, input.scopeType, input.scopeId) as DigestRow | undefined;
    const unchanged =
      existing?.sourceHash === input.sourceHash &&
      existing.content === input.content &&
      existing.freshness === 'fresh';
    const semanticRevision = existing ? Number(existing.semanticRevision) + (unchanged ? 0 : 1) : 1;
    const generatedAt = unchanged ? existing.generatedAt : input.now;
    const id = existing?.id ?? this.#idFactory();
    database
      .prepare(
        `INSERT INTO story_digests(
           id, project_id, scope_type, scope_id, source_hash,
           source_version_ids_json, semantic_revision, freshness, content,
           generation_source, generated_at, updated_at
         ) VALUES(?, ?, ?, ?, ?, ?, ?, 'fresh', ?, 'local_extractive_v1', ?, ?)
         ON CONFLICT(project_id, scope_type, scope_id) DO UPDATE SET
           source_hash = excluded.source_hash,
           source_version_ids_json = excluded.source_version_ids_json,
           semantic_revision = excluded.semantic_revision,
           freshness = 'fresh',
           content = excluded.content,
           generation_source = excluded.generation_source,
           generated_at = excluded.generated_at,
           updated_at = excluded.updated_at`,
      )
      .run(
        id,
        input.projectId,
        input.scopeType,
        input.scopeId,
        input.sourceHash,
        JSON.stringify([...new Set(input.sourceVersionIds)]),
        semanticRevision,
        input.content,
        generatedAt,
        input.now,
      );
    const row = database
      .prepare(`${digestSelect('project_id = ? AND scope_type = ? AND scope_id = ?')} LIMIT 1`)
      .get(input.projectId, input.scopeType, input.scopeId) as DigestRow | undefined;
    if (!row) {
      throw new LongformAiServiceError(
        'LONGFORM_DIGEST_FAILED',
        'The rebuilt StoryDigest was not persisted.',
      );
    }
    return digestFromRow(row);
  }
}
