import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import {
  DraftBlockAttributesSchema,
  type CandidateBlockInput,
  type ChapterGenerationSource,
  type MergeRangeAnchor,
  type MergeSourceMapping,
  type RequiredBeat,
  type ResolvedChapterGenerationSource,
  type RewriteSelectionAnchor,
} from '@worldforge/contracts';

import { draftContentHash } from './draft.js';
import type { CandidateService } from './candidate.js';
import type {
  GenerationCandidateSourceMappingInput,
  GenerationInputSourceInput,
} from './generation-run.js';
import type { ProjectWorkspaceService } from './project-workspace.js';
import { sqliteResult } from './database/sqlite-result.js';

export type GenerationSourceResolverErrorCode =
  | 'GENERATION_SOURCE_NOT_FOUND'
  | 'GENERATION_SOURCE_STALE'
  | 'GENERATION_SOURCE_INVALID'
  | 'GENERATION_SOURCE_LOCKED';

export class GenerationSourceResolverError extends Error {
  readonly code: GenerationSourceResolverErrorCode;

  constructor(code: GenerationSourceResolverErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'GenerationSourceResolverError';
    this.code = code;
  }
}

interface DraftBlockRow {
  readonly logicalBlockId: string;
  readonly blockType: CandidateBlockInput['blockType'];
  readonly text: string;
  readonly attributesJson: string;
  readonly contentHash: string | null;
  readonly locked: number | bigint;
  readonly orderKey: number | bigint;
}

interface SceneBeatRow {
  readonly id: string;
  readonly title: string;
  readonly goal: string;
  readonly coreConflict: string;
  readonly expectedResult: string;
  readonly orderKey: number | bigint;
}

interface DraftSnapshot {
  readonly draftId: string;
  readonly revision: number;
  readonly blocks: readonly ResolvedDraftBlock[];
}

interface ResolvedDraftBlock {
  readonly logicalBlockId: string;
  readonly blockType: CandidateBlockInput['blockType'];
  readonly text: string;
  readonly attributes: CandidateBlockInput['attributes'];
  readonly contentHash: string;
  readonly locked: boolean;
}

export interface ResolvedSkeletonSource {
  readonly requiredBeats: readonly RequiredBeat[];
  readonly inputSources: readonly GenerationInputSourceInput[];
}

export interface ResolvedChapterSource {
  readonly source: ResolvedChapterGenerationSource;
  readonly inputSources: readonly GenerationInputSourceInput[];
}

export interface ResolvedRewriteSource {
  readonly sourceText: string;
  readonly inputSources: readonly GenerationInputSourceInput[];
  readonly sourceMappings: readonly GenerationCandidateSourceMappingInput[];
  readonly buildBlocks: (replacement: string) => readonly CandidateBlockInput[];
}

export interface ResolvedMergeSource {
  readonly sources: ReadonlyArray<{ readonly candidateId: string; readonly text: string }>;
  readonly inputSources: readonly GenerationInputSourceInput[];
  readonly sourceMappings: readonly GenerationCandidateSourceMappingInput[];
}

export interface ResolvedFinalVersionSource {
  readonly versionId: string;
  readonly blocks: ReadonlyArray<{
    readonly logicalBlockId: string;
    readonly content: string;
    readonly contentHash: string;
  }>;
  readonly inputSources: readonly GenerationInputSourceInput[];
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function noSplitSurrogate(text: string, position: number): boolean {
  if (position <= 0 || position >= text.length) return true;
  const previous = text.charCodeAt(position - 1);
  const current = text.charCodeAt(position);
  return !(previous >= 0xd800 && previous <= 0xdbff && current >= 0xdc00 && current <= 0xdfff);
}

function draftSnapshot(
  database: DatabaseSync,
  projectId: string,
  chapterId: string,
): DraftSnapshot {
  const draft = database
    .prepare(
      `SELECT draft.id AS draftId, draft.revision
         FROM drafts draft
         JOIN chapters chapter ON chapter.id = draft.chapter_id
         JOIN volumes volume ON volume.id = chapter.volume_id
        WHERE chapter.id = ? AND volume.project_id = ?
          AND chapter.active_draft_id = draft.id AND draft.status = 'active'
          AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL`,
    )
    .get(chapterId, projectId) as
    { readonly draftId: string; readonly revision: number | bigint } | undefined;
  if (!draft) {
    throw new GenerationSourceResolverError(
      'GENERATION_SOURCE_NOT_FOUND',
      'The active Draft was not found.',
    );
  }
  const rows = sqliteResult<DraftBlockRow[]>(
    database
      .prepare(
        `SELECT logical_block_id AS logicalBlockId, block_type AS blockType, text,
              attributes_json AS attributesJson, content_hash AS contentHash,
              locked, order_key AS orderKey
         FROM draft_blocks
        WHERE draft_id = ?
        ORDER BY order_key, id`,
      )
      .all(draft.draftId),
  );
  return {
    draftId: draft.draftId,
    revision: Number(draft.revision),
    blocks: rows.map((row) => {
      try {
        const attributes = DraftBlockAttributesSchema.parse(JSON.parse(row.attributesJson));
        return {
          logicalBlockId: row.logicalBlockId,
          blockType: row.blockType,
          text: row.text,
          attributes,
          contentHash:
            row.contentHash ??
            draftContentHash({
              blockType: row.blockType,
              content: row.text,
              attributes,
            }),
          locked: Number(row.locked) === 1,
        };
      } catch (error) {
        throw new GenerationSourceResolverError(
          'GENERATION_SOURCE_INVALID',
          'A Draft block used for generation is invalid.',
          { cause: error },
        );
      }
    }),
  };
}

function sceneBeats(
  database: DatabaseSync,
  projectId: string,
  chapterId: string,
  ids: readonly string[],
): SceneBeatRow[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const rows = sqliteResult<SceneBeatRow[]>(
    database
      .prepare(
        `SELECT id, title, goal, core_conflict AS coreConflict,
              expected_result AS expectedResult, order_key AS orderKey
         FROM scene_beats
        WHERE project_id = ? AND chapter_id = ? AND deleted_at IS NULL
          AND id IN (${placeholders})
        ORDER BY order_key, id`,
      )
      .all(projectId, chapterId, ...ids),
  );
  if (rows.length !== new Set(ids).size) {
    throw new GenerationSourceResolverError(
      'GENERATION_SOURCE_NOT_FOUND',
      'One or more SceneBeat sources were not found in the active chapter.',
    );
  }
  return rows;
}

function requiredBeat(row: SceneBeatRow): RequiredBeat {
  return {
    beatId: row.id,
    event: [row.title, row.goal, row.coreConflict, row.expectedResult].filter(Boolean).join('；'),
  };
}

function blockInput(block: ResolvedDraftBlock, text = block.text): CandidateBlockInput {
  return {
    logicalBlockId: block.logicalBlockId,
    sourceLogicalBlockIds: [block.logicalBlockId],
    blockType: block.blockType,
    text,
    attributes: block.attributes,
    sourceBlockHash: block.contentHash,
  };
}

function anchoredText(
  text: string,
  logicalBlockId: string,
  contentHash: string,
  anchor: MergeRangeAnchor,
): string {
  if (anchor.logicalBlockId !== logicalBlockId || anchor.expectedBlockHash !== contentHash) {
    throw new GenerationSourceResolverError(
      'GENERATION_SOURCE_STALE',
      'A merge range anchor no longer matches its source block.',
    );
  }
  if (
    anchor.selectionEnd > text.length ||
    !noSplitSurrogate(text, anchor.selectionStart) ||
    !noSplitSurrogate(text, anchor.selectionEnd)
  ) {
    throw new GenerationSourceResolverError(
      'GENERATION_SOURCE_INVALID',
      'A merge range is outside a Unicode text boundary.',
    );
  }
  const selected = text.slice(anchor.selectionStart, anchor.selectionEnd);
  if (sha256(selected) !== anchor.selectedTextHash) {
    throw new GenerationSourceResolverError(
      'GENERATION_SOURCE_STALE',
      'A merge range selection changed.',
    );
  }
  return selected;
}

export class GenerationSourceResolver {
  readonly #workspace: ProjectWorkspaceService;
  readonly #candidates: CandidateService;

  constructor(workspace: ProjectWorkspaceService, candidates: CandidateService) {
    this.#workspace = workspace;
    this.#candidates = candidates;
  }

  resolveSkeleton(
    projectId: string,
    chapterId: string,
    requiredSceneBeatIds: readonly string[],
    chapterGoal: string,
  ): ResolvedSkeletonSource {
    return this.#workspace.readProject(projectId, (database) => {
      const beats = sceneBeats(database, projectId, chapterId, requiredSceneBeatIds);
      return {
        requiredBeats: beats.map(requiredBeat),
        inputSources: [
          {
            sourceType: 'chapter_goal',
            sourceId: chapterId,
            sourceOrder: 0,
            contentHash: sha256(chapterGoal),
          },
          ...beats.map((beat, index) => ({
            sourceType: 'scene_beat' as const,
            sourceId: beat.id,
            sourceOrder: index + 1,
            contentHash: sha256(JSON.stringify(requiredBeat(beat))),
          })),
        ],
      };
    });
  }

  resolveChapter(
    projectId: string,
    chapterId: string,
    source: ChapterGenerationSource,
  ): ResolvedChapterSource {
    if (source.sourceType === 'skeleton_candidate') {
      const candidate = this.#candidates.get({
        projectId,
        chapterId,
        candidateId: source.selectedSkeletonCandidateId,
      });
      if (candidate.candidateType !== 'skeleton' || candidate.status === 'discarded') {
        throw new GenerationSourceResolverError(
          'GENERATION_SOURCE_INVALID',
          'The selected T1 source is not an available Skeleton Candidate.',
        );
      }
      if (candidate.sourceState === 'stale' && !source.acknowledgeStaleSource) {
        throw new GenerationSourceResolverError(
          'GENERATION_SOURCE_STALE',
          'The selected Skeleton source changed and requires explicit author acknowledgement.',
        );
      }
      return {
        source: {
          sourceType: 'skeleton_candidate',
          selectedSkeletonCandidateId: candidate.candidateId,
          beats: candidate.structuredPayload.beats.map((beat) => ({
            beatId: beat.beatId,
            event: beat.event,
          })),
        },
        inputSources: [
          {
            sourceType: 'skeleton_candidate',
            sourceId: candidate.candidateId,
            sourceOrder: 0,
            contentHash: candidate.contentHash,
            metadata: {
              acknowledgedStaleSource:
                candidate.sourceState === 'stale' && source.acknowledgeStaleSource,
              skeletonRevisionId: candidate.skeletonRevisionId,
            },
          },
        ],
      };
    }
    if (source.sourceType === 'canonical_scene_beats') {
      return this.#workspace.readProject(projectId, (database) => {
        const beats = sceneBeats(database, projectId, chapterId, source.sceneBeatIds);
        return {
          source: {
            sourceType: 'canonical_scene_beats',
            sceneBeatIds: beats.map((beat) => beat.id),
            beats: beats.map(requiredBeat),
          },
          inputSources: beats.map((beat, index) => ({
            sourceType: 'scene_beat' as const,
            sourceId: beat.id,
            sourceOrder: index,
            contentHash: sha256(JSON.stringify(requiredBeat(beat))),
          })),
        };
      });
    }
    return {
      source,
      inputSources: [
        {
          sourceType: 'chapter_goal',
          sourceId: chapterId,
          sourceOrder: 0,
          contentHash: sha256(source.chapterGoal),
        },
      ],
    };
  }

  resolveRewrite(
    projectId: string,
    chapterId: string,
    baseDraftId: string | null,
    baseDraftRevision: number | null,
    scope:
      | { readonly scopeType: 'selection'; readonly anchor: RewriteSelectionAnchor }
      | {
          readonly scopeType: 'blocks';
          readonly logicalBlockIds: readonly string[];
          readonly expectedBlockHashes: readonly string[];
        },
  ): ResolvedRewriteSource {
    return this.#workspace.readProject(projectId, (database) => {
      const draft = draftSnapshot(database, projectId, chapterId);
      if (draft.draftId !== baseDraftId || draft.revision !== baseDraftRevision) {
        throw new GenerationSourceResolverError(
          'GENERATION_SOURCE_STALE',
          'The Draft changed before rewrite generation started.',
        );
      }
      if (scope.scopeType === 'selection') {
        const anchor = scope.anchor;
        if (
          anchor.projectId !== projectId ||
          anchor.chapterId !== chapterId ||
          anchor.draftId !== draft.draftId ||
          anchor.baseRevision !== draft.revision
        ) {
          throw new GenerationSourceResolverError(
            'GENERATION_SOURCE_STALE',
            'The rewrite selection anchor is outside the active Draft.',
          );
        }
        const index = draft.blocks.findIndex(
          (block) => block.logicalBlockId === anchor.logicalBlockId,
        );
        const block = draft.blocks[index];
        if (!block || block.contentHash !== anchor.expectedBlockHash) {
          throw new GenerationSourceResolverError(
            'GENERATION_SOURCE_STALE',
            'The rewrite source block changed.',
          );
        }
        if (block.locked) {
          throw new GenerationSourceResolverError(
            'GENERATION_SOURCE_LOCKED',
            'Locked content cannot be rewritten.',
          );
        }
        if (
          anchor.selectionEnd > block.text.length ||
          !noSplitSurrogate(block.text, anchor.selectionStart) ||
          !noSplitSurrogate(block.text, anchor.selectionEnd)
        ) {
          throw new GenerationSourceResolverError(
            'GENERATION_SOURCE_INVALID',
            'The rewrite selection is outside a Unicode text boundary.',
          );
        }
        const selected = block.text.slice(anchor.selectionStart, anchor.selectionEnd);
        if (sha256(selected) !== anchor.selectedTextHash) {
          throw new GenerationSourceResolverError(
            'GENERATION_SOURCE_STALE',
            'The rewrite selection text changed.',
          );
        }
        return {
          sourceText: selected,
          inputSources: [
            {
              sourceType: 'draft_block',
              sourceId: block.logicalBlockId,
              sourceOrder: 0,
              contentHash: block.contentHash,
              metadata: {
                selectionStart: anchor.selectionStart,
                selectionEnd: anchor.selectionEnd,
                selectedTextHash: anchor.selectedTextHash,
              },
            },
          ],
          sourceMappings: [
            {
              mappingType: 'rewrite',
              sourceUnitId: block.logicalBlockId,
              sourceOrder: 0,
              sourceBlockIds: [block.logicalBlockId],
              keepCurrentDraft: true,
              rangeAnchor: anchor,
            },
          ],
          buildBlocks: (replacement) =>
            draft.blocks.map((item, blockIndex) =>
              blockIndex === index
                ? blockInput(
                    item,
                    `${item.text.slice(0, anchor.selectionStart)}${replacement}${item.text.slice(
                      anchor.selectionEnd,
                    )}`,
                  )
                : blockInput(item),
            ),
        };
      }

      const selected = scope.logicalBlockIds.map((logicalBlockId, index) => {
        const block = draft.blocks.find((candidate) => candidate.logicalBlockId === logicalBlockId);
        if (!block || block.contentHash !== scope.expectedBlockHashes[index]) {
          throw new GenerationSourceResolverError(
            'GENERATION_SOURCE_STALE',
            'A structural rewrite source block changed.',
          );
        }
        if (block.locked) {
          throw new GenerationSourceResolverError(
            'GENERATION_SOURCE_LOCKED',
            'Locked content cannot be rewritten.',
          );
        }
        return block;
      });
      return {
        sourceText: selected.map((block) => block.text).join('\n\n'),
        inputSources: selected.map((block, index) => ({
          sourceType: 'draft_block',
          sourceId: block.logicalBlockId,
          sourceOrder: index,
          contentHash: block.contentHash,
        })),
        sourceMappings: selected.map((block, index) => ({
          mappingType: 'rewrite',
          sourceUnitId: block.logicalBlockId,
          sourceOrder: index,
          sourceBlockIds: [block.logicalBlockId],
          keepCurrentDraft: true,
        })),
        buildBlocks: (replacement) => {
          const paragraphs = replacement
            .split(/\n\s*\n/u)
            .map((text) => text.trim())
            .filter(Boolean);
          if (paragraphs.length === 0) {
            throw new GenerationSourceResolverError(
              'GENERATION_SOURCE_INVALID',
              'The structural rewrite returned no prose.',
            );
          }
          const selectedIds = new Set(scope.logicalBlockIds);
          const firstIndex = draft.blocks.findIndex((block) =>
            selectedIds.has(block.logicalBlockId),
          );
          return draft.blocks.flatMap((block, index) => {
            if (!selectedIds.has(block.logicalBlockId)) return [blockInput(block)];
            if (index !== firstIndex) return [];
            return paragraphs.map((text, paragraphIndex) => ({
              ...(paragraphIndex === 0
                ? blockInput(block, text)
                : {
                    blockType: 'paragraph' as const,
                    text,
                    attributes: {},
                    sourceLogicalBlockIds: [...scope.logicalBlockIds],
                  }),
            }));
          });
        },
      };
    });
  }

  resolveMerge(
    projectId: string,
    chapterId: string,
    mapping: MergeSourceMapping,
  ): ResolvedMergeSource {
    return this.#workspace.readProject(projectId, (database) => {
      const draft = draftSnapshot(database, projectId, chapterId);
      const sources: Array<{ candidateId: string; text: string }> = [];
      const inputSources: GenerationInputSourceInput[] = [];
      const sourceMappings: GenerationCandidateSourceMappingInput[] = [];
      const draftById = new Map(draft.blocks.map((block) => [block.logicalBlockId, block]));
      const sourceClaims = new Map<
        string,
        Array<{ readonly start: number; readonly end: number }>
      >();
      const claimSources = (
        sourceIdentity: string,
        sourceBlockIds: readonly string[],
        rangeAnchor?: MergeRangeAnchor,
      ): void => {
        if (rangeAnchor && sourceBlockIds.length !== 1) {
          throw new GenerationSourceResolverError(
            'GENERATION_SOURCE_INVALID',
            'A controlled merge range must select exactly one source block.',
          );
        }
        for (const sourceBlockId of sourceBlockIds) {
          const key = `${sourceIdentity}:${sourceBlockId}`;
          const range = rangeAnchor
            ? { start: rangeAnchor.selectionStart, end: rangeAnchor.selectionEnd }
            : { start: 0, end: Number.POSITIVE_INFINITY };
          const existing = sourceClaims.get(key) ?? [];
          if (existing.some((item) => range.start < item.end && item.start < range.end)) {
            throw new GenerationSourceResolverError(
              'GENERATION_SOURCE_INVALID',
              'Merge source blocks and controlled ranges cannot overlap.',
            );
          }
          existing.push(range);
          sourceClaims.set(key, existing);
        }
      };

      const appendDraftSource = (
        sourceUnitId: string,
        sourceOrder: number,
        sourceBlockIds: readonly string[],
        rangeAnchor?: MergeRangeAnchor,
        sceneBeatId?: string,
      ): void => {
        const blocks = sourceBlockIds.map((id) => draftById.get(id));
        if (blocks.length === 0 || blocks.some((block) => !block)) {
          throw new GenerationSourceResolverError(
            'GENERATION_SOURCE_NOT_FOUND',
            'A current Draft source block was not found.',
          );
        }
        claimSources(`draft:${draft.draftId}`, sourceBlockIds, rangeAnchor);
        const text = rangeAnchor
          ? (() => {
              const block = blocks.find(
                (item) => item!.logicalBlockId === rangeAnchor.logicalBlockId,
              );
              if (!block) {
                throw new GenerationSourceResolverError(
                  'GENERATION_SOURCE_NOT_FOUND',
                  'The anchored current Draft block was not selected for merge.',
                );
              }
              return anchoredText(block.text, block.logicalBlockId, block.contentHash, rangeAnchor);
            })()
          : blocks.map((block) => block!.text).join('\n\n');
        sources.push({ candidateId: draft.draftId, text });
        inputSources.push({
          sourceType: 'current_draft',
          sourceId: sourceUnitId,
          sourceOrder,
          contentHash: sha256(text),
        });
        sourceMappings.push({
          mappingType: mapping.mappingType,
          sourceUnitId,
          sourceOrder,
          sourceBlockIds,
          keepCurrentDraft: true,
          ...(sceneBeatId === undefined ? {} : { sceneBeatId }),
          ...(rangeAnchor === undefined ? {} : { rangeAnchor }),
        });
      };

      const appendCandidateSource = (
        sourceUnitId: string,
        sourceOrder: number,
        candidateId: string,
        sourceBlockIds: readonly string[],
        rangeAnchor?: MergeRangeAnchor,
        sceneBeatId?: string,
      ): void => {
        const candidate = this.#candidates.get({ projectId, chapterId, candidateId });
        if (candidate.candidateType === 'skeleton' || candidate.status === 'discarded') {
          throw new GenerationSourceResolverError(
            'GENERATION_SOURCE_INVALID',
            'Only available Prose Candidates can participate in merge.',
          );
        }
        const selected = sourceBlockIds.map((id) =>
          candidate.blocks.find((block) => block.candidateBlockId === id),
        );
        if (selected.some((block) => !block)) {
          throw new GenerationSourceResolverError(
            'GENERATION_SOURCE_NOT_FOUND',
            'A Candidate source block was not found.',
          );
        }
        claimSources(`candidate:${candidateId}`, sourceBlockIds, rangeAnchor);
        const text = rangeAnchor
          ? (() => {
              const block = selected.find(
                (item) => item!.logicalBlockId === rangeAnchor.logicalBlockId,
              );
              if (!block) {
                throw new GenerationSourceResolverError(
                  'GENERATION_SOURCE_NOT_FOUND',
                  'The anchored Candidate block was not selected for merge.',
                );
              }
              return anchoredText(block.text, block.logicalBlockId, block.contentHash, rangeAnchor);
            })()
          : selected.map((block) => block!.text).join('\n\n');
        sources.push({ candidateId, text });
        inputSources.push({
          sourceType: 'candidate',
          sourceId: candidateId,
          sourceOrder,
          contentHash: candidate.contentHash,
        });
        sourceMappings.push({
          mappingType: mapping.mappingType,
          sourceUnitId,
          sourceOrder,
          sourceCandidateId: candidateId,
          sourceBlockIds,
          ...(sceneBeatId === undefined ? {} : { sceneBeatId }),
          ...(rangeAnchor === undefined ? {} : { rangeAnchor }),
        });
      };

      if (mapping.mappingType === 'beat') {
        if (new Set(mapping.units.map((unit) => unit.sceneBeatId)).size !== mapping.units.length) {
          throw new GenerationSourceResolverError(
            'GENERATION_SOURCE_INVALID',
            'Each SceneBeat can appear only once in a merge mapping.',
          );
        }
        const beats = sceneBeats(
          database,
          projectId,
          chapterId,
          mapping.units.map((unit) => unit.sceneBeatId),
        );
        const beatIds = new Set(beats.map((beat) => beat.id));
        for (const [index, unit] of mapping.units.entries()) {
          if (!beatIds.has(unit.sceneBeatId)) {
            throw new GenerationSourceResolverError(
              'GENERATION_SOURCE_NOT_FOUND',
              'A merge SceneBeat was not found.',
            );
          }
          if (unit.keepCurrentDraft) {
            const linked = sqliteResult<
              Array<{
                readonly logicalBlockId: string;
              }>
            >(
              database
                .prepare(
                  `SELECT block.logical_block_id AS logicalBlockId
                   FROM scene_beat_block_links link
                   JOIN draft_blocks block ON block.id = link.draft_block_id
                  WHERE link.scene_beat_id = ? AND block.draft_id = ?
                  ORDER BY block.order_key, block.id`,
                )
                .all(unit.sceneBeatId, draft.draftId),
            );
            appendDraftSource(
              unit.sceneBeatId,
              index,
              linked.map((row) => row.logicalBlockId),
              undefined,
              unit.sceneBeatId,
            );
          } else {
            appendCandidateSource(
              unit.sceneBeatId,
              index,
              unit.sourceCandidateId!,
              unit.sourceBlockIds,
              undefined,
              unit.sceneBeatId,
            );
          }
        }
      } else {
        if (new Set(mapping.units.map((unit) => unit.order)).size !== mapping.units.length) {
          throw new GenerationSourceResolverError(
            'GENERATION_SOURCE_INVALID',
            'Segment merge source order values must be unique.',
          );
        }
        const ordered = [...mapping.units].sort(
          (left, right) =>
            left.order - right.order || left.segmentId.localeCompare(right.segmentId),
        );
        for (const unit of ordered) {
          if (unit.sourceType === 'candidate') {
            appendCandidateSource(
              unit.segmentId,
              unit.order,
              unit.candidateId,
              unit.sourceBlockIds,
              unit.rangeAnchor,
            );
          } else {
            appendDraftSource(unit.segmentId, unit.order, unit.sourceBlockIds, unit.rangeAnchor);
          }
        }
      }
      if (sources.length < 2) {
        throw new GenerationSourceResolverError(
          'GENERATION_SOURCE_INVALID',
          'Merge requires at least two explicit source units.',
        );
      }
      return { sources, inputSources, sourceMappings };
    });
  }

  resolveFinalVersion(
    projectId: string,
    chapterId: string,
    sourceVersionId: string,
  ): ResolvedFinalVersionSource {
    return this.#workspace.readProject(projectId, (database) => {
      const version = database
        .prepare(
          `SELECT version.id AS versionId, version.content_hash AS contentHash
             FROM versions version
             JOIN chapters chapter ON chapter.id = version.chapter_id
             JOIN volumes volume ON volume.id = chapter.volume_id
            WHERE version.id = ? AND chapter.id = ? AND volume.project_id = ?
              AND chapter.final_version_id = version.id
              AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL`,
        )
        .get(sourceVersionId, chapterId, projectId) as
        { readonly versionId: string; readonly contentHash: string } | undefined;
      if (!version) {
        throw new GenerationSourceResolverError(
          'GENERATION_SOURCE_NOT_FOUND',
          'Only the chapter current Final Version can be used for this operation.',
        );
      }
      const blocks = sqliteResult<
        Array<{
          readonly logicalBlockId: string;
          readonly content: string;
          readonly contentHash: string;
        }>
      >(
        database
          .prepare(
            `SELECT logical_block_id AS logicalBlockId, text AS content,
                  content_hash AS contentHash
             FROM version_blocks
            WHERE version_id = ?
            ORDER BY order_key, logical_block_id`,
          )
          .all(sourceVersionId),
      );
      if (
        blocks.length === 0 ||
        blocks.some((block) => !/^[0-9a-f]{64}$/u.test(block.contentHash))
      ) {
        throw new GenerationSourceResolverError(
          'GENERATION_SOURCE_INVALID',
          'The Final Version has no valid persisted body blocks.',
        );
      }
      return {
        versionId: version.versionId,
        blocks,
        inputSources: [
          {
            sourceType: 'version',
            sourceId: version.versionId,
            sourceOrder: 0,
            contentHash: version.contentHash,
            metadata: { final: true, blockCount: blocks.length },
          },
        ],
      };
    });
  }
}
