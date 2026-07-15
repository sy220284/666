import type { ModelSupportProfile } from '@worldforge/contracts';

export type ChapterModeDecision =
  | { readonly mode: 'structured'; readonly reason: 'verified-profile' }
  | {
      readonly mode: 'text';
      readonly reason:
        | 'text-preferred'
        | 'profile-missing'
        | 'profile-mismatch'
        | 'profile-not-verified'
        | 'structured-schema-unverified';
    };

export interface ChapterModeInput {
  readonly preferStructured: boolean;
  readonly promptId: string;
  readonly promptVersion: number;
  readonly profile?: ModelSupportProfile;
}

export function selectChapterOutputMode(input: ChapterModeInput): ChapterModeDecision {
  if (!input.preferStructured) return { mode: 'text', reason: 'text-preferred' };
  if (!input.profile) return { mode: 'text', reason: 'profile-missing' };
  if (
    input.profile.taskType !== 'chapter' ||
    input.profile.promptId !== input.promptId ||
    input.profile.promptVersion !== input.promptVersion
  ) {
    return { mode: 'text', reason: 'profile-mismatch' };
  }
  if (input.profile.status !== 'verified') {
    return { mode: 'text', reason: 'profile-not-verified' };
  }
  if (input.profile.metrics?.structuredSchemaRate !== 1) {
    return { mode: 'text', reason: 'structured-schema-unverified' };
  }
  return { mode: 'structured', reason: 'verified-profile' };
}
