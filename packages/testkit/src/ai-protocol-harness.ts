import type { ErrorCode, SkeletonCandidateOutput } from '@worldforge/contracts';
import { assessSkeletonCoverage, parseSkeletonCandidate } from '@worldforge/prompts';

import {
  ProviderStubError,
  type DeterministicProviderStub,
  type ProviderStubRequest,
} from './provider-stub.js';

export type ProviderStubResult =
  | { readonly status: 'complete'; readonly text: string }
  | {
      readonly status: 'partial';
      readonly text: string;
      readonly errorCode: Extract<ErrorCode, 'AI_STREAM_INTERRUPTED_009'>;
    }
  | {
      readonly status: 'cancelled';
      readonly text: string;
      readonly errorCode: Extract<ErrorCode, 'COMMON_CANCELLED_004'>;
    }
  | { readonly status: 'failed'; readonly text: string; readonly errorCode: ErrorCode };

export async function collectProviderStubResult(
  provider: DeterministicProviderStub,
  request: ProviderStubRequest,
): Promise<ProviderStubResult> {
  let text = '';
  try {
    for await (const chunk of provider.stream(request)) text += chunk;
    return { status: 'complete', text };
  } catch (error) {
    if (!(error instanceof ProviderStubError)) throw error;
    if (error.code === 'AI_STREAM_INTERRUPTED_009' && text.length > 0) {
      return { status: 'partial', text, errorCode: error.code };
    }
    if (error.code === 'COMMON_CANCELLED_004') {
      return { status: 'cancelled', text, errorCode: error.code };
    }
    return { status: 'failed', text, errorCode: error.code };
  }
}

export type SkeletonProtocolResult =
  | {
      readonly status: 'complete';
      readonly candidate: SkeletonCandidateOutput;
      readonly repaired: boolean;
    }
  | {
      readonly status: 'invalid';
      readonly errorCode: Extract<ErrorCode, 'AI_OUTPUT_INVALID_008'>;
      readonly attempts: 1 | 2;
      readonly missingBeatIds?: readonly string[];
    }
  | Exclude<ProviderStubResult, { readonly status: 'complete' }>;

export interface SkeletonProtocolInvocation {
  readonly provider: DeterministicProviderStub;
  readonly request: ProviderStubRequest;
  readonly requiredBeatIds: readonly string[];
}

async function runSkeletonCandidate(
  invocation: SkeletonProtocolInvocation,
): Promise<SkeletonProtocolResult> {
  const collected = await collectProviderStubResult(invocation.provider, invocation.request);
  if (collected.status !== 'complete') return collected;
  const parsed = parseSkeletonCandidate(collected.text);
  if (!parsed.ok) {
    return {
      status: 'invalid',
      errorCode: parsed.errorCode,
      attempts: parsed.attempts,
    };
  }
  const coverage = assessSkeletonCoverage(parsed.value, invocation.requiredBeatIds);
  if (!coverage.accepted) {
    return {
      status: 'invalid',
      errorCode: 'AI_OUTPUT_INVALID_008',
      attempts: parsed.attempts,
      missingBeatIds: coverage.missingBeatIds,
    };
  }
  return { status: 'complete', candidate: parsed.value, repaired: parsed.repaired };
}

export function runSkeletonCandidates(
  invocations: readonly SkeletonProtocolInvocation[],
): Promise<readonly SkeletonProtocolResult[]> {
  return Promise.all(invocations.map(runSkeletonCandidate));
}
