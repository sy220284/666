import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import * as publicContracts from '@worldforge/contracts';
import type { WorldforgeBridge as PublicWorldforgeBridge } from '@worldforge/contracts';
import * as appRuntimeContracts from '../../packages/contracts/src/app-runtime-contracts.js';
import * as sourceCompatibilityRoot from '../../packages/contracts/src/index.js';
import * as protocolRegistry from '../../packages/contracts/src/protocol-registry.js';
import type { WorldforgeBridge as InternalWorldforgeBridge } from '../../packages/contracts/src/worldforge-bridge.js';

type IsExact<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? (<T>() => T extends B ? 1 : 2) extends <T>() => T extends A ? 1 : 2
      ? true
      : false
    : false;

const bridgeSurfaceIsExact: IsExact<PublicWorldforgeBridge, InternalWorldforgeBridge> = true;
const APPROVED_RUNTIME_EXPORT_ADDITIONS = [
  'AIReviewCatalogSchema',
  'AIReviewSummarySchema',
  'CentralBridgeCommandSchema',
  'AIReviewProposalTypeSchema',
  'CanonFactProposalDraftSchema',
  'CanonFactProposalValueSchema',
  'CharacterRelationshipCategorySchema',
  'CharacterRelationshipInvalidateCommandSchema',
  'CharacterRelationshipInvalidateInputSchema',
  'CharacterRelationshipProposalDraftSchema',
  'CharacterRelationshipProposalValueSchema',
  'CharacterRelationshipRecordStatusSchema',
  'CharacterRelationshipSchema',
  'CharacterRelationshipSetCommandSchema',
  'CharacterRelationshipSetInputSchema',
  'CoreIdeaOperationSchema',
  'CoreIdeaResultSchema',
  'CoreStoryKnowledgeOperationSchema',
  'CoreStoryKnowledgeResultSchema',
  'EntityCreateProposalDraftSchema',
  'EntityCreateProposalValueSchema',
  'EntityStateProposalValueSchema',
  'EntityStateSemanticKindSchema',
  'ForeshadowingProposalDraftSchema',
  'ForeshadowingProposalValueSchema',
  'GenerationScopeSchema',
  'GenerationScopeTypeSchema',
  'IDEA_CAPSULE_BRIDGE_COMMAND',
  'IDEA_CAPSULE_COMMANDS',
  'IDEA_CAPSULE_IPC_CHANNELS',
  'IdeaCardSchema',
  'IdeaConversionApplyInputSchema',
  'IdeaConversionApplyResultSchema',
  'IdeaConversionPreviewInputSchema',
  'IdeaConversionPreviewSchema',
  'IdeaConversionSchema',
  'IdeaConversionStatusSchema',
  'IdeaConversionTargetSchema',
  'IdeaConversionTargetTypeSchema',
  'IdeaCreateInputSchema',
  'IdeaDepthLevelSchema',
  'IdeaDetailSchema',
  'IdeaDivergenceLevelSchema',
  'IdeaExploreOutputItemSchema',
  'IdeaExploreOutputJsonSchema',
  'IdeaExploreOutputSchema',
  'IdeaExplorePromptInputSchema',
  'IdeaGetInputSchema',
  'IdeaKindSchema',
  'IdeaListCursorSchema',
  'IdeaListInputSchema',
  'IdeaListSchema',
  'IdeaMutableStatusSchema',
  'IdeaOperationCommandSchema',
  'IdeaOperationDataSchema',
  'IdeaOperationResultSchema',
  'IdeaSetStatusInputSchema',
  'IdeaSourceContextSchema',
  'IdeaStatusSchema',
  'KnowledgeStateProposalDraftSchema',
  'KnowledgeStateProposalValueSchema',
  'ReviewProposalActionabilitySchema',
  'ReviewProposalConfidenceSchema',
  'ReviewProposalFreshnessSchema',
  'ReviewProposalSchema',
  'ReviewProposalTargetSchema',
  'ReviewProposalTypeSchema',
  'STORY_KNOWLEDGE_COMMANDS',
  'STORY_KNOWLEDGE_IPC_CHANNELS',
  'StateProposalTargetSchema',
  'StoryKnowledgeProjectCommandSchema',
  'StoryKnowledgeProjectionInputSchema',
  'StoryKnowledgeProjectionResultSchema',
  'StoryKnowledgeProjectionSchema',
  'TimelineEventProposalDraftSchema',
  'TimelineEventProposalValueSchema',
  'ValidationExceptionDisableCommandSchema',
  'ValidationExceptionDisableInputSchema',
  'ValidationExceptionRememberCommandSchema',
  'ValidationExceptionRememberInputSchema',
  'ValidationExceptionSchema',
  'ValidationExceptionScopeSchema',
  'ValidationExceptionTypeSchema',
] as const;
const BASELINE = {
  protocolVersion: 1,
  ipcChannelCount: 97,
  appCommandCount: 96,
  runtimeExportCount: 918,
  legacySurfaceSha256: 'a841f0657b53bc59b45109093c89621e0b131c8a81ab7d4824942f608e7a5590',
} as const;

function legacyPublicSurfaceDigest(): string {
  const approvedAdditions = new Set<string>(APPROVED_RUNTIME_EXPORT_ADDITIONS);
  const normalized = {
    protocolVersion: publicContracts.PROTOCOL_VERSION,
    ipcChannels: Object.entries(publicContracts.IPC_CHANNELS).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
    appCommands: Object.entries(publicContracts.APP_COMMANDS).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
    runtimeExports: Object.keys(publicContracts)
      .filter((name) => !approvedAdditions.has(name))
      .sort(),
  };
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

describe('AR-08 contracts public surface', () => {
  it('preserves the legacy surface and admits only explicitly approved additive schemas', () => {
    expect(publicContracts.PROTOCOL_VERSION).toBe(BASELINE.protocolVersion);
    expect(Object.keys(publicContracts.IPC_CHANNELS)).toHaveLength(BASELINE.ipcChannelCount);
    expect(Object.keys(publicContracts.APP_COMMANDS)).toHaveLength(BASELINE.appCommandCount);
    expect(Object.keys(publicContracts)).toHaveLength(BASELINE.runtimeExportCount);
    expect(legacyPublicSurfaceDigest()).toBe(BASELINE.legacySurfaceSha256);
    expect(publicContracts.RegisteredCommandSchema).toBe(
      publicContracts.CentralBridgeCommandSchema,
    );
    expect(publicContracts.ReviewProposalSchema).toBeDefined();
    expect(publicContracts.AIReviewCatalogSchema).toBeDefined();
    expect(publicContracts.StoryKnowledgeProjectionSchema).toBeDefined();
    expect(publicContracts.IdeaConversionTargetSchema).toBeDefined();
    expect(publicContracts.GenerationScopeSchema).toBeDefined();
  });

  it('keeps the source compatibility root wired to the split modules', () => {
    expect(sourceCompatibilityRoot.IPC_CHANNELS).toBe(protocolRegistry.IPC_CHANNELS);
    expect(sourceCompatibilityRoot.APP_COMMANDS).toBe(protocolRegistry.APP_COMMANDS);
    expect(sourceCompatibilityRoot.RegisteredCommandSchema).toBe(
      protocolRegistry.RegisteredCommandSchema,
    );
    expect(sourceCompatibilityRoot.CentralBridgeCommandSchema).toBe(
      protocolRegistry.CentralBridgeCommandSchema,
    );
    expect(sourceCompatibilityRoot.AppInfoSchema).toBe(appRuntimeContracts.AppInfoSchema);
    expect(sourceCompatibilityRoot.CoreEventSchema).toBe(appRuntimeContracts.CoreEventSchema);
    expect(bridgeSurfaceIsExact).toBe(true);
  });
});
