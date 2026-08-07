import { chapterPosition } from '../continuity-validation.js';
import {
  authorOnly,
  mapSnapshot,
  parseJson,
  type SnapshotRow,
  type StateProposalServiceContext,
  StateProposalServiceError,
  type VersionSourceRow,
} from './state-row-mappers.js';
import {
  type EndingSnapshot,
  type EndingSnapshotContent,
  EndingSnapshotContentSchema,
  type EndingSnapshotReadInput,
  EndingSnapshotReadInputSchema,
  type EndingSnapshotReadResult,
  EndingSnapshotReadResultSchema,
  type EndingSnapshotRefreshInput,
  EndingSnapshotRefreshInputSchema,
} from '@worldforge/contracts';
import { compareChapterPosition } from '@worldforge/domain';
import { type DatabaseSync } from 'node:sqlite';

export type ChapterPosition = ReturnType<typeof chapterPosition>;

export type HistoricalForeshadowingStatus =
  'planted' | 'reinforced' | 'partially_revealed' | 'revealed';

export interface ForeshadowingEventRow {
  readonly id: string;
  readonly chapterId: string;
  readonly role: 'plant' | 'reinforce' | 'partial_reveal' | 'reveal';
}

export function assertFinalVersion(
  connection: DatabaseSync,
  projectId: string,
  chapterId: string,
  sourceVersionId: string,
): void {
  const row = connection
    .prepare(
      `SELECT c.final_version_id AS finalVersionId
         FROM versions version
         JOIN chapters c ON c.id = version.chapter_id
         JOIN volumes volume ON volume.id = c.volume_id
        WHERE version.id = ? AND version.chapter_id = ? AND volume.project_id = ?
          AND c.deleted_at IS NULL AND volume.deleted_at IS NULL`,
    )
    .get(sourceVersionId, chapterId, projectId) as VersionSourceRow | undefined;
  if (!row) {
    throw new StateProposalServiceError(
      'STATE_PROPOSAL_NOT_FOUND',
      'The finalized source Version was not found in this chapter and project.',
    );
  }
  if (row.finalVersionId !== sourceVersionId) {
    throw new StateProposalServiceError(
      'STATE_PROPOSAL_CONFLICT',
      'State proposals must use the chapter current final Version.',
    );
  }
}

export function chapterPositions(
  connection: DatabaseSync,
  projectId: string,
): ReadonlyMap<string, ChapterPosition> {
  const rows = connection
    .prepare(
      `SELECT c.id AS chapterId, volume.order_key AS volumeOrder,
              c.order_key AS chapterOrder
         FROM chapters c
         JOIN volumes volume ON volume.id = c.volume_id
        WHERE volume.project_id = ?
          AND c.deleted_at IS NULL AND volume.deleted_at IS NULL`,
    )
    .all(projectId) as unknown as {
    readonly chapterId: string;
    readonly volumeOrder: number | bigint;
    readonly chapterOrder: number | bigint;
  }[];
  return new Map(
    rows.map((row) => [
      row.chapterId,
      [Number(row.volumeOrder), Number(row.chapterOrder)] as ChapterPosition,
    ]),
  );
}

export function requiredPosition(
  positions: ReadonlyMap<string, ChapterPosition>,
  chapterId: string,
): ChapterPosition {
  const position = positions.get(chapterId);
  if (!position) {
    throw new StateProposalServiceError(
      'STATE_PROPOSAL_INVARIANT',
      'EndingSnapshot references a Chapter outside the active project structure.',
    );
  }
  return position;
}

export function effectiveAt(
  positions: ReadonlyMap<string, ChapterPosition>,
  target: ChapterPosition,
  startChapterId: string,
  endChapterId: string | null,
): boolean {
  const start = requiredPosition(positions, startChapterId);
  if (compareChapterPosition(start, target) > 0) return false;
  if (!endChapterId) return true;
  return compareChapterPosition(target, requiredPosition(positions, endChapterId)) < 0;
}

export const foreshadowingRole = {
  plant: { status: 'planted', rank: 1 },
  reinforce: { status: 'reinforced', rank: 2 },
  partial_reveal: { status: 'partially_revealed', rank: 3 },
  reveal: { status: 'revealed', rank: 4 },
} as const satisfies Record<
  ForeshadowingEventRow['role'],
  {
    readonly status: HistoricalForeshadowingStatus;
    readonly rank: number;
  }
>;

export function historicalForeshadowings(
  connection: DatabaseSync,
  projectId: string,
  positions: ReadonlyMap<string, ChapterPosition>,
  target: ChapterPosition,
): Array<{
  readonly id: string;
  readonly status: HistoricalForeshadowingStatus;
}> {
  const rows = connection
    .prepare(
      `SELECT f.id, link.chapter_id AS chapterId, link.role
         FROM foreshadowings f
         JOIN foreshadowing_chapters link ON link.foreshadowing_id = f.id
        WHERE f.project_id = ?
          AND link.role IN ('plant', 'reinforce', 'partial_reveal', 'reveal')
        ORDER BY f.id, link.chapter_id, link.role`,
    )
    .all(projectId) as unknown as ForeshadowingEventRow[];
  const latest = new Map<
    string,
    {
      readonly position: ChapterPosition;
      readonly rank: number;
      readonly status: HistoricalForeshadowingStatus;
    }
  >();
  for (const row of rows) {
    const position = requiredPosition(positions, row.chapterId);
    if (compareChapterPosition(position, target) > 0) continue;
    const event = foreshadowingRole[row.role];
    const current = latest.get(row.id);
    const ordering = current ? compareChapterPosition(position, current.position) : 1;
    if (!current || ordering > 0 || (ordering === 0 && event.rank > current.rank)) {
      latest.set(row.id, { position, rank: event.rank, status: event.status });
    }
  }
  return [...latest.entries()]
    .sort(([left], [right]) => left.localeCompare(right, 'en'))
    .map(([id, event]) => ({ id, status: event.status }));
}

export function historicalArcMilestones(
  connection: DatabaseSync,
  projectId: string,
  positions: ReadonlyMap<string, ChapterPosition>,
  target: ChapterPosition,
) {
  const rows = connection
    .prepare(
      `SELECT id, status, planned_chapter_id AS plannedChapterId,
              actual_chapter_id AS actualChapterId
         FROM arc_milestones
        WHERE project_id = ? AND status IN ('hit', 'skipped')
        ORDER BY id`,
    )
    .all(projectId) as unknown as {
    readonly id: string;
    readonly status: 'hit' | 'skipped';
    readonly plannedChapterId: string | null;
    readonly actualChapterId: string | null;
  }[];
  return rows
    .filter((row) => {
      const effectiveChapterId = row.actualChapterId ?? row.plannedChapterId;
      return (
        effectiveChapterId !== null &&
        compareChapterPosition(requiredPosition(positions, effectiveChapterId), target) <= 0
      );
    })
    .map(({ id, status, actualChapterId }) => ({ id, status, actualChapterId }));
}

export function snapshotContent(
  connection: DatabaseSync,
  projectId: string,
  chapterId: string,
): EndingSnapshotContent {
  const target = chapterPosition(connection, projectId, chapterId);
  const positions = chapterPositions(connection, projectId);
  const entityRows = connection
    .prepare(
      `SELECT entity_id AS entityId, state_key AS stateKey, value_json AS valueJson,
              source_version_id AS sourceVersionId,
              valid_from_chapter_id AS validFromChapterId,
              valid_until_chapter_id AS validUntilChapterId
         FROM entity_states
        WHERE project_id = ? AND record_status = 'current'
        ORDER BY entity_id, state_key`,
    )
    .all(projectId) as unknown as {
    readonly entityId: string;
    readonly stateKey: string;
    readonly valueJson: string;
    readonly sourceVersionId: string;
    readonly validFromChapterId: string;
    readonly validUntilChapterId: string | null;
  }[];
  const knowledgeRows = connection
    .prepare(
      `SELECT character_id AS characterId, information_key AS informationKey,
              knowledge_status AS knowledgeStatus,
              valid_from_chapter_id AS validFromChapterId,
              valid_until_chapter_id AS validUntilChapterId
         FROM knowledge_states
        WHERE project_id = ? AND record_status = 'current'
        ORDER BY character_id, information_key`,
    )
    .all(projectId) as unknown as {
    readonly characterId: string;
    readonly informationKey: string;
    readonly knowledgeStatus: string;
    readonly validFromChapterId: string;
    readonly validUntilChapterId: string | null;
  }[];
  return EndingSnapshotContentSchema.parse({
    entityStates: entityRows
      .filter((row) =>
        effectiveAt(positions, target, row.validFromChapterId, row.validUntilChapterId),
      )
      .map((row) => ({
        entityId: row.entityId,
        stateKey: row.stateKey,
        value: parseJson(row.valueJson),
        sourceVersionId: row.sourceVersionId,
      })),
    knowledgeStates: knowledgeRows
      .filter((row) =>
        effectiveAt(positions, target, row.validFromChapterId, row.validUntilChapterId),
      )
      .map((row) => ({
        characterId: row.characterId,
        informationKey: row.informationKey,
        knowledgeStatus: row.knowledgeStatus,
      })),
    foreshadowings: historicalForeshadowings(connection, projectId, positions, target),
    arcMilestones: historicalArcMilestones(connection, projectId, positions, target),
  });
}

export function snapshotRow(
  connection: DatabaseSync,
  projectId: string,
  chapterId: string,
  sourceVersionId: string,
  now: string,
  idFactory: () => string,
): EndingSnapshot {
  assertFinalVersion(connection, projectId, chapterId, sourceVersionId);
  const content = snapshotContent(connection, projectId, chapterId);
  const existing = connection
    .prepare(
      `SELECT id FROM ending_snapshots
        WHERE project_id = ? AND chapter_id = ? AND source_version_id = ?`,
    )
    .get(projectId, chapterId, sourceVersionId) as
    | {
        readonly id: string;
      }
    | undefined;
  const id = existing?.id ?? idFactory();
  if (existing) {
    connection
      .prepare(
        `UPDATE ending_snapshots
            SET status = 'valid', content_json = ?, stale_reasons_json = '[]',
                created_at = ?, stale_at = NULL
          WHERE id = ? AND project_id = ?`,
      )
      .run(JSON.stringify(content), now, id, projectId);
  } else {
    connection
      .prepare(
        `INSERT INTO ending_snapshots(
           id, project_id, chapter_id, source_version_id, status,
           content_json, stale_reasons_json, created_at, stale_at
         ) VALUES(?, ?, ?, ?, 'valid', ?, '[]', ?, NULL)`,
      )
      .run(id, projectId, chapterId, sourceVersionId, JSON.stringify(content), now);
  }
  const row = connection
    .prepare(
      `SELECT id, project_id AS projectId, chapter_id AS chapterId,
              source_version_id AS sourceVersionId, status,
              content_json AS contentJson, stale_reasons_json AS staleReasonsJson,
              created_at AS createdAt, stale_at AS staleAt
         FROM ending_snapshots WHERE id = ? AND project_id = ?`,
    )
    .get(id, projectId) as SnapshotRow | undefined;
  if (!row) {
    throw new StateProposalServiceError(
      'STATE_PROPOSAL_INVARIANT',
      'EndingSnapshot was not persisted.',
    );
  }
  return mapSnapshot(row);
}

export function refreshSnapshot(
  context: StateProposalServiceContext,
  requestId: string,
  raw: EndingSnapshotRefreshInput,
): Promise<EndingSnapshot> {
  const input = EndingSnapshotRefreshInputSchema.parse(raw);
  authorOnly(input.authority);
  return context.workspace.writeProject(requestId, input.projectId, (connection) =>
    snapshotRow(
      connection,
      input.projectId,
      input.chapterId,
      input.sourceVersionId,
      context.clock.now().toISOString(),
      context.idFactory,
    ),
  );
}

export function readSnapshot(
  context: StateProposalServiceContext,
  raw: EndingSnapshotReadInput,
): EndingSnapshotReadResult {
  const input = EndingSnapshotReadInputSchema.parse(raw);
  return context.workspace.readProject(input.projectId, (connection) => {
    chapterPosition(connection, input.projectId, input.chapterId);
    const row = connection
      .prepare(
        `SELECT id, project_id AS projectId, chapter_id AS chapterId,
                  source_version_id AS sourceVersionId, status,
                  content_json AS contentJson, stale_reasons_json AS staleReasonsJson,
                  created_at AS createdAt, stale_at AS staleAt
             FROM ending_snapshots
            WHERE project_id = ? AND chapter_id = ? AND status = 'valid'
            ORDER BY created_at DESC, id DESC LIMIT 1`,
      )
      .get(input.projectId, input.chapterId) as SnapshotRow | undefined;
    if (row) {
      const snapshot = mapSnapshot(row);
      return EndingSnapshotReadResultSchema.parse({
        projectId: input.projectId,
        chapterId: input.chapterId,
        snapshotSource: 'snapshot',
        snapshot,
        content: snapshot.content,
      });
    }
    return EndingSnapshotReadResultSchema.parse({
      projectId: input.projectId,
      chapterId: input.chapterId,
      snapshotSource: 'fallback_live_query',
      snapshot: null,
      content: snapshotContent(connection, input.projectId, input.chapterId),
    });
  });
}
