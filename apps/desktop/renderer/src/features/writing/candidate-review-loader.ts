import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import type {
  CandidateConflictItem,
  CandidateDocument,
  CandidatePreview,
  CandidateSummary,
  CandidateUndoPreview,
  GenerationRun,
} from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { authorErrorSummary } from '../../presentation/author-error-message.js';
import type { AppDisclosureMode } from '../../shell/app-shell-model.js';
import {
  rendererCommandCoordinatorFor,
  type RendererCommandScope,
} from '../../runtime/command-coordinator.js';
import type { CandidateSelectionMode } from './candidate-selection.js';

const CANDIDATE_DOCUMENT_COMMAND = 'candidate-document';
const CANDIDATE_PREVIEW_COMMAND = 'candidate-preview';

function commandKey(prefix: string, command: string): string {
  return `${prefix}${command}`;
}

export interface CandidateReviewLoader {
  readonly bridge: RendererBridgeAdapter;
  readonly disclosureMode?: AppDisclosureMode;
  readonly projectId: string;
  readonly chapterId: string;
  readonly commandPrefix: string;
  readonly documentRequest: MutableRefObject<number>;
  readonly previewRequest: MutableRefObject<string | null>;
  readonly setCandidates: Dispatch<SetStateAction<readonly CandidateSummary[]>>;
  readonly setPreview: Dispatch<SetStateAction<CandidatePreview | null>>;
  readonly setUndoPreview: Dispatch<SetStateAction<CandidateUndoPreview | null>>;
  readonly setSelectedDocument: Dispatch<SetStateAction<CandidateDocument | null>>;
  readonly setSelectedRun: Dispatch<SetStateAction<GenerationRun | null>>;
  readonly setSelectionMode: Dispatch<SetStateAction<CandidateSelectionMode>>;
  readonly setSelectedBlocks: Dispatch<SetStateAction<Set<string>>>;
  readonly setSelectedBeats: Dispatch<SetStateAction<Set<string>>>;
  readonly setSelectedSkeletonId: Dispatch<SetStateAction<string>>;
  readonly setSkeletonEndingHook: Dispatch<SetStateAction<string>>;
  readonly setSkeletonTendency: Dispatch<SetStateAction<string>>;
  readonly setConflicts: Dispatch<SetStateAction<readonly CandidateConflictItem[]>>;
  readonly setStatus: Dispatch<SetStateAction<string>>;
  readonly setPending: Dispatch<SetStateAction<boolean>>;
}

export async function loadCandidateList(
  input: CandidateReviewLoader,
  canCommit: () => boolean = () => true,
): Promise<readonly CandidateSummary[]> {
  const outcome = await input.bridge.candidate.list(input.projectId, input.chapterId, {
    mode: 'replace',
  });
  if (outcome.state !== 'success') {
    if (outcome.state === 'failure' && canCommit())
      input.setStatus(`建议稿列表读取失败 · ${authorErrorSummary(outcome.error)}`);
    return [];
  }
  if (canCommit()) input.setCandidates(outcome.data.candidates);
  return outcome.data.candidates;
}

export async function loadCandidateUndo(
  input: CandidateReviewLoader,
  preview: CandidatePreview,
  canCommit: () => boolean = () => true,
): Promise<boolean> {
  if (preview.candidate.status !== 'accepted') {
    if (canCommit()) input.setUndoPreview(null);
    return false;
  }
  const lookup = await input.bridge.candidateAction.findUndoRecord({
    projectId: input.projectId,
    chapterId: input.chapterId,
    candidateId: preview.candidate.candidateId,
  });
  if (!canCommit() || lookup.state !== 'success') return false;
  const outcome = await input.bridge.candidateAction.previewUndo({
    projectId: input.projectId,
    chapterId: input.chapterId,
    applyRecordId: lookup.data.applyRecordId,
  });
  if (!canCommit() || outcome.state !== 'success') return false;
  input.setUndoPreview(outcome.data);
  input.setConflicts(outcome.data.conflictSet?.conflicts ?? []);
  return outcome.data.canUndo;
}

export async function loadCandidatePreview(
  input: CandidateReviewLoader,
  candidateId: string,
): Promise<void> {
  if (!candidateId) return;
  const coordinator = rendererCommandCoordinatorFor(input.setPending);
  const previewKey = commandKey(input.commandPrefix, CANDIDATE_PREVIEW_COMMAND);
  const result = await coordinator.run({
    key: previewKey,
    policy: 'replace',
    operation: async (scope) => {
      const requestId = crypto.randomUUID();
      input.previewRequest.current = requestId;
      input.setStatus('正在计算结构与中文字符差异…');
      input.setConflicts([]);
      const outcome = await input.bridge.candidateAction.preview(
        { projectId: input.projectId, chapterId: input.chapterId, candidateId },
        requestId,
        { mode: 'replace' },
      );
      if (!scope.isCurrent() || input.previewRequest.current !== requestId) return;
      if (outcome.state !== 'success') {
        input.setStatus(
          outcome.state === 'failure'
            ? outcome.error.code === 'COMMON_CANCELLED_004'
              ? '差异计算已取消。'
              : `预览失败 · ${authorErrorSummary(outcome.error)}`
            : outcome.state === 'cancelled'
              ? '差异计算已取消。'
              : '预览已被更新请求替代。',
        );
        return;
      }
      input.setPreview(outcome.data);
      input.setSelectedDocument(outcome.data.candidate);
      input.setSelectionMode(outcome.data.candidate.completeness === 'partial' ? 'blocks' : 'all');
      input.setSelectedBlocks(
        new Set(outcome.data.candidate.blocks.map((block) => block.candidateBlockId)),
      );
      input.setSelectedBeats(
        new Set(
          outcome.data.candidate.blocks.flatMap((block) => (block.beatId ? [block.beatId] : [])),
        ),
      );
      const canUndo = await loadCandidateUndo(input, outcome.data, scope.isCurrent);
      if (!scope.isCurrent()) return;
      const readyMessage = canUndo ? '可整体撤销' : '已准备采用';
      input.setStatus(
        input.disclosureMode === 'beginner'
          ? readyMessage
          : `${readyMessage} · 基础保存序号 ${outcome.data.candidate.baseDraftRevision}`,
      );
    },
  });
  if (!coordinator.isLatest(previewKey, result.token)) return;
  input.previewRequest.current = null;
  if (result.state === 'failed') {
    input.setStatus('建议稿预览未完成，当前稿保持不变，请重试。');
  }
}

function invalidateCandidatePreview(input: CandidateReviewLoader): void {
  const coordinator = rendererCommandCoordinatorFor(input.setPending);
  coordinator.invalidate(commandKey(input.commandPrefix, CANDIDATE_PREVIEW_COMMAND));
  const stalePreviewRequest = input.previewRequest.current;
  input.previewRequest.current = null;
  if (stalePreviewRequest) void input.bridge.candidateAction.cancelPreview(stalePreviewRequest);
}

export async function loadCandidateDocument(
  input: CandidateReviewLoader,
  candidateId: string,
): Promise<void> {
  if (!candidateId) return;

  input.documentRequest.current += 1;
  invalidateCandidatePreview(input);
  const coordinator = rendererCommandCoordinatorFor(input.setPending);
  const documentKey = commandKey(input.commandPrefix, CANDIDATE_DOCUMENT_COMMAND);
  const result = await coordinator.run({
    key: documentKey,
    policy: 'replace',
    operation: async (scope: RendererCommandScope) => {
      const outcome = await input.bridge.candidate.get({
        projectId: input.projectId,
        chapterId: input.chapterId,
        candidateId,
      });
      if (!scope.isCurrent()) return;
      if (outcome.state !== 'success') {
        if (outcome.state === 'failure')
          input.setStatus(`建议稿读取失败 · ${authorErrorSummary(outcome.error)}`);
        return;
      }
      input.setSelectedDocument(outcome.data);
      if (outcome.data.generationRunId) {
        const run = await input.bridge.generation.getRun(
          input.projectId,
          outcome.data.generationRunId,
        );
        if (!scope.isCurrent()) return;
        input.setSelectedRun(run.state === 'success' ? run.data : null);
      } else {
        input.setSelectedRun(null);
      }
      if (outcome.data.candidateType === 'skeleton') {
        input.setPreview(null);
        input.setUndoPreview(null);
        input.setConflicts([]);
        input.setSelectedSkeletonId(outcome.data.candidateId);
        input.setSkeletonEndingHook(outcome.data.structuredPayload.endingHook);
        input.setSkeletonTendency(outcome.data.structuredPayload.tendency);
        input.setStatus(
          outcome.data.sourceState === 'stale'
            ? '骨架来源已变化；进入T1前需要明确确认或重新生成。'
            : `骨架修订 ${outcome.data.skeletonRevision} · 可编辑或作为T1来源。`,
        );
        return;
      }
      if (!scope.isCurrent()) return;
      await loadCandidatePreview(input, candidateId);
    },
  });
  if (result.state === 'failed' && coordinator.isLatest(documentKey, result.token)) {
    input.setStatus('建议稿读取未完成，请重试。');
  }
}
