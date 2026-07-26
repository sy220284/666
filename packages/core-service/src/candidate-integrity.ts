import { createHash } from 'node:crypto';

import type { CandidateBlock, SkeletonCandidateOutput } from '@worldforge/contracts';

import { draftContentHash } from './draft.js';

export function stableCandidateSerialization(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableCandidateSerialization).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right, 'en'))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableCandidateSerialization(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function candidateBlockContentHash(
  block: Pick<CandidateBlock, 'blockType' | 'text' | 'attributes'>,
): string {
  return draftContentHash({
    blockType: block.blockType,
    content: block.text,
    attributes: block.attributes,
  });
}

export function candidateDocumentContentHash(blocks: readonly CandidateBlock[]): string {
  return createHash('sha256')
    .update(
      stableCandidateSerialization(
        blocks.map((block) => ({
          logicalBlockId: block.logicalBlockId,
          sourceLogicalBlockIds: block.sourceLogicalBlockIds,
          orderKey: block.orderKey,
          blockType: block.blockType,
          text: block.text,
          attributes: block.attributes,
          beatId: block.beatId,
          sourceBlockHash: block.sourceBlockHash,
          contentHash: block.contentHash,
        })),
      ),
      'utf8',
    )
    .digest('hex');
}

export function candidateSkeletonPayloadHash(payload: SkeletonCandidateOutput): string {
  return createHash('sha256').update(stableCandidateSerialization(payload), 'utf8').digest('hex');
}

export function candidateSkeletonContentHash(
  payloadSchemaVersion: number,
  payloadHash: string,
): string {
  return createHash('sha256')
    .update(stableCandidateSerialization({ payloadSchemaVersion, payloadHash }), 'utf8')
    .digest('hex');
}
