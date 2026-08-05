import { readFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import {
  loadCandidateList,
  type CandidateReviewLoader,
} from '../../apps/desktop/renderer/src/features/writing/candidate-review-loader.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('M10-12 Renderer生成刷新代次', () => {
  it('请求完成前代次失效时不提交旧候选列表', async () => {
    const pending = deferred<unknown>();
    const setCandidates = vi.fn();
    let current = true;
    const loader = {
      bridge: {
        candidate: {
          list: () => pending.promise,
        },
      } as unknown as RendererBridgeAdapter,
      projectId: 'project-a',
      chapterId: 'chapter-old',
      setCandidates,
      setStatus: vi.fn(),
    } as unknown as CandidateReviewLoader;

    const loading = loadCandidateList(loader, () => current);
    current = false;
    pending.resolve({
      state: 'success',
      data: { candidates: [{ candidateId: 'candidate-old' }] },
    });

    await expect(loading).resolves.toEqual([{ candidateId: 'candidate-old' }]);
    expect(setCandidates).not.toHaveBeenCalled();
  });

  it('候选工作台在新请求开始和卸载时使旧刷新失效', async () => {
    const source = await readFile(
      'apps/desktop/renderer/src/features/writing/candidate-review-panel.tsx',
      'utf8',
    );

    expect(source).toContain('const generationEpoch = useRef(0);');
    expect(source).toContain('generationEpoch.current += 1;');
    expect(source).toContain('loadCandidateList(loader, isCurrent)');
    expect(source).toContain('if (!isCurrent()) return;');
  });
});
