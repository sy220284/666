import type { GenerationRun } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';

export function useGenerationRunActions({
  activeRun,
  bridge,
  projectId,
  refreshCandidates,
  setActiveRun,
  setStatus,
}: {
  readonly activeRun: GenerationRun | null;
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly refreshCandidates: () => Promise<unknown>;
  readonly setActiveRun: (run: GenerationRun) => void;
  readonly setStatus: (status: string) => void;
}) {
  const cancelGeneration = async (): Promise<void> => {
    if (!activeRun) return;
    const outcome = await bridge.generation.cancel({ projectId, runId: activeRun.runId });
    if (outcome.state !== 'success') return;
    setActiveRun(outcome.data);
    setStatus(
      outcome.data.partialStatus === 'available'
        ? '生成已取消；可保存或丢弃已收到的部分。'
        : '生成已取消。',
    );
  };

  const decidePartial = async (decision: 'save' | 'discard'): Promise<void> => {
    if (!activeRun) return;
    const input = { projectId, runId: activeRun.runId };
    const outcome =
      decision === 'save'
        ? await bridge.generation.savePartial(input)
        : await bridge.generation.discardPartial(input);
    if (outcome.state !== 'success') return;
    setActiveRun(outcome.data.run);
    setStatus(decision === 'save' ? '部分结果已保存为受限候选。' : '部分结果已丢弃。');
    await refreshCandidates();
  };

  return { cancelGeneration, decidePartial };
}
