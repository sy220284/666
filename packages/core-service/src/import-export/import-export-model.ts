import { createHash } from 'node:crypto';

import type { ImportPlan, ImportPlanBlock } from '@worldforge/contracts';

import type { DatabaseClock } from '../database/index.js';

export const systemClock: DatabaseClock = { now: () => new Date() };
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
export const PLAN_TTL_MS = 30 * 60 * 1000;
export const ORDER_STEP = 1024n;

export type ImportExportServiceErrorCode =
  | 'IMPORT_FORMAT_UNSUPPORTED'
  | 'IMPORT_ENCODING_UNCERTAIN'
  | 'IMPORT_ARCHIVE_LIMIT'
  | 'IMPORT_CONTENT_EMPTY'
  | 'IMPORT_PLAN_STALE'
  | 'IMPORT_COMMIT_FAILED'
  | 'EXPORT_VERSION_REQUIRED'
  | 'EXPORT_TARGET_EXISTS'
  | 'EXPORT_WRITE_FAILED';

export class ImportExportServiceError extends Error {
  readonly code: ImportExportServiceErrorCode;
  constructor(code: ImportExportServiceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ImportExportServiceError';
    this.code = code;
  }
}

export interface ImportExportServiceOptions {
  readonly clock?: DatabaseClock;
  readonly idFactory?: () => string;
  readonly readSource?: (filePath: string) => Promise<Buffer>;
  readonly writeTarget?: (filePath: string, content: Buffer) => Promise<void>;
  readonly faultInjector?: (
    stage: 'after-checkpoint' | 'during-import' | 'after-export-write',
  ) => void;
}
export interface StoredPlan {
  readonly plan: ImportPlan;
  readonly sourcePath: string;
  readonly createdAtMs: number;
}

export interface ExportVersionRow {
  readonly versionId: string;
  readonly volumeId: string;
  readonly volumeTitle: string;
  readonly chapterId: string;
  readonly chapterTitle: string;
  readonly versionTitle: string;
  readonly wordCount: number | bigint;
  readonly createdAt: string;
  readonly finalized: number | bigint;
  readonly volumeOrder: number | bigint;
  readonly chapterOrder: number | bigint;
}

export interface ExportBlockRow {
  readonly blockType: ImportPlanBlock['blockType'];
  readonly text: string;
  readonly orderKey: number | bigint;
}

export interface ImportedVersionBlock {
  readonly logicalBlockId: string;
  readonly orderKey: string;
  readonly blockType: ImportPlanBlock['blockType'];
  readonly text: string;
  readonly attributes: Record<string, never>;
  readonly source: 'imported';
  readonly locked: false;
  readonly contentHash: string;
}
export function sha256(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
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

export function blockHash(block: ImportPlanBlock): string {
  return sha256(
    stable({
      blockType: block.blockType,
      text: block.text.replaceAll('\r\n', '\n').replaceAll('\r', '\n'),
      attributes: {},
      source: 'imported',
      locked: false,
    }),
  );
}

export function versionHash(blocks: readonly ImportedVersionBlock[]): string {
  return sha256(stable(blocks));
}

export function wordCount(blocks: readonly ImportPlanBlock[]): number {
  return blocks.reduce(
    (total, block) =>
      total + Array.from(block.text.replace(/\s/gu, '').matchAll(/[\p{L}\p{N}]/gu)).length,
    0,
  );
}

export type ImportPlanStore = Map<string, StoredPlan>;
