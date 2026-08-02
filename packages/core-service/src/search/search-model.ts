import { createHash } from 'node:crypto';

import type { ReplacePlan } from '@worldforge/contracts';

export type SearchToolsServiceErrorCode =
  | 'SEARCH_REPLACE_NOT_FOUND'
  | 'SEARCH_REPLACE_INVALID'
  | 'SEARCH_REPLACE_STALE'
  | 'SEARCH_REPLACE_CONFLICT';

export class SearchToolsServiceError extends Error {
  readonly code: SearchToolsServiceErrorCode;

  constructor(code: SearchToolsServiceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SearchToolsServiceError';
    this.code = code;
  }
}

export interface PlanRow {
  readonly planId: string;
  readonly projectId: string;
  readonly query: string;
  readonly replacement: string;
  readonly matchCase: number | bigint;
  readonly status: string;
  readonly itemCount: number | bigint;
  readonly eligibleCount: number | bigint;
  readonly lockedCount: number | bigint;
  readonly checkpointId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly appliedAt: string | null;
}

export interface ItemRow {
  readonly planItemId: string;
  readonly projectId: string;
  readonly chapterId: string;
  readonly draftId: string;
  readonly logicalBlockId: string;
  readonly baseRevision: number | bigint;
  readonly expectedBlockHash: string;
  readonly matchedText: string;
  readonly matchStart: number | bigint;
  readonly matchEnd: number | bigint;
  readonly replacement: string;
  readonly locked: number | bigint;
}

export interface DraftBlockRow {
  readonly recordId: string;
  readonly projectId: string;
  readonly chapterId: string;
  readonly draftId: string;
  readonly revision: number | bigint;
  readonly logicalBlockId: string;
  readonly orderKey: number | bigint;
  readonly blockType: 'paragraph' | 'dialogue' | 'heading' | 'separator';
  text: string;
  readonly attributesJson: string;
  readonly source: 'manual' | 'ai' | 'mixed' | 'imported';
  readonly locked: number | bigint;
  contentHash: string;
}

export interface SearchToolsServiceOptions {
  readonly clock?: { now(): Date };
  readonly idFactory?: () => string;
}

export function numericValue(value: number | bigint): number {
  return typeof value === 'bigint' ? Number(value) : value;
}

export function findOccurrences(
  text: string,
  query: string,
  matchCase: boolean,
): Array<[number, number]> {
  const matches: Array<[number, number]> = [];
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const expression = new RegExp(escaped, matchCase ? 'gu' : 'giu');
  for (const match of text.matchAll(expression)) {
    if (match.index === undefined || match[0].length === 0) continue;
    matches.push([match.index, match.index + match[0].length]);
  }
  return matches;
}

export function derivedReplaceRequestId(requestId: string, draftId: string): string {
  const hash = createHash('sha256').update(`${requestId}:${draftId}`, 'utf8').digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-8${hash.slice(
    17,
    20,
  )}-${hash.slice(20, 32)}`;
}

export function draftAudit(blocks: readonly DraftBlockRow[], revision: number) {
  return blocks.map((block, index) => ({
    logicalBlockId: block.logicalBlockId,
    orderKey: String((index + 1) * 1024),
    blockType: block.blockType,
    text: block.text,
    attributes: JSON.parse(block.attributesJson) as unknown,
    source: block.source,
    locked: Boolean(block.locked),
    contentHash: block.contentHash,
    revision,
  }));
}

export type EligibleReplaceItems = ReplacePlan['items'];
