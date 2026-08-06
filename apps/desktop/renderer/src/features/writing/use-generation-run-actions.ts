import type { GenerationRun } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import {
  rendererCommandCoordinatorFor,
  type RendererCommandScope,
} from '../../runtime/command-coordinator.js';

export function useGenerationRunActions({
  activeRun,
  bridge,
  projectId,
  commandPrefix,
  setPending,
  refreshCandidates,
  setActiveRun,
  setStatus,
}: {
  readonly activeRun: GenerationRun | null;
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly commandPrefix: string;
  readonly setPending: (pending: boolean) => void;
  readonly refreshCandidates: (canCommit?: () => boolean) => Promise<unknown>;
  readonly setActiveRun: (run: GenerationRun) => void;
  readonly setStatus: (status: string) => void;
}) {
  const runGenerationAction = async (
    operation: (scope: RendererCommandScope) => Promise<void>,
  ): Promise<void> => {
    const coordinator = rendererCommandCoordinatorFor(setPending);
    const commandKey = `${commandPrefix}generation-run-action`;
    const result = await coordinator.run({ key: commandKey, policy: 'reject', operation });
    if (result.state === 'rejected') {
      setStatus('已有生成任务操作正在处理，请完成后再试。');
      return;
    }
    if (result.state === 'failed' && coordinator.isLatest(commandKey, result.token)) {
      setStatus('生成任务操作未完成，请重试。');
    }
  };

  const cancelGeneration = async (): Promise<void> => {
    if (!activeRun) return;
    await runGenerationAction(async (scope) => {
      const outcome = await bridge.generation.cancel({ projectId, runId: activeRun.runId });
      if (!scope.isCurrent() || outcome.state !== 'success') return;
      setActiveRun(outcome.data);
      setStatus(
        outcome.data.partialStatus === 'available'
          ? '生成已取消；可保存或丢弃已收到的部分。'
          : '生成已取消。',
      );
    });
  };

  const decidePartial = async (decision: 'save' | 'discard'): Promise<void> => {
    if (!activeRun) return;
    await runGenerationAction(async (scope) => {
      const input = { projectId, runId: activeRun.runId };
      const outcome =
        decision === 'save'
          ? await bridge.generation.savePartial(input)
          : await bridge.generation.discardPartial(input);
      if (!scope.isCurrent() || outcome.state !== 'success') return;
      setActiveRun(outcome.data.run);
      setStatus(decision === 'save' ? '部分结果已保存为受限候选。' : '部分结果已丢弃。');
      await refreshCandidates(scope.isCurrent);
    });
  };

  return { cancelGeneration, decidePartial };
}
