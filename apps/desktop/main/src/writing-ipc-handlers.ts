import { type CoreSupervisor } from './core-supervisor.js';
import { createDiagnosticId } from './privacy-logger.js';
import {
  AiHasCredentialCommandSchema,
  AiRemoveCredentialCommandSchema,
  AiSetCredentialCommandSchema,
  CANDIDATE_COMMANDS,
  CANDIDATE_IPC_CHANNELS,
  CandidateCreateFixtureCommandSchema,
  CandidateDiscardCommandSchema,
  CandidateEditSkeletonCommandSchema,
  CandidateGetCommandSchema,
  CandidateListCommandSchema,
  DRAFT_COMMANDS,
  DraftApplyPatchCommandSchema,
  DraftOpenCommandSchema,
  IPC_CHANNELS,
  VERSION_COMMANDS,
  VersionCreateCommandSchema,
  VersionGetCommandSchema,
  VersionListCommandSchema,
  VersionRestoreCommandSchema,
  VersionSetFinalCommandSchema,
} from '@worldforge/contracts';

import type { IpcHandlerContext } from './handler-guard.js';

export function registerWritingIpcHandlers(context: IpcHandlerContext): void {
  const { options, register, rejectUntrusted, invalidRequest, invokeProject, success, failure } =
    context;

  register(IPC_CHANNELS.openDraft, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = DraftOpenCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: DRAFT_COMMANDS.openDraft,
      input: parsed.data.payload,
    });
  });

  register(IPC_CHANNELS.applyPatch, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = DraftApplyPatchCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: DRAFT_COMMANDS.applyPatch,
      input: parsed.data.payload,
    });
  });

  for (const [channel, schema, operation] of [
    [
      CANDIDATE_IPC_CHANNELS.createFixtureCandidate,
      CandidateCreateFixtureCommandSchema,
      CANDIDATE_COMMANDS.createFixtureCandidate,
    ],
    [
      CANDIDATE_IPC_CHANNELS.listCandidates,
      CandidateListCommandSchema,
      CANDIDATE_COMMANDS.listCandidates,
    ],
    [
      CANDIDATE_IPC_CHANNELS.getCandidate,
      CandidateGetCommandSchema,
      CANDIDATE_COMMANDS.getCandidate,
    ],
    [
      CANDIDATE_IPC_CHANNELS.discardCandidate,
      CandidateDiscardCommandSchema,
      CANDIDATE_COMMANDS.discardCandidate,
    ],
    [
      CANDIDATE_IPC_CHANNELS.editSkeleton,
      CandidateEditSkeletonCommandSchema,
      CANDIDATE_COMMANDS.editSkeleton,
    ],
  ] as const) {
    register(channel, async (event, raw) => {
      const rejected = rejectUntrusted(event, raw);
      if (rejected) return rejected;
      const parsed = schema.safeParse(raw);
      if (!parsed.success) return invalidRequest(raw);
      return invokeProject(parsed.data.requestId, {
        operation,
        input: parsed.data.payload,
      } as Parameters<CoreSupervisor['invokeProjectOperation']>[1]);
    });
  }

  for (const [channel, schema, operation] of [
    [IPC_CHANNELS.createVersion, VersionCreateCommandSchema, VERSION_COMMANDS.createVersion],
    [IPC_CHANNELS.listVersions, VersionListCommandSchema, VERSION_COMMANDS.listVersions],
    [IPC_CHANNELS.getVersion, VersionGetCommandSchema, VERSION_COMMANDS.getVersion],
    [IPC_CHANNELS.setFinalVersion, VersionSetFinalCommandSchema, VERSION_COMMANDS.setFinalVersion],
    [IPC_CHANNELS.restoreVersion, VersionRestoreCommandSchema, VERSION_COMMANDS.restoreVersion],
  ] as const) {
    register(channel, async (event, raw) => {
      const rejected = rejectUntrusted(event, raw);
      if (rejected) return rejected;
      const parsed = schema.safeParse(raw);
      if (!parsed.success) return invalidRequest(raw);
      return invokeProject(parsed.data.requestId, {
        operation,
        input: parsed.data.payload,
      } as Parameters<CoreSupervisor['invokeProjectOperation']>[1]);
    });
  }

  register(IPC_CHANNELS.aiSetCredential, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = AiSetCredentialCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    try {
      const credentialRef = await options.credentialBroker.store(
        parsed.data.payload.providerId,
        parsed.data.payload.credential,
      );
      return success(parsed.data.requestId, { credentialRef });
    } catch {
      const diagnosticId = createDiagnosticId();
      await options.logger.log('error', 'credential.store.failed', {
        providerId: parsed.data.payload.providerId,
        errorCode: 'AI_CREDENTIAL_MISSING_002',
        diagnosticId,
      });
      return failure(
        parsed.data.requestId,
        'AI_CREDENTIAL_MISSING_002',
        'The credential could not be stored securely.',
        true,
        diagnosticId,
      );
    }
  });

  register(IPC_CHANNELS.aiRemoveCredential, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = AiRemoveCredentialCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    const exists = await options.credentialBroker.remove(parsed.data.payload.credentialRef);
    return success(parsed.data.requestId, { exists });
  });

  register(IPC_CHANNELS.aiHasCredential, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = AiHasCredentialCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    const exists = await options.credentialBroker.has(parsed.data.payload.credentialRef);
    return success(parsed.data.requestId, { exists });
  });
}
