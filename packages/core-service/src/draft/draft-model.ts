import { createHash } from 'node:crypto';

import {
  DraftBlockAttributesSchema,
  type DraftBlock,
  type DraftLockConflictSummary,
} from '@worldforge/contracts';
import {
  normalizeDraftBlockSemantic,
  serializeDraftBlockSemantic,
  type DraftSemanticBlockType,
} from '@worldforge/domain';

import type { DatabaseClock } from '../database/index.js';

export const systemClock: DatabaseClock = { now: () => new Date() };

export type DraftServiceErrorCode =
  | 'DRAFT_NOT_FOUND'
  | 'DRAFT_BLOCK_NOT_FOUND'
  | 'DRAFT_INVARIANT_FAILED'
  | 'DRAFT_REVISION_CONFLICT'
  | 'DRAFT_BLOCK_HASH_CONFLICT'
  | 'DRAFT_BLOCK_LOCKED'
  | 'DRAFT_PATCH_INVALID';

export class DraftServiceError extends Error {
  readonly code: DraftServiceErrorCode;
  readonly lockConflict: DraftLockConflictSummary | undefined;

  constructor(
    code: DraftServiceErrorCode,
    message: string,
    options?: ErrorOptions & { readonly lockConflict?: DraftLockConflictSummary },
  ) {
    super(message, options);
    this.name = 'DraftServiceError';
    this.code = code;
    this.lockConflict = options?.lockConflict;
  }
}

export interface DraftServiceOptions {
  readonly clock?: DatabaseClock;
  readonly idFactory?: () => string;
  readonly faultInjector?: (stage: 'after-block-delete' | 'after-patch-persist') => void;
}

export interface DraftRow {
  readonly id: string;
  readonly chapterId: string;
  readonly status: 'active' | 'archived';
  readonly revision: number;
}

export interface WorkingBlock {
  readonly recordId: string;
  readonly logicalBlockId: string;
  readonly clientBlockId?: string | undefined;
  readonly blockType: DraftBlock['blockType'];
  readonly text: string;
  readonly attributes: DraftBlock['attributes'];
  readonly source: DraftBlock['source'];
  readonly locked: boolean;
  readonly contentHash: string;
  readonly revision: number;
}

export interface PatchReplayRow {
  readonly draftId: string;
  readonly baseRevision: number | bigint;
  readonly committedRevision: number | bigint;
  readonly operationsJson: string;
  readonly afterBlocksJson: string;
}

export function text(value: unknown): string {
  if (typeof value !== 'string') throw new TypeError('Expected SQLite text.');
  return value;
}

export function nonnegativeInteger(value: unknown): number {
  const parsed = typeof value === 'bigint' ? Number(value) : value;
  if (!Number.isSafeInteger(parsed) || Number(parsed) < 0) {
    throw new DraftServiceError(
      'DRAFT_INVARIANT_FAILED',
      'Draft revision exceeded the supported safe integer range.',
    );
  }
  return Number(parsed);
}

export function orderKey(value: unknown): string {
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  throw new DraftServiceError('DRAFT_INVARIANT_FAILED', 'Draft block order key is invalid.');
}

export function draftRow(row: Record<string, unknown>): DraftRow {
  const status = text(row.status);
  if (status !== 'active' && status !== 'archived') {
    throw new DraftServiceError('DRAFT_INVARIANT_FAILED', 'Draft status is invalid.');
  }
  return {
    id: text(row.id),
    chapterId: text(row.chapter_id),
    status,
    revision: nonnegativeInteger(row.revision),
  };
}

export function parseAttributes(raw: unknown): DraftBlock['attributes'] {
  try {
    return DraftBlockAttributesSchema.parse(JSON.parse(text(raw)));
  } catch (error) {
    throw new DraftServiceError('DRAFT_INVARIANT_FAILED', 'Draft block attributes are invalid.', {
      cause: error,
    });
  }
}

export function parseBlockType(value: unknown): DraftBlock['blockType'] {
  const parsed = text(value);
  if (!['paragraph', 'dialogue', 'heading', 'separator'].includes(parsed)) {
    throw new DraftServiceError('DRAFT_INVARIANT_FAILED', 'Draft block type is invalid.');
  }
  return parsed as DraftBlock['blockType'];
}

export function parseSource(value: unknown): DraftBlock['source'] {
  const parsed = text(value);
  if (!['manual', 'ai', 'mixed', 'imported'].includes(parsed)) {
    throw new DraftServiceError('DRAFT_INVARIANT_FAILED', 'Draft block source is invalid.');
  }
  return parsed as DraftBlock['source'];
}

export function draftContentHash(input: {
  readonly blockType: DraftSemanticBlockType;
  readonly content: string;
  readonly attributes?: DraftBlock['attributes'];
}): string {
  return createHash('sha256').update(serializeDraftBlockSemantic(input), 'utf8').digest('hex');
}

export function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right, 'en'))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function normalizeBlock(input: {
  readonly blockType: DraftBlock['blockType'];
  readonly content: string;
  readonly attributes?: DraftBlock['attributes'];
}): Pick<WorkingBlock, 'blockType' | 'text' | 'attributes' | 'contentHash'> {
  try {
    const normalized = normalizeDraftBlockSemantic(input);
    return {
      blockType: normalized.blockType,
      text: normalized.content,
      attributes: normalized.attributes,
      contentHash: draftContentHash(normalized),
    };
  } catch (error) {
    throw new DraftServiceError('DRAFT_PATCH_INVALID', 'Draft block semantics are invalid.', {
      cause: error,
    });
  }
}

export function auditBlocks(blocks: readonly WorkingBlock[]): readonly Record<string, unknown>[] {
  return blocks.map((block, index) => ({
    logicalBlockId: block.logicalBlockId,
    ...(block.clientBlockId ? { clientBlockId: block.clientBlockId } : {}),
    orderKey: String((index + 1) * 1024),
    blockType: block.blockType,
    text: block.text,
    attributes: block.attributes,
    source: block.source,
    locked: block.locked,
    contentHash: block.contentHash,
    revision: block.revision,
  }));
}
