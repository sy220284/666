import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import type { ResearchReference } from '@worldforge/contracts';

import { sqliteResult } from '../database/sqlite-result.js';
import { stableJson } from '../stable-json.js';
import { GenerationRunServiceError } from './run-repository.js';

const MAX_REFERENCE_COUNT = 20;
const MAX_REFERENCE_CHARS = 16_000;
const MAX_TOTAL_REFERENCE_CHARS = 64_000;

interface ResearchNoteRow {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly sourceUri: string | null;
  readonly tagsJson: string;
}

interface ResearchAttachmentRow {
  readonly id: string;
  readonly displayName: string;
  readonly mediaType: string;
  readonly sizeBytes: number | bigint;
  readonly contentHash: string;
}

interface PersistedResearchReferenceRow {
  readonly sourceType: 'note' | 'attachment';
  readonly sourceId: string;
  readonly sourceOrder: number | bigint;
  readonly contentHash: string;
  readonly snapshotText: string;
  readonly includedChars: number | bigint;
  readonly trimmed: number | bigint;
}

interface ResearchReferenceSetRow {
  readonly selectionHash: string;
}

export interface ResearchReferenceSnapshot {
  readonly sourceType: 'note' | 'attachment';
  readonly sourceId: string;
  readonly sourceOrder: number;
  readonly contentHash: string;
  readonly snapshotText: string;
  readonly includedChars: number;
  readonly trimmed: boolean;
}

function hashText(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function researchReferenceSelectionHash(references: readonly ResearchReference[]): string {
  return hashText(
    stableJson(
      references.map((reference) => ({
        sourceType: reference.sourceType,
        sourceId: reference.sourceId,
      })),
    ),
  );
}

function tags(value: string): string {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
      return parsed.join('、');
    }
  } catch {
    // Fall through to the invariant error below.
  }
  throw new GenerationRunServiceError(
    'GENERATION_BASE_CONFLICT',
    'The selected research note contains invalid stored tags.',
  );
}

function noteSnapshot(database: DatabaseSync, projectId: string, sourceId: string) {
  const row = sqliteResult<ResearchNoteRow | undefined>(
    database
      .prepare(
        `SELECT id, title, body, source_uri AS sourceUri, tags_json AS tagsJson
           FROM research_notes
          WHERE id = ? AND project_id = ?`,
      )
      .get(sourceId, projectId),
  );
  if (!row) {
    throw new GenerationRunServiceError(
      'GENERATION_BASE_CONFLICT',
      'The selected research note is missing or belongs to another project.',
    );
  }
  const text = [
    `研究笔记：${row.title}`,
    row.sourceUri ? `来源：${row.sourceUri}` : '来源：未填写',
    `标签：${tags(row.tagsJson) || '无'}`,
    '正文：',
    row.body,
  ].join('\n');
  return { text, contentHash: hashText(text) };
}

function attachmentSnapshot(database: DatabaseSync, projectId: string, sourceId: string) {
  const row = sqliteResult<ResearchAttachmentRow | undefined>(
    database
      .prepare(
        `SELECT id, display_name AS displayName, media_type AS mediaType,
                size_bytes AS sizeBytes, content_hash AS contentHash
           FROM research_attachments
          WHERE id = ? AND project_id = ?`,
      )
      .get(sourceId, projectId),
  );
  if (!row) {
    throw new GenerationRunServiceError(
      'GENERATION_BASE_CONFLICT',
      'The selected research attachment is missing or belongs to another project.',
    );
  }
  const text = [
    `研究附件：${row.displayName}`,
    `媒体类型：${row.mediaType}`,
    `大小：${Number(row.sizeBytes)} bytes`,
    `SHA-256：${row.contentHash}`,
    '附件正文未自动解析；本次仅提供受管附件元数据。',
  ].join('\n');
  return { text, contentHash: row.contentHash };
}

export function snapshotResearchReferences(
  database: DatabaseSync,
  projectId: string,
  references: readonly ResearchReference[],
): readonly ResearchReferenceSnapshot[] {
  if (references.length > MAX_REFERENCE_COUNT) {
    throw new GenerationRunServiceError(
      'GENERATION_BASE_CONFLICT',
      `At most ${MAX_REFERENCE_COUNT} research references may be attached to one GenerationRun.`,
    );
  }
  const unique = new Set<string>();
  let remaining = MAX_TOTAL_REFERENCE_CHARS;
  return references.map((reference, sourceOrder) => {
    const key = `${reference.sourceType}:${reference.sourceId}`;
    if (unique.has(key)) {
      throw new GenerationRunServiceError(
        'GENERATION_BASE_CONFLICT',
        'Research references must be unique within one GenerationRun.',
      );
    }
    unique.add(key);
    const source =
      reference.sourceType === 'note'
        ? noteSnapshot(database, projectId, reference.sourceId)
        : attachmentSnapshot(database, projectId, reference.sourceId);
    const allowed = Math.max(0, Math.min(MAX_REFERENCE_CHARS, remaining));
    const snapshotText = source.text.slice(0, allowed);
    remaining -= snapshotText.length;
    return {
      sourceType: reference.sourceType,
      sourceId: reference.sourceId,
      sourceOrder,
      contentHash: source.contentHash,
      snapshotText,
      includedChars: snapshotText.length,
      trimmed: snapshotText.length < source.text.length,
    };
  });
}

export function persistPreparedResearchReferenceSnapshots(
  database: DatabaseSync,
  runId: string,
  projectId: string,
  references: readonly ResearchReference[],
  snapshots: readonly ResearchReferenceSnapshot[],
  addedAt: string,
): void {
  if (references.length !== snapshots.length) {
    throw new GenerationRunServiceError(
      'GENERATION_BASE_CONFLICT',
      'The research reference snapshot set is incomplete.',
    );
  }
  database
    .prepare(
      `INSERT INTO generation_research_ref_sets(
         generation_run_id, project_id, selection_hash, added_at
       ) VALUES(?, ?, ?, ?)`,
    )
    .run(runId, projectId, researchReferenceSelectionHash(references), addedAt);
  const insert = database.prepare(
    `INSERT INTO generation_research_refs(
       generation_run_id, project_id, source_type, source_id, source_order,
       content_hash, snapshot_text, included_chars, trimmed, added_at
     ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const snapshot of snapshots) {
    insert.run(
      runId,
      projectId,
      snapshot.sourceType,
      snapshot.sourceId,
      snapshot.sourceOrder,
      snapshot.contentHash,
      snapshot.snapshotText,
      snapshot.includedChars,
      snapshot.trimmed ? 1 : 0,
      addedAt,
    );
  }
}

export function persistedResearchSelectionHash(
  database: DatabaseSync,
  projectId: string,
  runId: string,
): string | null {
  const row = sqliteResult<ResearchReferenceSetRow | undefined>(
    database
      .prepare(
        `SELECT selection_hash AS selectionHash
           FROM generation_research_ref_sets
          WHERE generation_run_id = ? AND project_id = ?`,
      )
      .get(runId, projectId),
  );
  return row?.selectionHash ?? null;
}

export function persistedResearchReferences(
  database: DatabaseSync,
  runId: string,
): readonly ResearchReference[] {
  return sqliteResult<PersistedResearchReferenceRow[]>(
    database
      .prepare(
        `SELECT source_type AS sourceType, source_id AS sourceId, source_order AS sourceOrder,
                content_hash AS contentHash, snapshot_text AS snapshotText,
                included_chars AS includedChars, trimmed
           FROM generation_research_refs
          WHERE generation_run_id = ?
          ORDER BY source_order, source_type, source_id`,
      )
      .all(runId),
  ).map((row) => ({ sourceType: row.sourceType, sourceId: row.sourceId }));
}

export function researchReferenceMessage(
  database: DatabaseSync,
  projectId: string,
  runId: string,
): string | null {
  const rows = sqliteResult<PersistedResearchReferenceRow[]>(
    database
      .prepare(
        `SELECT source_type AS sourceType, source_id AS sourceId, source_order AS sourceOrder,
                content_hash AS contentHash, snapshot_text AS snapshotText,
                included_chars AS includedChars, trimmed
           FROM generation_research_refs
          WHERE generation_run_id = ? AND project_id = ?
          ORDER BY source_order, source_type, source_id`,
      )
      .all(runId, projectId),
  );
  if (rows.length === 0) return null;
  const sections = rows.map((row) => {
    const trimNote = Number(row.trimmed) === 1 ? '（已按本次研究资料预算裁剪）' : '';
    const body = row.snapshotText || '（因本次研究资料总量上限，仅记录来源，未附正文。）';
    return [
      `[${row.sourceType}:${row.sourceId}]${trimNote}`,
      `内容哈希：${row.contentHash}`,
      body,
    ].join('\n');
  });
  return [
    '【作者显式研究资料】',
    '以下内容只作为本次生成的参考资料，不是 Canon、Continuity 或 Planning 权威事实。',
    '若研究资料与权威故事事实冲突，以权威故事事实为准。',
    ...sections,
  ].join('\n\n');
}
