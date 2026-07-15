import {
  ChapterCandidateOutputSchema,
  SkeletonCandidateOutputSchema,
  type ChapterCandidateOutput,
  type ContractSchema,
  type SkeletonCandidateOutput,
} from '@worldforge/contracts';

import { cleanChapterText, cleanStructuredEnvelope } from './cleaners.js';

export type StructuredParseResult<Value> =
  | {
      readonly ok: true;
      readonly value: Value;
      readonly repaired: boolean;
      readonly attempts: 1 | 2;
    }
  | {
      readonly ok: false;
      readonly errorCode: 'AI_OUTPUT_INVALID_008';
      readonly attempts: 1 | 2;
      readonly failure: 'json-syntax' | 'schema';
    };

function parseOnce<Value>(
  source: string,
  schema: ContractSchema<Value>,
):
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly failure: 'json-syntax' | 'schema' } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return { ok: false, failure: 'json-syntax' };
  }
  const validated = schema.safeParse(parsed);
  if (!validated.success) return { ok: false, failure: 'schema' };
  return { ok: true, value: validated.data };
}

export function parseStructuredOutput<Value>(
  raw: string,
  schema: ContractSchema<Value>,
): StructuredParseResult<Value> {
  const first = parseOnce(raw.trim(), schema);
  if (first.ok) return { ok: true, value: first.value, repaired: false, attempts: 1 };
  if (first.failure === 'schema') {
    return {
      ok: false,
      errorCode: 'AI_OUTPUT_INVALID_008',
      attempts: 1,
      failure: 'schema',
    };
  }

  const cleaned = cleanStructuredEnvelope(raw);
  if (cleaned.text === raw.trim()) {
    return {
      ok: false,
      errorCode: 'AI_OUTPUT_INVALID_008',
      attempts: 1,
      failure: 'json-syntax',
    };
  }
  const repaired = parseOnce(cleaned.text, schema);
  if (repaired.ok) return { ok: true, value: repaired.value, repaired: true, attempts: 2 };
  return {
    ok: false,
    errorCode: 'AI_OUTPUT_INVALID_008',
    attempts: 2,
    failure: repaired.failure,
  };
}

export function parseSkeletonCandidate(
  raw: string,
): StructuredParseResult<SkeletonCandidateOutput> {
  return parseStructuredOutput(raw, SkeletonCandidateOutputSchema);
}

export interface SkeletonCoverageResult {
  readonly accepted: boolean;
  readonly coverageRate: number;
  readonly missingBeatIds: readonly string[];
}

export function assessSkeletonCoverage(
  candidate: SkeletonCandidateOutput,
  requiredBeatIds: readonly string[],
): SkeletonCoverageResult {
  const required = [...new Set(requiredBeatIds)];
  const observed = new Set(candidate.beats.map((beat) => beat.beatId));
  const missingBeatIds = required.filter((beatId) => !observed.has(beatId));
  return {
    accepted: missingBeatIds.length === 0,
    coverageRate:
      required.length === 0 ? 1 : (required.length - missingBeatIds.length) / required.length,
    missingBeatIds,
  };
}

export function parseChapterCandidate(raw: string): StructuredParseResult<ChapterCandidateOutput> {
  return parseStructuredOutput(raw, ChapterCandidateOutputSchema);
}

export type ChapterTextParseResult =
  | { readonly ok: true; readonly text: string; readonly cleaned: boolean }
  | {
      readonly ok: false;
      readonly errorCode: 'AI_OUTPUT_INVALID_008';
      readonly reason: 'empty-output';
    };

export function parseChapterTextCandidate(raw: string): ChapterTextParseResult {
  const cleaned = cleanChapterText(raw);
  if (cleaned.text.length === 0) {
    return { ok: false, errorCode: 'AI_OUTPUT_INVALID_008', reason: 'empty-output' };
  }
  return { ok: true, text: cleaned.text, cleaned: cleaned.changed };
}
