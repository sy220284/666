import type { Dispatch, SetStateAction } from 'react';

import type {
  CandidateConflictItem,
  CandidateDocument,
  CandidatePreview,
  CandidateSelection,
  CandidateSummary,
  CandidateUndoPreview,
  DraftDocument,
} from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { authorErrorSummary } from '../../presentation/author-error-message.js';
import { authorConfirm } from '../../runtime/author-dialog.js';
import {
  rendererCommandCoordinatorFor,
  type RendererCommandScope,
} from '../../runtime/command-coordinator.js';

const CANDIDATE_MUTATION_COMMAND = 'candidate-mutation';

export interface CandidateActionContext {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly chapterId: string;
  readonly commandPrefix: string;
  readonly readOnly: boolean;
  readonly refreshList: (canCommit?: () => boolean) => Promise<readonly CandidateSummary[]>;
  readonly onDraftReplace: (draft: DraftDocument, message: string) => void;
  readonly setPreview: Dispatch<SetStateAction<CandidatePreview | null>>;
  readonly setUndoPreview: Dispatch<SetStateAction<CandidateUndoPreview | null>>;
  readonly setSelectedDocument: Dispatch<SetStateAction<CandidateDocument | null>>;
  readonly setSkeletonEndingHook: Dispatch<SetStateAction<string>>;
  readonly setSkeletonTendency: Dispatch<SetStateAction<string>>;
  readonly setConflicts: Dispatch<SetStateAction<readonly CandidateConflictItem[]>>;
  readonly setStatus: Dispatch<SetStateAction<string>>;
  readonly setPending: Dispatch<SetStateAction<boolean>>;
}

async function runCandidateMutation(
  input: CandidateActionContext,
  operation: (scope: RendererCommandScope) => Promise<void>,
): Promise<void> {
  const coordinator = rendererCommandCoordinatorFor(input.setPending);
  const commandKey = `${input.commandPrefix}${CANDIDATE_MUTATION_COMMAND}`;
  const result = await coordinator.run({
    key: commandKey,
    policy: 'reject',
    operation,
  });
  if (result.state === 'rejected') {
    input.setStatus('已有建议稿操作正在处理，请完成后再试。');
    return;
  }
  if (!coordinator.isLatest(commandKey, result.token)) return;
  if (result.state === 'failed') {
    input.setStatus('建议稿操作未完成，当前稿保持不变，请重试。');
  }
}

export async function cancelCandidatePreview(
  bridge: RendererBridgeAdapter,
  requestId: string | null,
): Promise<boolean> {
  if (!requestId) return false;
  const outcome = await bridge.candidateAction.cancelPreview(requestId);
  return outcome.state === 'success' && outcome.data.cancelled;
}

export async function discardCandidate(
  input: CandidateActionContext,
  candidate: CandidateDocument | null,
): Promise<void> {
  if (input.readOnly || !candidate || candidate.status !== 'pending') return;
  const confirmed = await authorConfirm({
    title: '丢弃建议稿',
    message: '丢弃后不能再采用，当前稿不会改变。继续吗？',
    confirmLabel: '丢弃建议稿',
    danger: true,
  });
  if (!confirmed) return;
  await runCandidateMutation(input, async (scope) => {
    const outcome = await input.bridge.candidate.discard({
      projectId: input.projectId,
      chapterId: input.chapterId,
      candidateId: candidate.candidateId,
    });
    if (!scope.isCurrent()) return;
    if (outcome.state === 'success') {
      input.setSelectedDocument((current) =>
        current
          ? { ...current, status: outcome.data.status, resolvedAt: outcome.data.resolvedAt }
          : current,
      );
      input.setPreview((current) =>
        current
          ? {
              ...current,
              candidate: {
                ...current.candidate,
                status: outcome.data.status,
                resolvedAt: outcome.data.resolvedAt,
              },
            }
          : current,
      );
      await input.refreshList(scope.isCurrent);
      if (scope.isCurrent()) input.setStatus('建议稿已丢弃，当前稿未改变。');
    } else if (outcome.state === 'failure') {
      input.setStatus(`丢弃失败 · ${authorErrorSummary(outcome.error)}`);
    }
  });
}

export async function applyCandidate(
  input: CandidateActionContext & {
    readonly flush: () => Promise<boolean>;
    readonly loadUndo: (preview: CandidatePreview, canCommit?: () => boolean) => Promise<boolean>;
  },
  preview: CandidatePreview | null,
  selection: CandidateSelection | null,
): Promise<void> {
  if (!preview || !selection || input.readOnly) return;
  await runCandidateMutation(input, async (scope) => {
    if (!(await input.flush()) || !scope.isCurrent()) return;
    input.setConflicts([]);
    const outcome = await input.bridge.candidateAction.apply({
      projectId: input.projectId,
      chapterId: input.chapterId,
      candidateId: preview.candidate.candidateId,
      draftId: preview.draft.draftId,
      baseRevision: preview.draft.revision,
      selection,
    });
    if (!scope.isCurrent()) return;
    if (outcome.state !== 'success') {
      if (outcome.state === 'failure')
        input.setStatus(`采用失败 · ${authorErrorSummary(outcome.error)}`);
      return;
    }
    if (outcome.data.outcome === 'conflict') {
      input.setConflicts(outcome.data.conflictSet.conflicts);
      input.setStatus(`发现${outcome.data.conflictSet.conflicts.length}项冲突，当前稿未改变。`);
      return;
    }
    input.onDraftReplace(outcome.data.draft, `采用成功 · 保存序号 ${outcome.data.draft.revision}`);
    const nextPreview: CandidatePreview = {
      ...preview,
      candidate: {
        ...preview.candidate,
        status: 'accepted',
        resolvedAt: outcome.data.record.appliedAt,
      },
      draft: outcome.data.draft,
    };
    input.setPreview(nextPreview);
    await input.loadUndo(nextPreview, scope.isCurrent);
    if (!scope.isCurrent()) return;
    await input.refreshList(scope.isCurrent);
    if (scope.isCurrent())
      input.setStatus(`采用成功 · 采用记录 ${outcome.data.record.applyRecordId.slice(0, 8)}…`);
  });
}

export async function undoCandidate(
  input: CandidateActionContext,
  preview: CandidateUndoPreview | null,
): Promise<void> {
  if (!preview || input.readOnly) return;
  await runCandidateMutation(input, async (scope) => {
    const fresh = await input.bridge.candidateAction.previewUndo({
      projectId: input.projectId,
      chapterId: input.chapterId,
      applyRecordId: preview.record.applyRecordId,
    });
    if (!scope.isCurrent() || fresh.state !== 'success') return;
    if (!fresh.data.canUndo) {
      input.setConflicts(fresh.data.conflictSet?.conflicts ?? []);
      input.setStatus('当前稿已变化，撤销进入冲突且未修改正文。');
      return;
    }
    const outcome = await input.bridge.candidateAction.undo({
      projectId: input.projectId,
      chapterId: input.chapterId,
      applyRecordId: fresh.data.record.applyRecordId,
      draftId: fresh.data.currentDraft.draftId,
      baseRevision: fresh.data.currentDraft.revision,
    });
    if (!scope.isCurrent() || outcome.state !== 'success') return;
    if (outcome.data.outcome === 'conflict') {
      input.setConflicts(outcome.data.conflictSet.conflicts);
      input.setStatus('撤销冲突，当前稿未改变。');
      return;
    }
    const restoredDraft = outcome.data.draft;
    input.onDraftReplace(restoredDraft, `已撤销本次应用 · 保存序号 ${restoredDraft.revision}`);
    input.setPreview((current) => (current ? { ...current, draft: restoredDraft } : current));
    input.setUndoPreview(null);
    input.setConflicts([]);
    input.setStatus('已撤销本次应用。');
  });
}

export async function saveSkeletonCandidate(
  input: CandidateActionContext,
  candidate: CandidateDocument | null,
  tendency: string,
  endingHook: string,
): Promise<void> {
  if (!candidate || candidate.candidateType !== 'skeleton' || input.readOnly) return;
  await runCandidateMutation(input, async (scope) => {
    const outcome = await input.bridge.candidate.editSkeleton({
      projectId: input.projectId,
      chapterId: input.chapterId,
      candidateId: candidate.candidateId,
      expectedSkeletonRevisionId: candidate.skeletonRevisionId,
      structuredPayload: {
        ...candidate.structuredPayload,
        tendency: tendency.trim(),
        endingHook: endingHook.trim(),
      },
    });
    if (!scope.isCurrent()) return;
    if (outcome.state !== 'success' || outcome.data.candidateType !== 'skeleton') {
      if (outcome.state === 'failure')
        input.setStatus(`骨架修订保存失败 · ${authorErrorSummary(outcome.error)}`);
      return;
    }
    input.setSelectedDocument(outcome.data);
    input.setSkeletonEndingHook(outcome.data.structuredPayload.endingHook);
    input.setSkeletonTendency(outcome.data.structuredPayload.tendency);
    await input.refreshList(scope.isCurrent);
    if (scope.isCurrent()) input.setStatus(`骨架修订 ${outcome.data.skeletonRevision} 已保存。`);
  });
}
